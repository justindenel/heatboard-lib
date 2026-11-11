import type { Heat, HeatSlot, ViewerHeatResult } from "@heatboard/core";
import { displaySlots } from "../dnd/ranking";

/**
 * Slots of a heat in the order a spectator reads them. A started heat follows its computed result
 * (rank order, tied riders keep their composition order), riders with a status come last; without a
 * result the ranks of the slots decide. `index` is the position in the composition, which keeps
 * lycra colors stable.
 */
export function viewerSlots(
	heat: Heat,
	result: ViewerHeatResult | undefined,
): { slot: HeatSlot; index: number }[] {
	const entries = heat.slots.map((slot, index) => ({ slot, index }));
	if (heat.status === "pending") return entries;
	if (!result) {
		return heat.status === "running"
			? displaySlots(heat)
			: entries.sort(
					(a, b) =>
						group(a.slot) - group(b.slot) ||
						(a.slot.rank ?? 0) - (b.slot.rank ?? 0) ||
						a.index - b.index,
				);
	}
	const rankOf = new Map(result.riders.map((r) => [r.riderId, r.rank]));
	return entries.sort((a, b) => {
		const ra = rankOf.get(a.slot.riderId);
		const rb = rankOf.get(b.slot.riderId);
		if (ra === undefined || rb === undefined) {
			return ra === rb ? a.index - b.index : ra === undefined ? 1 : -1;
		}
		return ra - rb || a.index - b.index;
	});
}

function group(slot: HeatSlot): number {
	return slot.status !== undefined ? 2 : slot.rank === null ? 1 : 0;
}
