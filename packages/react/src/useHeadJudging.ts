import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	computeHeatResult,
	findHeat,
	judgingModeOf,
	scoringOf,
	type Bracket,
	type Ride,
	type RiderResult,
	type Score,
} from "@heatboard/core";
import {
	isJudgingRevoked,
	type JudgingDisabledReason,
	type JudgingServer,
	type JudgingStatus,
} from "./useJudging";
import { defaultActionId } from "./useBracket";

export interface UseHeadJudgingParams {
	bracket: Bracket;
	heatId: string;
	server: JudgingServer;
	/** Number of judges expected to answer each ride; defaults to the judges seen in the scores. */
	judgeCount?: number;
	/** Period of the retry and reload loop (default 10 s). */
	syncIntervalMs?: number;
	/** Ids of new rides (default: random UUIDs). */
	createId?: () => string;
	/** Timestamp of new rides (default: the current time as ISO). */
	now?: () => string;
}

export interface NewRide {
	riderId: string;
	type: string;
	figure?: string;
	/** Code of a variant accepted by `figure`. */
	variant?: string;
}

export interface RideProgress {
	/** Judges who gave a note. */
	noted: number;
	/** Judges who answered "not seen". */
	unseen: number;
	/** Judges expected to answer. */
	judges: number;
}

export interface HeadJudgingController {
	status: JudgingStatus;
	error: unknown;
	ready: boolean;
	canEdit: boolean;
	disabledReason: JudgingDisabledReason | null;
	/** Announced rides, oldest first. */
	rides: Ride[];
	/** Every judge's scores on the announced rides, read only. */
	scores: Score[];
	/** Standing per rider computed on every judge's scores. */
	standings: Record<string, RiderResult>;
	progress: Record<string, RideProgress>;
	/** Returns the id of the ride, or `null` when announcing is disabled. */
	announceRide: (ride: NewRide) => string | null;
	/** Removes the ride and every judge's scores on it. */
	retractRide: (rideId: string) => boolean;
	sync: () => void;
}

const DEFAULT_SYNC_INTERVAL_MS = 10_000;

interface Session {
	rides: Ride[];
	scores: Score[];
	confirmed: string;
	loaded: boolean;
	inFlight: boolean;
	reloadPending: boolean;
	pullAfterFailure: boolean;
	revoked: boolean;
	run: (reload: boolean) => void;
}

/**
 * Headless state of the head judge on one heat. The announced rides are the
 * source of truth locally; every change sends the whole list, scores of the
 * judges are only read back. Same status, sync and revoked conventions as `useJudging`.
 */
