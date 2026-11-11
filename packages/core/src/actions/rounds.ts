import type { ActionResult } from "../errors";
import { mapHeats } from "../internal/bracket";
import { withChain } from "../internal/chain";
import { formatLocked } from "../internal/format";
import { fail, ok } from "../internal/result";
import type { Bracket, Heat, HeatSlot } from "../model";
import { destructive, judgedHeats } from "./review";

export function setMaxPerHeat(
	bracket: Bracket,
	roundId: string,
	max: number,
): ActionResult {
	const index = bracket.rounds.findIndex((r) => r.id === roundId);
	const round = bracket.rounds[index];
	if (!round) {
		return fail("UNKNOWN_ROUND", `Unknown round "${roundId}"`, { roundId });
	}
	if (!Number.isInteger(max) || max < 1) {
		return fail(
			"INVALID_MAX",
			`Max per heat must be an integer >= 1, got ${max}`,
			{
				roundId,
				max,
			},
		);
	}
	const crowded = round.heats.find((h) => h.slots.length > max);
	if (crowded) {
		return fail(
			"MAX_BELOW_CURRENT",
			`Heat "${crowded.id}" holds ${crowded.slots.length} riders, more than ${max}`,
			{ roundId, heatId: crowded.id, max, current: crowded.slots.length },
		);
	}
	if (round.maxPerHeat === max) return ok(bracket);
	const locked = formatLocked(bracket, "setMaxPerHeat");
	if (locked) return locked;
	const rounds = bracket.rounds.map((r, i) =>
		i === index ? { ...r, maxPerHeat: max } : r,
	);
	return ok({ ...bracket, rounds });
}

function isCleanSlot(slot: HeatSlot): boolean {
	return (
		slot.rank === null &&
		slot.status === undefined &&
		slot.overridden === undefined
	);
}

function isCleanHeat(heat: Heat): boolean {
	return (
		heat.status === "pending" &&
		heat.needsReview === undefined &&
		heat.order === undefined &&
		heat.startedAt === undefined &&
		heat.endedAt === undefined &&
		heat.penalties === undefined &&
		heat.scoring === undefined &&
		heat.timing === undefined &&
		heat.judgingMode === undefined &&
		heat.slots.every(isCleanSlot)
	);
}

/** `keepRounds: 0` is valid and empties every heat. */
export function reset(
	bracket: Bracket,
	keepRounds: number,
	confirm: boolean,
): ActionResult {
	if (!Number.isInteger(keepRounds) || keepRounds < 0) {
		return fail(
			"INVALID_ARGUMENT",
			`keepRounds must be an integer >= 0, got ${keepRounds}`,
			{ keepRounds },
		);
	}
	const preparing =
		bracket.status === "draft" || bracket.status === "published";
	const judged = judgedHeats(bracket);
	if (!preparing && judged.length > 0 && !confirm) {
		return destructive(judged.length);
	}
	const cleared = mapHeats(bracket, (heat, _round, roundIndex) => {
		const kept = roundIndex < keepRounds;
		if (isCleanHeat(heat) && (kept || heat.slots.length === 0)) return heat;
		const cleaned: Heat = { ...heat, status: "pending" };
		delete cleaned.needsReview;
		delete cleaned.order;
		delete cleaned.startedAt;
		delete cleaned.endedAt;
		delete cleaned.penalties;
		delete cleaned.scoring;
		delete cleaned.timing;
		delete cleaned.judgingMode;
		cleaned.slots = kept
			? heat.slots.map((s) =>
					isCleanSlot(s) ? s : { riderId: s.riderId, rank: null },
				)
			: [];
		return cleaned;
	});
	return ok(withChain(cleared, {}));
}
