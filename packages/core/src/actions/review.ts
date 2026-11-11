import type { ActionResult } from "../errors";
import { isJudged, mapHeats } from "../internal/bracket";
import { fail } from "../internal/result";
import type { Bracket, Heat } from "../model";

export function destructive(judged: number): ActionResult {
	return fail(
		"DESTRUCTIVE_CHANGE",
		`This change affects ${judged} judged heat(s) and needs confirmation`,
		{ judgedHeats: judged },
	);
}

export function judgedHeats(bracket: Bracket, roundId?: string): Heat[] {
	return bracket.rounds
		.filter((round) => roundId === undefined || round.id === roundId)
		.flatMap((round) => round.heats.filter(isJudged));
}

/**
 * Flags every heat of a later round that holds a rider of one of the
 * `sourceHeatIds`, plus every heat in `targetHeatIds`.
 */
export function markForReview(
	bracket: Bracket,
	sourceHeatIds: Set<string>,
	targetHeatIds: Set<string>,
): Bracket {
	const ridersBefore: Array<Set<string>> = [];
	let seen = new Set<string>();
	for (const round of bracket.rounds) {
		ridersBefore.push(seen);
		seen = new Set(seen);
		for (const heat of round.heats) {
			if (!sourceHeatIds.has(heat.id)) continue;
			for (const slot of heat.slots) seen.add(slot.riderId);
		}
	}
	return mapHeats(bracket, (heat, _round, roundIndex) => {
		if (heat.needsReview) return heat;
		const fed =
			targetHeatIds.has(heat.id) ||
			heat.slots.some((s) => ridersBefore[roundIndex]?.has(s.riderId));
		return fed ? { ...heat, needsReview: true } : heat;
	});
}
