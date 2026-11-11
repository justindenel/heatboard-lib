import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	computeHeatResult,
	findHeat,
	judgingModeOf,
	scoringOf,
	type Bracket,
	type JudgingMode,
	type Ride,
	type RiderResult,
	type Score,
} from "@heatboard/core";
import { defaultActionId } from "./useBracket";

/** The notes of one judge for one heat; always sent and received whole. */
export interface JudgeNotes {
	rides: Ride[];
	scores: Score[];
}

/** What the head judge sees of a heat: the announced rides and the scores of every judge (read only). */
export interface AnnouncedRides {
	rides: Ride[];
	scores: Score[];
}

export interface JudgingServer {
	/**
	 * Notes of this judge for the heat; empty sets are `{ rides: [], scores: [] }`.
	 * In head-judge mode `rides` are all the rides announced so far (shared by every judge)
	 * and `scores` only this judge's.
	 */
	load: (heatId: string, judgeId: string) => Promise<JudgeNotes>;
	/**
	 * Replaces the whole note set of this judge for the heat; must be idempotent. Reject with `JudgingRevokedError` when the judge slot was revoked.
	 * In head-judge mode only `scores` is read: a judge never creates rides.
	 */
	save: (heatId: string, judgeId: string, notes: JudgeNotes) => Promise<void>;
	/** Head-judge mode, head judge side: announced rides and every judge's scores. */
	loadRides?: (heatId: string) => Promise<AnnouncedRides>;
	/**
	 * Head-judge mode, head judge side: replaces the announced rides of the heat; must be idempotent.
	 * The server drops the scores of every ride that no longer exists.
	 */
	saveRides?: (heatId: string, rides: Ride[]) => Promise<void>;
	/**
	 * Calls `onChange` whenever the heat's rides or scores change remotely, so announced rides arrive
	 * at once; returns the unsubscribe function. The periodic sync keeps running as a fallback.
	 */
	subscribe?: (heatId: string, onChange: () => void) => () => void;
}

const REVOKED_CODE = "JUDGE_REVOKED";

/** Rejection that tells the hook the judge slot no longer has access. */
export class JudgingRevokedError extends Error {
	readonly code = REVOKED_CODE;
	constructor(message = "Judge access revoked") {
		super(message);
		this.name = "JudgingRevokedError";
	}
}

/** Matches by `code`, so errors coming from another bundle or a serialized response count too. */
export function isJudgingRevoked(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		(error as { code?: unknown }).code === REVOKED_CODE
	);
}

export type JudgingStatus =
	"loading" | "synced" | "saving" | "diverged" | "revoked";

export type JudgingDisabledReason = "loading" | "notRunning" | "revoked";

export interface UseJudgingParams {
	bracket: Bracket;
	heatId: string;
	/** Opaque id of the judge slot, given by the host. */
	judgeId: string;
	server: JudgingServer;
	/** Period of the retry and reload loop (default 10 s). */
	syncIntervalMs?: number;
	/** Ids of new rides (default: random UUIDs). */
	createId?: () => string;
	/** Timestamp of new notes (default: the current time as ISO). */
	now?: () => string;
}

export interface NewNote {
	riderId: string;
	type: string;
	figure?: string;
	/** Code of a variant accepted by `figure`. */
	variant?: string;
	value: number;
}

export interface NoteChanges {
	value?: number;
	type?: string;
	/** `undefined` keeps the figure; `null` clears it. */
	figure?: string | null;
	/** `undefined` keeps the variant; `null` clears it. */
	variant?: string | null;
}

export interface JudgingController {
	status: JudgingStatus;
	/** Last failure of a save or reload; cleared by the next success. */
	error: unknown;
	/** True once the notes of the judge were loaded. */
	ready: boolean;
	canEdit: boolean;
	disabledReason: JudgingDisabledReason | null;
	notes: JudgeNotes;
	/** This judge's standing per rider, computed on this judge's notes only. */
	standings: Record<string, RiderResult>;
	/** Judging mode in force for the heat's round. */
	mode: JudgingMode;
	/** Head-judge mode: announced rides this judge has not answered, oldest first. */
	queue: Ride[];
	/** Head-judge mode: gives the note of an announced ride, or `null` for "not seen"; also edits an existing one. Returns false when refused. */
	scoreRide: (rideId: string, value: number | null) => boolean;
	/** Head-judge mode: shorthand for `scoreRide(rideId, null)`. */
	markUnseen: (rideId: string) => boolean;
	/** Free mode: returns the id of the note (its ride id), or `null` when editing is disabled. */
	addNote: (note: NewNote) => string | null;
	editNote: (noteId: string, changes: NoteChanges) => boolean;
	deleteNote: (noteId: string) => boolean;
	/** Removes the most recently created note; returns its id. */
	undoLast: () => string | null;
	/** Reloads or retries now instead of waiting for the next period. */
	sync: () => void;
}

