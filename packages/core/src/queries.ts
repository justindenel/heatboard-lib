import type {
	Bracket,
	Heat,
	HeatSlot,
	HeatStatus,
	JudgingMode,
	ParticipantStatus,
	RaceTiming,
	Round,
	ViewerDisplay,
} from "./model";
import { deepEqual } from "./internal/equal";
import type { ScoringConfig } from "./scoring/model";

export interface FoundHeat {
	round: Round;
	roundIndex: number;
	heat: Heat;
	heatIndex: number;
}

export interface RiderPathStep {
	roundId: string;
	heatId: string;
	rank: number | null;
	status?: ParticipantStatus;
}

/** Locates a heat by id along with its round and positions. */
export function findHeat(
	bracket: Bracket,
	heatId: string,
): FoundHeat | undefined {
	for (const [roundIndex, round] of bracket.rounds.entries()) {
		const heatIndex = round.heats.findIndex((heat) => heat.id === heatId);
		const heat = round.heats[heatIndex];
		if (heat) return { round, roundIndex, heat, heatIndex };
	}
	return undefined;
}

type RoundWithHeats = { heats: unknown[] };

export interface NumberedHeat<R extends RoundWithHeats = Round> {
	round: R;
	roundIndex: number;
	heat: R["heats"][number];
	heatIndex: number;
	/** Bracket-wide number, from 1. */
	number: number;
}

/** Every heat in planned running order (rounds in order, heats in order) with its number. */
export function numberedHeats<R extends RoundWithHeats>(bracket: {
	rounds: R[];
}): NumberedHeat<R>[] {
	const heats: NumberedHeat<R>[] = [];
	for (const [roundIndex, round] of bracket.rounds.entries()) {
		for (const [heatIndex, heat] of round.heats.entries()) {
			heats.push({
				round,
				roundIndex,
				heat,
				heatIndex,
				number: heats.length + 1,
			});
		}
	}
	return heats;
}

/** Number of each heat by id, 1..N across the whole bracket; computed, never stored. */
export function heatNumbers(bracket: {
	rounds: Round[];
}): Record<string, number> {
	return Object.fromEntries(
		numberedHeats(bracket).map((found) => [found.heat.id, found.number]),
	);
}

export interface HeatClock {
	startedAt?: string;
	durationSec?: number;
	elapsedSec?: number;
	remainingSec?: number;
}

/** Timer state of a heat at `now` (ISO); elapsed is floored to whole seconds and never negative, remaining stops at 0. */
export function heatClock(
	bracket: Bracket,
	heatId: string,
	now: string,
): HeatClock {
	const found = findHeat(bracket, heatId);
	if (!found) return {};
	const clock: HeatClock = {};
	const { startedAt } = found.heat;
	const durationSec = raceFormatOf(bracket, found.heat).timing.heatDurationSec;
	if (startedAt !== undefined) clock.startedAt = startedAt;
	if (durationSec !== undefined) clock.durationSec = durationSec;
	if (startedAt === undefined) return clock;
	const elapsedMs = Date.parse(now) - Date.parse(startedAt);
	if (!Number.isFinite(elapsedMs)) return clock;
	clock.elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
	if (durationSec !== undefined) {
		clock.remainingSec = Math.max(0, durationSec - clock.elapsedSec);
	}
	return clock;
}

/** Rider ids ranked within the advancing count of the heat's round, sorted by rank. */
export function getQualified(bracket: Bracket, heatId: string): string[] {
	const found = findHeat(bracket, heatId);
	if (!found) return [];
	const { round, heat } = found;
	return heat.slots
		.filter(
			(slot): slot is HeatSlot & { rank: number } =>
				slot.status === undefined &&
				slot.rank !== null &&
				slot.rank <= round.advancing,
		)
		.sort((a, b) => a.rank - b.rank)
		.map((slot) => slot.riderId);
}

/** Every slot a rider holds, in chronological round order. */
export function getRiderPath(
	bracket: Bracket,
	riderId: string,
): RiderPathStep[] {
	const path: RiderPathStep[] = [];
	for (const round of bracket.rounds) {
		for (const heat of round.heats) {
			const slot = heat.slots.find((s) => s.riderId === riderId);
			if (!slot) continue;
			const step: RiderPathStep = {
				roundId: round.id,
				heatId: heat.id,
				rank: slot.rank,
			};
			if (slot.status !== undefined) step.status = slot.status;
			path.push(step);
		}
	}
	return path;
}

/** Riders without status in the order the heat shows them before any rank: `order` first, then the remaining slots. */
export function provisionalOrder(heat: Heat): string[] {
	const open = heat.slots.filter((s) => s.status === undefined);
	const known = new Set(open.map((s) => s.riderId));
	const listed = (heat.order ?? []).filter((id) => known.has(id));
	const seen = new Set(listed);
	return [
		...listed,
		...open.map((s) => s.riderId).filter((id) => !seen.has(id)),
	];
}

/** Judging mode in force for the bracket; absent means `free`. */
export function judgingModeOf(bracket: Bracket): JudgingMode {
	return bracket.judgingMode ?? "free";
}

/** Scoring that applies to a heat: its snapshot once started, else the bracket's current one. */
export function scoringOf(
	bracket: Bracket,
	heat: Heat,
): ScoringConfig | undefined {
	return heat.scoring ?? bracket.scoring;
}

/** Everything that frames how a heat is run and scored. */
export interface RaceFormat {
	timing: RaceTiming;
	scoring?: ScoringConfig;
	judgingMode: JudgingMode;
}

