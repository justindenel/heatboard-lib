import { findHeat, heatNumbers, type Bracket } from "@heatboard/core";
import type { Labels } from "../labels";

/** The heat's own name, else "Heat 7": its bracket-wide number, which is the same on the board, for judges and for the public. */
export function heatLabel(
	bracket: Bracket,
	heatId: string,
	labels: Pick<Labels, "heatTitle">,
): string {
	const found = findHeat(bracket, heatId);
	if (!found) return heatId;
	if (found.heat.name !== undefined) return found.heat.name;
	const number = heatNumbers(bracket)[heatId];
	return number === undefined ? heatId : labels.heatTitle(number);
}