const EMPTY_NOTES: JudgeNotes = { rides: [], scores: [] };
const DEFAULT_SYNC_INTERVAL_MS = 10_000;

/** In head-judge mode the rides belong to the head judge: only the scores can diverge. */
const serialize = (notes: JudgeNotes, mode: JudgingMode) =>
	JSON.stringify(mode === "headJudge" ? notes.scores : notes);

interface Session {
	notes: JudgeNotes;
	confirmed: string;
	loaded: boolean;
	inFlight: boolean;
	reloadPending: boolean;
	pullAfterFailure: boolean;
	revoked: boolean;
	run: (reload: boolean) => void;
}

/**
 * Headless state of one judge on one heat. The local notes are the source for
 * the UI; every change sends the whole set, and a periodic pass retries a
 * failed save or reloads the remote state. There is no action queue.
 */
export function useJudging(params: UseJudgingParams): JudgingController {
	const { bracket, heatId, judgeId, server } = params;
	const found = findHeat(bracket, heatId);
	const mode: JudgingMode = found ? judgingModeOf(bracket) : "free";
	const syncIntervalMs = params.syncIntervalMs ?? DEFAULT_SYNC_INTERVAL_MS;

	const [notes, setNotes] = useState<JudgeNotes>(EMPTY_NOTES);
	const [ready, setReady] = useState(false);
	const [status, setStatus] = useState<JudgingStatus>("loading");
	const [error, setError] = useState<unknown>(null);

	const sessionKey = `${heatId}\n${judgeId}\n${mode}`;
	const [currentKey, setCurrentKey] = useState(sessionKey);
	if (currentKey !== sessionKey) {
		setCurrentKey(sessionKey);
		setNotes(EMPTY_NOTES);
		setReady(false);
		setStatus("loading");
		setError(null);
	}

	const session = useRef<Session>({
		notes: EMPTY_NOTES,
		confirmed: serialize(EMPTY_NOTES, "free"),
		loaded: false,
		inFlight: false,
		reloadPending: false,
		pullAfterFailure: false,
		revoked: false,
		run: () => undefined,
	});
	const latest = useRef({ params, canEdit: false, mode });
	useEffect(() => {
		latest.current.params = params;
		latest.current.mode = mode;
	});

	useEffect(() => {
		let active = true;
		const s = session.current;
		s.notes = EMPTY_NOTES;
		s.confirmed = serialize(EMPTY_NOTES, mode);
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

		const dirty = () => serialize(s.notes, mode) !== s.confirmed;

		const flushReload = () => {
			if (!s.reloadPending || s.revoked || dirty()) return;
			s.reloadPending = false;
			pull();
		};

		const push = () => {
			const snapshot: JudgeNotes =
				mode === "headJudge" ? { rides: [], scores: s.notes.scores } : s.notes;
			const sent = s.notes;
			s.inFlight = true;
			setStatus("saving");
			server.save(heatId, judgeId, snapshot).then(
				() => {
					if (!active) return;
					s.inFlight = false;
					s.confirmed = serialize(sent, mode);
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
					if (mode === "headJudge" && !isJudgingRevoked(reason))
						s.pullAfterFailure = true;
					fail(reason);
					flushReload();
				},
			);
		};

		const pull = (keepLocal = false) => {
			s.inFlight = true;
			s.pullAfterFailure = false;
			const before = s.notes;
			server.load(heatId, judgeId).then(
				(remote) => {
					if (!active) return;
					s.inFlight = false;
					if (mode === "headJudge") {
						// Rides come from the head judge and replace the local ones; an edit made
						// while loading wins over the remote scores, and scores of vanished rides go.
						const keep = new Set(remote.rides.map((r) => r.id));
						const scores = (
							!keepLocal && s.notes.scores === before.scores
								? remote.scores
								: s.notes.scores
						).filter((score) => keep.has(score.rideId));
						s.notes = { rides: remote.rides, scores };
						setNotes(s.notes);
						s.confirmed = serialize(remote, mode);
					} else {
						// An edit made while loading wins: it is sent right after.
						if (s.notes === before) {
							s.notes = remote;
							setNotes(remote);
						}
						s.confirmed = serialize(remote, mode);
					}
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
		const unsubscribe =
			mode === "headJudge"
				? server.subscribe?.(heatId, () => s.run(true))
				: undefined;
		return () => {
			active = false;
			clearInterval(timer);
			unsubscribe?.();
			s.run = () => undefined;
		};
	}, [heatId, judgeId, mode, server, syncIntervalMs]);

	const heat = found?.heat;
	const scoring = heat ? scoringOf(bracket, heat) : undefined;

	let disabledReason: JudgingDisabledReason | null = null;
	if (status === "revoked") disabledReason = "revoked";
	else if (!ready) disabledReason = "loading";
	else if (heat?.status !== "running") disabledReason = "notRunning";
	const canEdit = disabledReason === null && scoring !== undefined;
	useEffect(() => {
		latest.current.canEdit = canEdit;
	});

	const standings = useMemo((): Record<string, RiderResult> => {
		if (!scoring || !heat) return {};
		const riderIds = heat.slots
			.filter((slot) => slot.status === undefined)
			.map((slot) => slot.riderId);
		const result = computeHeatResult(
			scoring,
			riderIds,
			notes.rides,
			notes.scores,
			[],
			{ judgingMode: mode },
		);
		return Object.fromEntries(result.riders.map((r) => [r.riderId, r]));
	}, [scoring, heat, notes, mode]);

	const queue = useMemo(() => {
		if (mode !== "headJudge") return [];
		const answered = new Set(notes.scores.map((s) => s.rideId));
		return notes.rides
			.filter((r) => !answered.has(r.id))
			.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
	}, [mode, notes]);

	const commit = useCallback(
		(next: JudgeNotes) => {
			const s = session.current;
			s.notes = next;
			setNotes(next);
			s.run(false);
		},
		[setNotes],
	);

	const addNote = useCallback(
		(note: NewNote): string | null => {
			if (!latest.current.canEdit || latest.current.mode === "headJudge") {
				return null;
			}
			const { createId = defaultActionId, now } = latest.current.params;
			const at = now ? now() : new Date().toISOString();
			const id = createId();
			const ride: Ride = {
				id,
				riderId: note.riderId,
				type: note.type,
				at,
				...(note.figure !== undefined && { figure: note.figure }),
				...(note.variant !== undefined && { variant: note.variant }),
			};
			const score: Score = {
				rideId: id,
				judgeId: latest.current.params.judgeId,
				value: note.value,
				at,
			};
			const current = session.current.notes;
			commit({
				rides: [...current.rides, ride],
				scores: [...current.scores, score],
			});
			return id;
		},
		[commit],
	);

	const editNote = useCallback(
		(noteId: string, changes: NoteChanges): boolean => {
			const current = session.current.notes;
			if (
				!latest.current.canEdit ||
				latest.current.mode === "headJudge" ||
				!current.rides.some((r) => r.id === noteId)
			) {
				return false;
			}
			const { now } = latest.current.params;
			const at = now ? now() : new Date().toISOString();
			commit({
				rides: current.rides.map((ride) => {
					if (ride.id !== noteId) return ride;
					const {
						figure: previousFigure,
						variant: previousVariant,
						...rest
					} = ride;
					const figure =
						changes.figure === undefined ? previousFigure : changes.figure;
					const variant =
						changes.variant === undefined ? previousVariant : changes.variant;
					return {
						...rest,
						type: changes.type ?? ride.type,
						...(figure != null && { figure }),
						...(figure != null && variant != null && { variant }),
					};
				}),
				scores: current.scores.map((score) =>
					score.rideId === noteId
						? { ...score, value: changes.value ?? score.value, at }
						: score,
				),
			});
			return true;
		},
		[commit],
	);

	const deleteNote = useCallback(
		(noteId: string): boolean => {
			const current = session.current.notes;
			if (
				!latest.current.canEdit ||
				latest.current.mode === "headJudge" ||
				!current.rides.some((r) => r.id === noteId)
			) {
				return false;
			}
			commit({
				rides: current.rides.filter((r) => r.id !== noteId),
				scores: current.scores.filter((s) => s.rideId !== noteId),
			});
			return true;
		},
		[commit],
	);

	const scoreRide = useCallback(
		(rideId: string, value: number | null): boolean => {
			const current = session.current.notes;
			if (
				!latest.current.canEdit ||
				latest.current.mode !== "headJudge" ||
				!current.rides.some((r) => r.id === rideId)
			) {
				return false;
			}
			const { now, judgeId: me } = latest.current.params;
			const at = now ? now() : new Date().toISOString();
			const given: Score = { rideId, judgeId: me, value, at };
			commit({
				rides: current.rides,
				scores: [...current.scores.filter((s) => s.rideId !== rideId), given],
			});
			return true;
		},
		[commit],
	);

	const markUnseen = useCallback(
		(rideId: string) => scoreRide(rideId, null),
		[scoreRide],
	);

	const undoLast = useCallback((): string | null => {
		const last = session.current.notes.rides.at(-1);
		if (!last) return null;
		return deleteNote(last.id) ? last.id : null;
	}, [deleteNote]);

	const sync = useCallback(() => session.current.run(true), []);

	return {
		status,
		error,
		ready,
		canEdit,
		disabledReason,
		notes,
		standings,
		mode,
		queue,
		scoreRide,
		markUnseen,
		addNote,
		editNote,
		deleteNote,
		undoLast,
		sync,
	};
}
