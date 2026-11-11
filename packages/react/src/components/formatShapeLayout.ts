import type { FormatSettings, Link } from "@heatboard/core";

export interface HeatMix {
	/** Riders who reach the heat through the main path (or enter it directly). */
	own: number;
	/** Riders who reach a main heat from a round of another lane, e.g. the repechage. */
	foreign: number;
}

const groupOf = (format: FormatSettings, key: string) =>
	format.rounds.find((r) => r.key === key)?.group ?? "main";

/** `r1-2` is the second heat of round `r1`. */
function splitHeatId(heatId: string): { roundKey: string; index: number } {
	const cut = heatId.lastIndexOf("-");
	return {
		roundKey: heatId.slice(0, cut),
		index: Number(heatId.slice(cut + 1)) - 1,
	};
}

/**
 * Per round key, the composition of each heat read from the links of a build:
 * riders arriving in a main round from a round of another lane count as
 * `foreign`, the rest of the planned size as `own`. The links come from the
 * build's own placement, so this is the real distribution for those entries.
 */
export function heatMixes(
	format: FormatSettings,
	sizes: Record<string, number[]>,
	links: readonly Link[],
): Record<string, HeatMix[]> {
	const mixes: Record<string, HeatMix[]> = {};
	for (const [key, heatSizes] of Object.entries(sizes)) {
		mixes[key] = heatSizes.map((size) => ({ own: size, foreign: 0 }));
	}
	for (const link of links) {
		if (link.to === "eliminated") continue;
		const from = splitHeatId(link.from.heatId);
		const to = splitHeatId(link.to.heatId);
		if (
			groupOf(format, to.roundKey) !== "main" ||
			groupOf(format, from.roundKey) === "main"
		) {
			continue;
		}
		const mix = mixes[to.roundKey]?.[to.index];
		if (mix) {
			mix.foreign += 1;
			mix.own -= 1;
		}
	}
	return mixes;
}

const isOptionalMain = (round: FormatSettings["rounds"][number]) =>
	(round.group ?? "main") === "main" && round.optional === true;

/**
 * Column of each round when lanes are drawn one under the other. Main rounds
 * follow each other; a round of another lane sits under the earliest main round
 * that feeds it, and never at or before the previous round of its own lane.
 * An optional main round (the small final) goes right after the last main one.
 */
export function roundColumns(format: FormatSettings): Record<string, number> {
	const columns: Record<string, number> = {};
	const lastOfLane = new Map<string, number>();
	format.rounds
		.filter((r) => !isOptionalMain(r))
		.forEach((round) => {
			const group = round.group ?? "main";
			let column = lastOfLane.has(group)
				? (lastOfLane.get(group) as number) + 1
				: 0;
			if (group !== "main") {
				const feeder = format.rounds.find(
					(r) =>
						(r.group ?? "main") === "main" &&
						r.outcomes?.some((o) => o.to === round.key),
				);
				if (feeder) column = Math.max(column, columns[feeder.key] ?? 0);
			}
			columns[round.key] = column;
			lastOfLane.set(group, column);
		});
	const afterMain = (lastOfLane.get("main") ?? -1) + 1;
	for (const round of format.rounds) {
		if (isOptionalMain(round)) columns[round.key] = afterMain;
	}
	return columns;
}
