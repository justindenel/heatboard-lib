import type { ActionResult } from "../errors";
import { replaceHeat } from "../internal/bracket";
import { deepEqual } from "../internal/equal";
import { fail, ok } from "../internal/result";
import type { Bracket, Heat } from "../model";
import { findHeat, scoringOf } from "../queries";
import type { Penalty, PenaltyKind } from "../scoring/model";
import { lookupRunning } from "./ranking";

export const MAX_PENALTIES = 50;

const KINDS: ReadonlySet<PenaltyKind> = new Set([
	"halfSecondBest",
	"zeroSecondBest",
	"zeroBest",
]);

/** Replaces the penalty list of a running heat; an empty list removes it. */
export function setPenalties(
	bracket: Bracket,
	heatId: string,
	penalties: Penalty[],
): ActionResult {
	const known = findHeat(bracket, heatId);
	if (!known) {
		return fail("UNKNOWN_HEAT", `Unknown heat "${heatId}"`, { heatId });
	}
	if (!scoringOf(bracket, known.heat)) {
		return fail("NO_SCORING", "The bracket has no scoring config", {
			heatId,
		});
	}
	const looked = lookupRunning(bracket, heatId);
	if ("refused" in looked) return looked.refused;
	const { found } = looked;
	if (penalties.length > MAX_PENALTIES) {
		return fail(
			"INVALID_PENALTY",
			`A heat holds at most ${MAX_PENALTIES} penalties, got ${penalties.length}`,
			{ heatId, count: penalties.length },
		);
	}
	const riderIds = new Set(found.heat.slots.map((s) => s.riderId));
	for (const penalty of penalties) {
		if (typeof penalty.type !== "string" || penalty.type === "") {
			return fail("INVALID_PENALTY", "A penalty needs a category type", {
				heatId,
				riderId: penalty.riderId,
			});
		}
		if (!KINDS.has(penalty.kind)) {
			return fail(
				"INVALID_PENALTY",
				`Unknown penalty kind "${String(penalty.kind)}"`,
				{ heatId, riderId: penalty.riderId },
			);
		}
		if (!riderIds.has(penalty.riderId)) {
			return fail(
				"RIDER_NOT_IN_HEAT",
				`Rider "${penalty.riderId}" is not in heat "${heatId}"`,
				{ heatId, riderId: penalty.riderId },
			);
		}
	}
	if (deepEqual(found.heat.penalties ?? [], penalties)) return ok(bracket);
	const updated: Heat = { ...found.heat };
	if (penalties.length === 0) delete updated.penalties;
	else updated.penalties = penalties.map((p) => ({ ...p }));
	return ok(replaceHeat(bracket, found, updated));
}

/** Appends one penalty to the heat; unlike `setPenalties`, two editors adding at once both land. */
export function addPenalty(
	bracket: Bracket,
	heatId: string,
	penalty: Penalty,
): ActionResult {
	const current = findHeat(bracket, heatId)?.heat.penalties ?? [];
	return setPenalties(bracket, heatId, [...current, penalty]);
}

/** Removes the first penalty equal to `penalty`; a no-op when there is none. */
export function removePenalty(
	bracket: Bracket,
	heatId: string,
	penalty: Penalty,
): ActionResult {
	const current = findHeat(bracket, heatId)?.heat.penalties ?? [];
	const index = current.findIndex((p) => deepEqual(p, penalty));
	return setPenalties(
		bracket,
		heatId,
		index === -1 ? current : current.filter((_, i) => i !== index),
	);
}
