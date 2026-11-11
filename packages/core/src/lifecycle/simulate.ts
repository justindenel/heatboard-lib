import { applyAction } from "../actions";
import type { BracketError } from "../errors";
import { replaceHeat } from "../internal/bracket";
import {
	generateHeadJudgeNotes,
	generateNotes,
	type GenerateNotesOptions,
} from "../internal/notes";
import { createRandom, shuffle } from "../internal/random";
import type { Bracket, Heat, Round } from "../model";
import {
	findHeat,
	numberedHeats,
	provisionalOrder,
	scoringOf,
} from "../queries";
import type { Ride } from "../scoring/model";
import { schedule } from "./chain";
import type { HeatData } from "./scoring";

const DEFAULT_JUDGE_IDS = ["judge1", "judge2", "judge3"];
/** Rounds of notes drawn again when a seed gives a tie the ranking cannot break. */
const MAX_TIE_RETRIES = 20;
const SEED_SPACING = 7919;

export interface SimulateRoundOptions {
	/** ISO date the simulated heats are marked as started; defaults to the current time. */
	now?: string;
	/** Judges whose notes are generated; three generic ones when absent or empty. */
	judgeIds?: string[];
}

export interface SimulatedHeat {
	heatId: string;
	/** Notes of each judge, as a real judge would have stored them. */
	byJudge: Record<string, HeatData>;
	/** Head-judge mode: the rides the head judge announced (the judges' own `rides` stay empty). */
	announcedRides?: Ride[];
}

export type SimulateRoundResult =
	| { ok: true; bracket: Bracket; heats: SimulatedHeat[] }
	| { ok: false; error: BracketError };

const refusal = (
	code: BracketError["code"],
	message: string,
	details?: BracketError["details"],
): SimulateRoundResult => ({
	ok: false,
	error: { code, message, ...(details && { details }) },
});

/** Every heat feeding this one is judged or locked, so the riders it will hold are all known. */
function ridersKnown(bracket: Bracket, heat: Heat): boolean {
	if (heat.status !== "pending" || heat.slots.length === 0) return false;
	return bracket.links.every((link) => {
		if (link.to === "eliminated" || link.to.heatId !== heat.id) return true;
		const source = findHeat(bracket, link.from.heatId)?.heat;
		return source === undefined || ["judged", "locked"].includes(source.status);
	});
}

function simulableHeatIds(round: Round, bracket: Bracket): string[] {
	return round.heats
		.filter((heat) => ridersKnown(bracket, heat))
		.map((heat) => heat.id);
}

/** Whether `simulateRound` would have at least one heat to run in this round. */
export function canSimulateRound(bracket: Bracket, roundId: string): boolean {
	const round = bracket.rounds.find((r) => r.id === roundId);
	return round !== undefined && simulableHeatIds(round, bracket).length > 0;
}

/**
 * Starts, notes and judges every pending heat of the round whose riders are known, in heat order, so
 * the qualifiers advance as in a real race. The heats run with the race format in force, minus the
 * timer: a simulated heat never ends by the clock, so the automatic chain cannot start a heat after
 * it. Deterministic for a given `drawSeed`; all or nothing. Refused with `SIMULATE_WHILE_RUNNING` while
 * a heat runs or a break counts down: simulated heats carry no timer and would take over the race
 * schedule from the heat that is really in the water.
 */
