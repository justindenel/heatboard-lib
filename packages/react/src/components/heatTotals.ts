import type { ViewerHeatResult } from "@heatboard/core";

/**
 * Figure of each rider without status: the points total, or with the placings method the place in
 * the heat (never a sum of places).
 */
export function totalsOf(result: ViewerHeatResult): Map<string, number> {
	return new Map(
		result.riders.map((r) => [
			r.riderId,
			result.method === "placings" ? r.rank : r.total,
		]),
	);
}
