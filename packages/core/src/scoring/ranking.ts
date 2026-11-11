import type { HeatResult, RankingFromResult } from "./model";

/** Arrival order usable by the `setRanks` action, or the groups still tied. */
export function rankingFromResult(result: HeatResult): RankingFromResult {
	if (!result.unresolvedTie) {
		return { ok: true, riderIds: result.riders.map((r) => r.riderId) };
	}
	const groups = new Map<number, string[]>();
	for (const rider of result.riders) {
		if (rider.tied) {
			groups.set(rider.rank, [
				...(groups.get(rider.rank) ?? []),
				rider.riderId,
			]);
		}
	}
	return { ok: false, tiedRiderIds: [...groups.values()] };
}