export function simulateRound(
	bracket: Bracket,
	roundId: string,
	drawSeed: number,
	options: SimulateRoundOptions = {},
): SimulateRoundResult {
	const round = bracket.rounds.find((r) => r.id === roundId);
	if (!round) {
		return refusal("UNKNOWN_ROUND", `Unknown round "${roundId}"`, { roundId });
	}
	const now = options.now ?? new Date().toISOString();
	if (raceInProgress(bracket, now)) {
		return refusal(
			"SIMULATE_WHILE_RUNNING",
			"A heat is running or a break is counting down: wait for it to end before simulating",
		);
	}
	const heatIds = simulableHeatIds(round, bracket);
	if (heatIds.length === 0) {
		return refusal(
			"NOTHING_TO_SIMULATE",
			`Round "${roundId}" has no pending heat with known riders`,
			{ roundId },
		);
	}
	const judgeIds = options.judgeIds?.length
		? options.judgeIds
		: DEFAULT_JUDGE_IDS;

	let current = bracket;
	const simulated: SimulatedHeat[] = [];
	for (const [index, heatId] of heatIds.entries()) {
		const started = applyAction(current, {
			type: "setHeatStatus",
			heatId,
			status: "running",
			at: now,
		});
		if (!started.ok) return started;
		current = withoutTimer(started.bracket, heatId);

		const seed = drawSeed + (index + 1) * SEED_SPACING;
		const judged = judgeSimulated(current, heatId, judgeIds, seed, now);
		if (!judged.ok) return judged;
		current = judged.bracket;
		if (judged.heat) simulated.push(judged.heat);
	}
	return { ok: true, bracket: current, heats: simulated };
}

function raceInProgress(bracket: Bracket, now: string): boolean {
	const { phase } = schedule(bracket, now);
	return (
		phase === "heat" ||
		phase === "break" ||
		numberedHeats(bracket).some(({ heat }) => heat.status === "running")
	);
}

function withoutTimer(bracket: Bracket, heatId: string): Bracket {
	const found = findHeat(bracket, heatId);
	if (!found?.heat.timing?.heatDurationSec) return bracket;
	const timing = { ...found.heat.timing };
	delete timing.heatDurationSec;
	return replaceHeat(bracket, found, { ...found.heat, timing });
}

type Judged =
	| { ok: true; bracket: Bracket; heat?: SimulatedHeat }
	| { ok: false; error: BracketError };

function judgeSimulated(
	bracket: Bracket,
	heatId: string,
	judgeIds: string[],
	seed: number,
	startAt: string,
): Judged {
	const found = findHeat(bracket, heatId);
	const scoring = found && scoringOf(bracket, found.heat);
	if (!found) {
		return {
			ok: false,
			error: { code: "UNKNOWN_HEAT", message: `Unknown heat "${heatId}"` },
		};
	}
	const riderIds = found.heat.slots
		.filter((slot) => slot.status === undefined)
		.map((slot) => slot.riderId);

	if (!scoring) {
		// Manual ranking: no scores exist, the order itself is drawn.
		const order = shuffle(provisionalOrder(found.heat), createRandom(seed));
		const ranked = applyAction(bracket, {
			type: "setRanks",
			heatId,
			riderIds: order,
		});
		if (!ranked.ok) return ranked;
		const judged = applyAction(ranked.bracket, {
			type: "setHeatStatus",
			heatId,
			status: "judged",
		});
		return judged.ok ? { ok: true, bracket: judged.bracket } : judged;
	}

	const headJudge = (found.heat.judgingMode ?? "free") === "headJudge";
	let refused: BracketError | undefined;
	for (let attempt = 0; attempt <= MAX_TIE_RETRIES; attempt++) {
		const noteOptions: GenerateNotesOptions = {
			scoring,
			riderIds,
			judgeIds,
			seed: seed + attempt,
			startAt,
		};
		let heat: SimulatedHeat;
		if (headJudge) {
			const { rides, scores } = generateHeadJudgeNotes({
				...noteOptions,
				leaveUnanswered: false,
			});
			heat = {
				heatId,
				announcedRides: rides,
				byJudge: Object.fromEntries(
					judgeIds.map((judgeId) => [
						judgeId,
						{ rides: [], scores: scores.filter((s) => s.judgeId === judgeId) },
					]),
				),
			};
		} else {
			heat = { heatId, byJudge: generateNotes(noteOptions) };
		}
		const all = Object.values(heat.byJudge);
		const result = applyAction(bracket, {
			type: "judgeHeatFromScores",
			heatId,
			data: {
				rides: heat.announcedRides ?? all.flatMap((n) => n.rides),
				scores: all.flatMap((n) => n.scores),
			},
		});
		if (result.ok) return { ok: true, bracket: result.bracket, heat };
		if (result.error.code !== "UNRESOLVED_TIE") return result;
		refused = result.error;
	}
	return { ok: false, error: refused as BracketError };
}
