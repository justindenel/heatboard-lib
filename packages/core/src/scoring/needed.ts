import { fromCents, toCents } from "./cents";
import { computeHeatResult } from "./compute";
import { sanitize } from "./validate";
import type { JudgingMode } from "../model";
import type { Penalty, Ride, Score, ScoreNeeded, ScoringConfig } from "./model";

const probeId = (judgeId: string) => `__scoreNeeded__:${judgeId}`;

/**
 * Estimates the note needed on a new ride of `type`, one per judge, each given
 * the same note, to finish strictly ahead of the rider now at `targetRank`. Always
 * based on the points method, whatever the config's method (`rideMeans` keeps its
 * own method); the smallest value on the scale grid wins. In head-judge mode, or
 * with `rideMeans`, the new ride is a single shared one scored by every judge. Returns `impossible` with a reason for an unknown
 * type, rider, scale or target rank.
 */
export function scoreNeeded(
	config: ScoringConfig,
	riderIds: string[],
	rides: Ride[],
	scores: Score[],
	penalties: Penalty[],
	riderId: string,
	targetRank: number,
	type: string,
	judgingMode: JudgingMode = "free",
): ScoreNeeded {
	if (!config.categories.some((c) => c.type === type)) {
		return { status: "impossible", reason: "UNKNOWN_TYPE" };
	}
	if (!riderIds.includes(riderId)) {
		return { status: "impossible", reason: "UNKNOWN_RIDER" };
	}
	if (
		!Number.isInteger(targetRank) ||
		targetRank < 1 ||
		targetRank > riderIds.length
	) {
		return { status: "impossible", reason: "INVALID_TARGET_RANK" };
	}
	const stepCents = toCents(config.scale.step);
	const minCents = toCents(config.scale.min);
	const maxCents = toCents(config.scale.max);
	const { min, max, step } = config.scale;
	if (![min, max, step].every(Number.isFinite) || step <= 0 || min >= max) {
		return { status: "impossible", reason: "INVALID_SCALE" };
	}

	const rideMeans = config.method === "rideMeans";
	const shared = rideMeans || judgingMode === "headJudge";
	const pointsConfig: ScoringConfig = rideMeans
		? config
		: { ...config, method: "points" };
	const options = { judgingMode: shared ? "headJudge" : "free" } as const;
	const current = computeHeatResult(
		pointsConfig,
		riderIds,
		rides,
		scores,
		penalties,
		options,
	);
	const self = current.riders.find((r) => r.riderId === riderId);
	const target = current.riders[targetRank - 1];
	if (!self || !target)
		return { status: "impossible", reason: "INVALID_TARGET_RANK" };
	if (self.rank <= targetRank) return { status: "reached" };

	const valid = sanitize(
		pointsConfig,
		riderIds,
		rides,
		scores,
		options.judgingMode,
	);
	const judges = [
		...new Set([...valid.scores, ...valid.unseen].map((s) => s.judgeId)),
	];
	const probeJudges = judges.length > 0 ? judges : ["__probe__"];
	const probeRides: Ride[] = (shared ? ["shared"] : probeJudges).map((key) => ({
		id: probeId(key),
		riderId,
		type,
		at: "",
	}));
	for (let cents = minCents; cents <= maxCents; cents += stepCents) {
		const value = fromCents(cents);
		const probeScores = probeJudges.map((judgeId) => ({
			rideId: probeId(shared ? "shared" : judgeId),
			judgeId,
			value,
			at: "",
		}));
		const result = computeHeatResult(
			pointsConfig,
			riderIds,
			[...rides, ...probeRides],
			[...scores, ...probeScores],
			penalties,
			options,
		);
		const total = result.riders.find((r) => r.riderId === riderId)?.total ?? 0;
		if (toCents(total) > toCents(target.total))
			return { status: "needed", value };
	}
	return { status: "impossible" };
}
