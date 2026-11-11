import type { ActionResult } from "../errors";
import { replaceHeat, withSlots } from "../internal/bracket";
import { fail } from "../internal/result";
import type { Bracket, Heat } from "../model";
import type { HeatData } from "../lifecycle/scoring";
import { findHeat, raceFormatOf, scoringOf } from "../queries";
import { computeHeatResult } from "../scoring/compute";
import { rankingFromResult } from "../scoring/ranking";
import { setHeatStatus } from "./heats";
import { lookupRunning, ranksFromOrder } from "./ranking";

/** True when every rider without status was ranked by hand (`overridden`) and the ranks form 1..n. */
export function hasManualRanks(heat: Heat): boolean {
	const rankable = heat.slots.filter((s) => s.status === undefined);
	if (rankable.length === 0) return false;
	const ranks = rankable.map((s) => s.rank);
	return (
		rankable.every((s) => s.overridden === true) &&
		[...ranks]
			.sort((x, y) => (x ?? 0) - (y ?? 0))
			.every((rank, i) => rank === i + 1)
	);
}

/**
 * Judges a running heat. Ranks set by hand win over the scores, which lets the chief judge break a tie;
 * otherwise the heat is ranked from its scores, leaving out riders with a status.
 */
export function judgeHeatFromScores(
	bracket: Bracket,
	heatId: string,
	data: HeatData,
): ActionResult {
	const known = findHeat(bracket, heatId);
	if (!known) {
		return fail("UNKNOWN_HEAT", `Unknown heat "${heatId}"`, { heatId });
	}
	const scoring = scoringOf(bracket, known.heat);
	if (!scoring) {
		return fail("NO_SCORING", "The bracket has no scoring config", {
			heatId,
		});
	}
	const looked = lookupRunning(bracket, heatId);
	if ("refused" in looked) return looked.refused;
	const { found } = looked;
	if (hasManualRanks(found.heat))
		return setHeatStatus(bracket, heatId, "judged");
	const riderIds = found.heat.slots
		.filter((s) => s.status === undefined)
		.map((s) => s.riderId);
	const result = computeHeatResult(
		scoring,
		riderIds,
		data.rides,
		data.scores,
		found.heat.penalties ?? [],
		{ judgingMode: raceFormatOf(bracket, found.heat).judgingMode },
	);
	const ranking = rankingFromResult(result);
	if (!ranking.ok) {
		return fail(
			"UNRESOLVED_TIE",
			`Heat "${heatId}" has riders tied after scoring`,
			{ heatId, tiedRiderIds: ranking.tiedRiderIds },
		);
	}
	const slots = ranksFromOrder(found.heat, ranking.riderIds, false);
	if (!slots) {
		return fail(
			"INVALID_RANKS",
			`Ranking for heat "${heatId}" must list each rider without status exactly once`,
			{ heatId },
		);
	}
	const ranked = replaceHeat(bracket, found, withSlots(found.heat, slots));
	return setHeatStatus(ranked, heatId, "judged");
}
