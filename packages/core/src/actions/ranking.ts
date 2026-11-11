import type { ActionResult } from "../errors";
import {
	makeSlot,
	renumber,
	replaceHeat,
	reuseSlot,
	withSlots,
} from "../internal/bracket";
import { fail, ok } from "../internal/result";
import type { Bracket, Heat, HeatSlot, ParticipantStatus } from "../model";
import { findHeat, provisionalOrder, type FoundHeat } from "../queries";
import { notInHeat } from "./composition";

function lookup(
	bracket: Bracket,
	heatId: string,
): { found: FoundHeat } | { refused: ActionResult } {
	const found = findHeat(bracket, heatId);
	if (!found) {
		return {
			refused: fail("UNKNOWN_HEAT", `Unknown heat "${heatId}"`, { heatId }),
		};
	}
	if (found.heat.status === "locked") {
		return {
			refused: fail("HEAT_LOCKED", `Heat "${heatId}" is locked`, { heatId }),
		};
	}
	if (found.heat.status === "judged") {
		return {
			refused: fail(
				"HEAT_JUDGED",
				`Heat "${heatId}" is judged and must be reopened first`,
				{ heatId },
			),
		};
	}
	return { found };
}

export function lookupRunning(
	bracket: Bracket,
	heatId: string,
): { found: FoundHeat } | { refused: ActionResult } {
	const looked = lookup(bracket, heatId);
	if ("refused" in looked) return looked;
	if (looked.found.heat.status !== "running") {
		return {
			refused: fail("HEAT_NOT_RUNNING", `Heat "${heatId}" is not running`, {
				heatId,
			}),
		};
	}
	return looked;
}

function commit(bracket: Bracket, found: FoundHeat, slots: HeatSlot[]) {
	return ok(replaceHeat(bracket, found, withSlots(found.heat, slots)));
}

/** Slots ranked in the given order, or `undefined` unless every rider without status is listed exactly once. */
export function ranksFromOrder(
	heat: Heat,
	riderIds: string[],
	override: boolean,
): HeatSlot[] | undefined {
	const rankable = heat.slots.filter((s) => s.status === undefined);
	const distinct = new Set(riderIds);
	const valid =
		distinct.size === riderIds.length &&
		riderIds.length === rankable.length &&
		rankable.every((s) => distinct.has(s.riderId));
	if (!valid) return undefined;
	return heat.slots.map((slot) => {
		const position = riderIds.indexOf(slot.riderId);
		if (position === -1) return slot;
		return reuseSlot(
			slot,
			makeSlot(slot.riderId, { rank: position + 1, overridden: override }),
		);
	});
}

export function setRanks(
	bracket: Bracket,
	heatId: string,
	riderIds: string[],
	override: boolean,
): ActionResult {
	const looked = lookupRunning(bracket, heatId);
	if ("refused" in looked) return looked.refused;
	const { found } = looked;
	const slots = ranksFromOrder(found.heat, riderIds, override);
	if (!slots) {
		return fail(
			"INVALID_RANKS",
			`Ranking for heat "${heatId}" must list each rider without status exactly once`,
			{
				heatId,
				expected: found.heat.slots.filter((s) => s.status === undefined).length,
				received: riderIds.length,
			},
		);
	}
	return commit(bracket, found, slots);
}

/** Stores a provisional order for the riders without status of a running heat with no rank; slots, and with them lycra colors, are untouched. */
export function reorderSlots(
	bracket: Bracket,
	heatId: string,
	riderIds: string[],
): ActionResult {
	const looked = lookup(bracket, heatId);
	if ("refused" in looked) return looked.refused;
	const { found } = looked;
	const { heat } = found;
	if (heat.status !== "running") {
		return fail("HEAT_NOT_RUNNING", `Heat "${heatId}" is not running`, {
			heatId,
		});
	}
	if (heat.slots.some((s) => s.rank !== null)) {
		return fail(
			"HEAT_HAS_RANKS",
			`Heat "${heatId}" already has ranks: use setRanks to change them`,
			{ heatId },
		);
	}
	const rankable = heat.slots.filter((s) => s.status === undefined);
	const distinct = new Set(riderIds);
	const valid =
		distinct.size === riderIds.length &&
		riderIds.length === rankable.length &&
		rankable.every((s) => distinct.has(s.riderId));
	if (!valid) {
		return fail(
			"INVALID_RANKS",
			`Order for heat "${heatId}" must list each rider without status exactly once`,
			{ heatId, expected: rankable.length, received: riderIds.length },
		);
	}
	const current = provisionalOrder(heat);
	if (riderIds.every((id, i) => id === current[i])) return ok(bracket);
	return ok(replaceHeat(bracket, found, { ...heat, order: [...riderIds] }));
}

export function rankByPosition(bracket: Bracket, heatId: string): ActionResult {
	const looked = lookupRunning(bracket, heatId);
	if ("refused" in looked) return looked.refused;
	const { found } = looked;
	const order = provisionalOrder(found.heat);
	const slots = found.heat.slots.map((slot) => {
		const position = order.indexOf(slot.riderId);
		if (position === -1) return slot;
		return reuseSlot(slot, makeSlot(slot.riderId, { rank: position + 1 }));
	});
	return commit(bracket, found, slots);
}

export function clearRanks(bracket: Bracket, heatId: string): ActionResult {
	const looked = lookupRunning(bracket, heatId);
	if ("refused" in looked) return looked.refused;
	const { found } = looked;
	const slots = found.heat.slots.map((slot) =>
		reuseSlot(
			slot,
			makeSlot(slot.riderId, {
				rank: null,
				status: slot.status,
				overridden: slot.status !== undefined && slot.overridden,
			}),
		),
	);
	return commit(bracket, found, slots);
}

export function setStatus(
	bracket: Bracket,
	heatId: string,
	riderId: string,
	status: ParticipantStatus | null,
	override: boolean,
): ActionResult {
	const looked = lookup(bracket, heatId);
	if ("refused" in looked) return looked.refused;
	const { found } = looked;
	const target = found.heat.slots.find((s) => s.riderId === riderId);
	if (!target) return notInHeat(riderId, heatId);
	if (target.status === (status ?? undefined)) return ok(bracket);
	const { heat } = found;
	if (status === null) {
		const ranks = heat.slots
			.filter((s) => s !== target && s.rank !== null)
			.map((s) => s.rank ?? 0);
		const appendToOrder = ranks.length === 0 && heat.order !== undefined;
		const updated = makeSlot(riderId, {
			rank: ranks.length > 0 ? Math.max(...ranks) + 1 : null,
			status: undefined,
			overridden: override,
		});
		const slots = heat.slots.map((s) => (s === target ? updated : s));
		const base = appendToOrder
			? { ...heat, order: [...(heat.order ?? []), riderId] }
			: heat;
		return ok(replaceHeat(bracket, found, withSlots(base, slots)));
	}
	const updated = makeSlot(riderId, {
		rank: null,
		status,
		overridden: override,
	});
	const replaced = heat.slots.map((s) => (s === target ? updated : s));
	return commit(bracket, found, renumber(replaced));
}
