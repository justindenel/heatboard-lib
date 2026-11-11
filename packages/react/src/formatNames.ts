import type { DoubleRoundNames, FormatNames } from "@heatboard/core";
import type { Labels } from "./labels";

/** Names for `formatFromPlan` / `generateDoubleElimination` in the language of `labels`. */
export function formatNamesOf(labels: Labels): FormatNames {
	return {
		...labels.formatRoundNames,
		repechage: labels.formatRepechageName,
	};
}

/** Names for `openDoubleElimination` in the language of `labels`; `{n}` stands for the round position. */
export function doubleNamesOf(labels: Labels): DoubleRoundNames {
	const names = labels.formatRoundNames;
	return {
		double: names.double(0).replace("0", "{n}"),
		doubleFinal: names.doubleFinal,
		superFinal: names.superFinal,
	};
}