/** Format in force for a heat of the bracket right now: what a heat starting at this instant would take. */
export function currentRaceFormat(bracket: Bracket): RaceFormat {
	const format: RaceFormat = {
		timing: bracket.timing ?? {},
		judgingMode: judgingModeOf(bracket),
	};
	if (bracket.scoring) format.scoring = bracket.scoring;
	return format;
}

/** Race format that applies to a heat: its snapshot once it has started, else the one in force. */
export function raceFormatOf(bracket: Bracket, heat: Heat): RaceFormat {
	const current = currentRaceFormat(bracket);
	return {
		timing: heat.timing ?? current.timing,
		...((heat.scoring ?? current.scoring) && {
			scoring: heat.scoring ?? current.scoring,
		}),
		judgingMode: heat.judgingMode ?? current.judgingMode,
	};
}

/** Both formats restricted to the timing fields they both carry: simulated heats have no duration, which is not a difference. */
function sameFormatIgnoringMissingTiming(a: RaceFormat, b: RaceFormat) {
	const shared = Object.keys(a.timing).filter((key) => key in b.timing);
	const pick = (timing: RaceFormat["timing"]) =>
		Object.fromEntries(
			shared.map((key) => [key, timing[key as keyof typeof timing]]),
		);
	return deepEqual(
		{ ...a, timing: pick(a.timing) },
		{ ...b, timing: pick(b.timing) },
	);
}

/**
 * Why a started heat deserves a marker: it ran with a format other than the one in force now
 * (`current`), or other than the previous started heat in running order (`previous`).
 * Heats without a snapshot (not started) never differ.
 */
export function raceFormatDrift(
	bracket: Bracket,
	heatId: string,
): "current" | "previous" | undefined {
	const started = numberedHeats(bracket).filter(
		({ heat }) => heat.timing !== undefined,
	);
	const index = started.findIndex(({ heat }) => heat.id === heatId);
	const found = started[index];
	if (!found) return undefined;
	const mine = raceFormatOf(bracket, found.heat);
	if (!sameFormatIgnoringMissingTiming(mine, currentRaceFormat(bracket))) {
		return "current";
	}
	const before = started[index - 1];
	if (
		before &&
		!sameFormatIgnoringMissingTiming(mine, raceFormatOf(bracket, before.heat))
	) {
		return "previous";
	}
	return undefined;
}

/** Spectator display settings with the defaults of the scoring method applied. */
export function viewerDisplayOf(bracket: Bracket): Required<ViewerDisplay> {
	const method = bracket.scoring?.method;
	const set = bracket.viewerDisplay ?? {};
	return {
		typeSubtotals: set.typeSubtotals ?? true,
		rides: set.rides ?? method === "rideMeans",
		judgePlaces: set.judgePlaces ?? true,
		judges: set.judges ?? false,
	};
}

type StatusRound = { heats: { status: HeatStatus }[] };

/** The bracket has a heat in the water. */
export function hasRunningHeat(bracket: { rounds: StatusRound[] }): boolean {
	return bracket.rounds.some((round) =>
		round.heats.some((heat) => heat.status === "running"),
	);
}

export type RoundState = "upcoming" | "live" | "done";

/** `done` once every heat is judged or locked; `live` as soon as one has started; `upcoming` for a round with no heat or none started. */
export function roundState(round: StatusRound): RoundState {
	const { heats } = round;
	if (heats.length === 0 || heats.every((h) => h.status === "pending")) {
		return "upcoming";
	}
	return heats.every((h) => h.status === "judged" || h.status === "locked")
		? "done"
		: "live";
}

/** Heats of the round that are judged or locked, out of all its heats. */
export function roundProgress(round: StatusRound): {
	finished: number;
	total: number;
} {
	return {
		finished: round.heats.filter(
			(h) => h.status === "judged" || h.status === "locked",
		).length,
		total: round.heats.length,
	};
}

/** The round with a running heat, else the latest started one, else the first. */
export function defaultOpenRoundId(
	rounds: (StatusRound & { id: string })[],
): string | undefined {
	const live = rounds.find((r) => r.heats.some((h) => h.status === "running"));
	if (live) return live.id;
	const started = rounds.filter((r) => roundState(r) !== "upcoming");
	return (started.at(-1) ?? rounds[0])?.id;
}

type PickableRound = {
	heats: { status: HeatStatus; slots: unknown[] }[];
};

export interface HeatRef<R extends PickableRound> {
	round: R;
	heat: R["heats"][number];
	/** Zero-based position of the heat in its round. */
	heatIndex: number;
}

function firstHeat<R extends PickableRound>(
	rounds: R[],
	matches: (heat: R["heats"][number]) => boolean,
): HeatRef<R> | undefined {
	for (const round of rounds) {
		for (const [heatIndex, heat] of round.heats.entries()) {
			if (matches(heat)) return { round, heat, heatIndex };
		}
	}
	return undefined;
}

/** First running heat in round order. */
export function pickLiveHeat<R extends PickableRound>(
	rounds: R[],
): HeatRef<R> | undefined {
	return firstHeat(rounds, (heat) => heat.status === "running");
}

/** First pending heat in round order, empty heats excluded (their riders are not known yet). */
export function pickNextHeat<R extends PickableRound>(
	rounds: R[],
): HeatRef<R> | undefined {
	return firstHeat(
		rounds,
		(heat) => heat.status === "pending" && heat.slots.length > 0,
	);
}
