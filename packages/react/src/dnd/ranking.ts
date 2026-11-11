import { provisionalOrder, scoringOf } from "@heatboard/core";
import type { Bracket, Heat, HeatSlot } from "@heatboard/core";

/**
 * How the riders of a heat can be moved: `composition` while it is pending,
 * `ranking` while it runs with manual ranks, `closed` otherwise.
 */
export type DragAccess =
	| { kind: "composition" }
	| { kind: "ranking" }
	| { kind: "closed"; reason: "judged" | "locked" | "points" };

export function dragAccess(bracket: Bracket, heat: Heat): DragAccess {
	switch (heat.status) {
		case "pending":
			return { kind: "composition" };
		case "running":
			return scoringOf(bracket, heat)?.method === "points" ||
				scoringOf(bracket, heat)?.method === "rideMeans"
				? { kind: "closed", reason: "points" }
				: { kind: "ranking" };
		case "judged":
			return { kind: "closed", reason: "judged" };
		case "locked":
			return { kind: "closed", reason: "locked" };
	}
}

/**
 * Slots of a heat as displayed. A running heat follows its ranking: ranked
 * riders by rank, then unranked ones in their provisional order, then riders
 * with a status. `index` is the position in the composition, which keeps lycra
 * colors stable.
 */
export function displaySlots(heat: Heat): { slot: HeatSlot; index: number }[] {
	const entries = heat.slots.map((slot, index) => ({ slot, index }));
	if (heat.status !== "running") return entries;
	const order = provisionalOrder(heat);
	const group = (slot: HeatSlot) =>
		slot.status !== undefined ? 2 : slot.rank === null ? 1 : 0;
	return entries.sort(
		(a, b) =>
			group(a.slot) - group(b.slot) ||
			(a.slot.rank ?? 0) - (b.slot.rank ?? 0) ||
			order.indexOf(a.slot.riderId) - order.indexOf(b.slot.riderId) ||
			a.index - b.index,
	);
}

/** Riders without status, in display order: the list `setRanks` expects. */
export function rankableOrder(heat: Heat): string[] {
	return displaySlots(heat)
		.filter(({ slot }) => slot.status === undefined)
		.map(({ slot }) => slot.riderId);
}