export function useHeadJudging(
	params: UseHeadJudgingParams,
): HeadJudgingController {
	const { bracket, heatId, server } = params;
	const syncIntervalMs = params.syncIntervalMs ?? DEFAULT_SYNC_INTERVAL_MS;

	const [rides, setRides] = useState<Ride[]>([]);
	const [scores, setScores] = useState<Score[]>([]);
	const [ready, setReady] = useState(false);
	const [status, setStatus] = useState<JudgingStatus>("loading");
	const [error, setError] = useState<unknown>(null);

	const [currentKey, setCurrentKey] = useState(heatId);
	if (currentKey !== heatId) {
		setCurrentKey(heatId);
		setRides([]);
		setScores([]);
		setReady(false);
		setStatus("loading");
		setError(null);
	}

	const session = useRef<Session>({
		rides: [],
		scores: [],
		confirmed: "[]",
		loaded: false,
		inFlight: false,
		reloadPending: false,
		pullAfterFailure: false,
		revoked: false,
		run: () => undefined,
	});
	const latest = useRef({ params, canEdit: false });
	useEffect(() => {
		latest.current.params = params;
	});

	useEffect(() => {
		let active = true;
		const s = session.current;
		s.rides = [];
		s.scores = [];
		s.confirmed = "[]";
		s.loaded = false;
		s.inFlight = false;
		s.reloadPending = false;
		s.pullAfterFailure = false;
		s.revoked = false;

		const fail = (reason: unknown) => {
			setError(reason);
			if (isJudgingRevoked(reason)) {
				s.revoked = true;
				setStatus("revoked");
			} else {
				setStatus("diverged");
			}
		};
		const dirty = () => JSON.stringify(s.rides) !== s.confirmed;

		const flushReload = () => {
			if (!s.reloadPending || s.revoked || dirty()) return;
			s.reloadPending = false;
			pull();
		};

		const push = () => {
			const snapshot = s.rides;
			s.inFlight = true;
			setStatus("saving");
			const saving = server.saveRides
				? server.saveRides(heatId, snapshot)
				: Promise.reject(new Error("The server has no saveRides"));
			saving.then(
				() => {
					if (!active) return;
					s.inFlight = false;
					s.confirmed = JSON.stringify(snapshot);
					if (dirty()) {
						push();
					} else {
						s.pullAfterFailure = false;
						setStatus("synced");
						setError(null);
						flushReload();
					}
				},
				(reason: unknown) => {
					if (!active) return;
					s.inFlight = false;
					if (!isJudgingRevoked(reason)) s.pullAfterFailure = true;
					fail(reason);
					flushReload();
				},
			);
		};

		const pull = (keepLocal = false) => {
			s.inFlight = true;
			s.pullAfterFailure = false;
			const before = s.rides;
			const loading = server.loadRides
				? server.loadRides(heatId)
				: Promise.reject(new Error("The server has no loadRides"));
			loading.then(
				(remote) => {
					if (!active) return;
					s.inFlight = false;
					// A change made while loading wins: it is sent right after.
					if (!keepLocal && s.rides === before) {
						s.rides = remote.rides;
						setRides(remote.rides);
					}
					const keep = new Set(s.rides.map((r) => r.id));
					s.scores = remote.scores.filter((score) => keep.has(score.rideId));
					setScores(s.scores);
					s.confirmed = JSON.stringify(remote.rides);
					s.loaded = true;
					setReady(true);
					setError(null);
					if (dirty()) push();
					else {
						setStatus("synced");
						flushReload();
					}
				},
				(reason: unknown) => {
					if (!active) return;
					s.inFlight = false;
					fail(reason);
					flushReload();
				},
			);
		};

		s.run = (reload) => {
			if (!active || s.revoked) return;
			if (s.inFlight) {
				if (reload) s.reloadPending = true;
				return;
			}
			if (!s.loaded) pull();
			else if (dirty()) {
				if (reload && s.pullAfterFailure) pull(true);
				else push();
			} else if (reload) pull();
		};

		s.run(false);
		const timer = setInterval(() => s.run(true), syncIntervalMs);
		const unsubscribe = server.subscribe?.(heatId, () => s.run(true));
		return () => {
			active = false;
			clearInterval(timer);
			unsubscribe?.();
			s.run = () => undefined;
		};
	}, [heatId, server, syncIntervalMs]);

	const found = findHeat(bracket, heatId);
	const heat = found?.heat;
	let disabledReason: JudgingDisabledReason | null = null;
	if (status === "revoked") disabledReason = "revoked";
	else if (!ready) disabledReason = "loading";
	else if (heat?.status !== "running") disabledReason = "notRunning";
	const canEdit = disabledReason === null;
	useEffect(() => {
		latest.current.canEdit = canEdit;
	});

	const ordered = useMemo(
		() => [...rides].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
		[rides],
	);

	const standings = useMemo((): Record<string, RiderResult> => {
		const scoring = heat && scoringOf(bracket, heat);
		if (!found || !heat || !scoring) return {};
		const result = computeHeatResult(
			scoring,
			heat.slots.filter((s) => s.status === undefined).map((s) => s.riderId),
			rides,
			scores,
			heat.penalties ?? [],
			{ judgingMode: judgingModeOf(bracket) },
		);
		return Object.fromEntries(result.riders.map((r) => [r.riderId, r]));
	}, [bracket, found, heat, rides, scores]);

	const judgeCount = params.judgeCount;
	const progress = useMemo(() => {
		const seen = new Set(scores.map((s) => s.judgeId));
		const expected = judgeCount ?? seen.size;
		return Object.fromEntries(
			rides.map((ride) => {
				const own = scores.filter((s) => s.rideId === ride.id);
				const noted = own.filter((s) => s.value !== null).length;
				return [
					ride.id,
					{ noted, unseen: own.length - noted, judges: expected },
				];
			}),
		);
	}, [rides, scores, judgeCount]);

	const commit = useCallback((next: Ride[]) => {
		const s = session.current;
		s.rides = next;
		setRides(next);
		const keep = new Set(next.map((r) => r.id));
		s.scores = s.scores.filter((score) => keep.has(score.rideId));
		setScores(s.scores);
		s.run(false);
	}, []);

	const announceRide = useCallback(
		(ride: NewRide): string | null => {
			if (!latest.current.canEdit) return null;
			const { createId = defaultActionId, now } = latest.current.params;
			const id = createId();
			const announced: Ride = {
				id,
				riderId: ride.riderId,
				type: ride.type,
				at: now ? now() : new Date().toISOString(),
				...(ride.figure !== undefined && { figure: ride.figure }),
				...(ride.variant !== undefined && { variant: ride.variant }),
			};
			commit([...session.current.rides, announced]);
			return id;
		},
		[commit],
	);

	const retractRide = useCallback(
		(rideId: string): boolean => {
			const current = session.current.rides;
			if (!latest.current.canEdit || !current.some((r) => r.id === rideId)) {
				return false;
			}
			commit(current.filter((r) => r.id !== rideId));
			return true;
		},
		[commit],
	);

	const sync = useCallback(() => session.current.run(true), []);

	return {
		status,
		error,
		ready,
		canEdit,
		disabledReason,
		rides: ordered,
		scores,
		standings,
		progress,
		announceRide,
		retractRide,
		sync,
	};
}
