/** Names `formatFromPlan` and `generateDoubleElimination` give the rounds they create. */
export interface FormatNames {
	round: (position: number) => string;
	quarterFinals: string;
	semiFinals: string;
	smallFinal: string;
	final: string;
	repechage: (position: number) => string;
	double: (position: number) => string;
	doubleFinal: string;
	superFinal: string;
}

export const englishFormatNames: FormatNames = {
	round: (position) => `Round ${position}`,
	quarterFinals: "Quarter-finals",
	semiFinals: "Semi-finals",
	smallFinal: "Small final",
	final: "Final",
	repechage: (position) => `Repechage ${position}`,
	double: (position) => `Double ${position}`,
	doubleFinal: "Double final",
	superFinal: "Super final",
};

export function withDefaultNames(
	names: Partial<FormatNames> | undefined,
): FormatNames {
	return { ...englishFormatNames, ...names };
}

/** Serializable names of the rounds `openDoubleElimination` adds; `{n}` stands for the position. */
export interface DoubleRoundNames {
	double?: string;
	doubleFinal?: string;
	superFinal?: string;
}

export function formatNamesOfDouble(
	names: DoubleRoundNames | undefined,
): Partial<FormatNames> {
	const result: Partial<FormatNames> = {};
	const { double } = names ?? {};
	if (double !== undefined) {
		result.double = (position) => double.replaceAll("{n}", String(position));
	}
	if (names?.doubleFinal !== undefined) result.doubleFinal = names.doubleFinal;
	if (names?.superFinal !== undefined) result.superFinal = names.superFinal;
	return result;
}
