import { fromCents } from "./cents";
import {
	aggregateNotes,
	combineJudges,
	comparePoints,
	groupRanked,
	retain,
	type Retained,
	type ValuedRide,
} from "./aggregate";
import type {
	ComputeOptions,
	HeatResult,
	Penalty,
	Ride,
	RideResult,
	RiderResult,
	Score,
	ScoringConfig,
	ScoringIssue,
} from "./model";
import { compareAt, sanitize } from "./validate";

interface RiderWork {
	riderId: string;
	index: number;
	rides: Ride[];
	penalties: Penalty[];
	points: Retained;
}

function placesForJudge(
	config: ScoringConfig,
	riders: RiderWork[],
	judgeScores: Map<string, number>,
): Map<string, number> {
	const entries = riders.map((rider) => {
		const valued: ValuedRide[] = rider.rides.flatMap((ride) => {
			const value = judgeScores.get(ride.id);
			return value === undefined
				? []
				: [
						{
							rideId: ride.id,
							type: ride.type,
							value,
							figure: ride.figure,
						},
					];
		});
		return {
			riderId: rider.riderId,
			retained: retain(config, valued, rider.penalties),
		};
	});
	const places = new Map<string, number>();
	for (const group of groupRanked(entries, (a, b) =>
		comparePoints(config, a.retained, b.retained),
	)) {
		const average = group.position + (group.items.length - 1) / 2;
		for (const item of group.items) places.set(item.riderId, average);
	}
	return places;
}

function sumPlaces(config: ScoringConfig, places: number[]): number {
	const sorted = [...places].sort((a, b) => a - b);
	const used =
		config.trimPlacings === true && sorted.length >= 5
			? sorted.slice(1, -1)
			: sorted;
	return used.reduce((acc, p) => acc + p, 0);
}

/** Computes ranks, totals and data issues for one heat; invalid data is reported, never thrown. */
export function computeHeatResult(
	config: ScoringConfig,
	riderIds: string[],
	rides: Ride[],
	scores: Score[],
	penalties: Penalty[] = [],
	options: ComputeOptions = {},
): HeatResult {
	const rideMeans = config.method === "rideMeans";
	const shared = rideMeans || options.judgingMode === "headJudge";
	const input = sanitize(
		config,
		riderIds,
		rides,
		scores,
		shared ? "headJudge" : "free",
	);
	const issues: ScoringIssue[] = [...input.issues];
	const orderedRides = [...input.rides].sort((a, b) => compareAt(a.at, b.at));

	// In free mode a ride has at most one score; in shared mode one per judge.
	const scoresByRide = new Map<string, Array<(typeof input.scores)[number]>>();
	const judges: string[] = [];
	for (const score of input.scores) {
		scoresByRide.set(score.rideId, [
			...(scoresByRide.get(score.rideId) ?? []),
			score,
		]);
		if (!judges.includes(score.judgeId)) judges.push(score.judgeId);
	}
	const answered = new Set<string>(
		[...input.scores, ...input.unseen].map((s) =>
			JSON.stringify([s.rideId, s.judgeId]),
		),
	);
	for (const score of input.unseen) {
		if (!judges.includes(score.judgeId)) judges.push(score.judgeId);
	}
	const scoreByRide = new Map(
		[...scoresByRide].flatMap(([id, list]) => (list[0] ? [[id, list[0]]] : [])),
	);

	const missing = new Set<string>();
	if (shared) {
		for (const ride of orderedRides) {
			const lacking = judges.filter(
				(judgeId) => !answered.has(JSON.stringify([ride.id, judgeId])),
			);
			if (judges.length === 0) {
				missing.add(ride.riderId);
				issues.push({
					code: "MISSING_SCORE",
					message: `Ride "${ride.id}" has no score yet`,
					details: { rideId: ride.id },
				});
			}
			for (const judgeId of lacking) {
				missing.add(ride.riderId);
				issues.push({
					code: "MISSING_SCORE",
					message: `Judge "${judgeId}" has not answered ride "${ride.id}"`,
					details: { rideId: ride.id, judgeId },
				});
			}
		}
	} else {
		for (const ride of orderedRides) {
			if (scoreByRide.has(ride.id)) continue;
			missing.add(ride.riderId);
			issues.push({
				code: "MISSING_SCORE",
				message: `Ride "${ride.id}" has no valid score`,
				details: { rideId: ride.id },
			});
		}
		for (const riderId of riderIds) {
			for (const judgeId of judges) {
				const scoredByJudge = orderedRides.some(
					(r) =>
						r.riderId === riderId && scoreByRide.get(r.id)?.judgeId === judgeId,
				);
				if (scoredByJudge) continue;
				missing.add(riderId);
				issues.push({
					code: "MISSING_SCORE",
					message: `Judge "${judgeId}" has no scored ride for rider "${riderId}"`,
					details: { riderId, judgeId },
				});
			}
		}
	}

	const judgeScores = new Map(
		judges.map((judgeId) => [
			judgeId,
			new Map(
				input.scores
					.filter((s) => s.judgeId === judgeId)
					.map((s) => [s.rideId, s.cents]),
			),
		]),
	);
	// A judge who did not see a ride counts, on it, the mean of the judges who did.
	if (shared) {
		for (const score of input.unseen) {
			const seen = (scoresByRide.get(score.rideId) ?? []).map((s) => s.cents);
			if (seen.length === 0) continue;
			judgeScores
				.get(score.judgeId)
				?.set(
					score.rideId,
					Math.round(seen.reduce((acc, v) => acc + v, 0) / seen.length),
				);
		}
	}
	const rideCents = new Map<string, number>();
	if (shared) {
		for (const ride of orderedRides) {
			const notes = (scoresByRide.get(ride.id) ?? []).map((s) => s.cents);
			if (notes.length > 0) {
				rideCents.set(ride.id, aggregateNotes(config.aggregation, notes));
			}
		}
	}

	const work: RiderWork[] = riderIds.map((riderId, index) => {
		const own = orderedRides.filter((r) => r.riderId === riderId);
		const riderPenalties = penalties.filter((p) => p.riderId === riderId);
		const perJudge = judges.map((judgeId) =>
			retain(
				config,
				own.flatMap((r) => {
					const cents = judgeScores.get(judgeId)?.get(r.id);
					return cents === undefined
						? []
						: [
								{
									rideId: r.id,
									type: r.type,
									value: cents,
									figure: r.figure,
								},
							];
				}),
				riderPenalties,
			),
		);
		const points = rideMeans
			? retain(
					config,
					own.flatMap((r) => {
						const cents = rideCents.get(r.id);
						return cents === undefined
							? []
							: [
									{
										rideId: r.id,
										type: r.type,
										value: cents,
										figure: r.figure,
									},
								];
					}),
					riderPenalties,
				)
			: judges.length === 0
				? retain(config, [], riderPenalties)
				: combineJudges(config, perJudge);
		return { riderId, index, rides: own, penalties: riderPenalties, points };
	});

	const placesByRider = new Map<string, Record<string, number>>();
	if (config.method === "placings") {
		for (const judgeId of judges) {
			const places = placesForJudge(
				config,
				work,
				judgeScores.get(judgeId) ?? new Map<string, number>(),
			);
			for (const [riderId, place] of places) {
				placesByRider.set(riderId, {
					...placesByRider.get(riderId),
					[judgeId]: place,
				});
			}
		}
	}
	const placingsSum = (w: RiderWork) =>
		sumPlaces(config, Object.values(placesByRider.get(w.riderId) ?? {}));

	const groups =
		config.method === "placings"
			? groupRanked(work, (a, b) => {
					const diff = placingsSum(b) - placingsSum(a);
					return diff || comparePoints(config, a.points, b.points);
				})
			: groupRanked(work, (a, b) => comparePoints(config, a.points, b.points));
	const orderedGroups = groups.map((group) => ({
		...group,
		items: [...group.items].sort((a, b) => a.index - b.index),
	}));

	const riders: RiderResult[] = orderedGroups.flatMap((group) =>
		group.items.map((w): RiderResult => {
			const keptIds = new Set(w.points.kept.map((k) => k.rideId));
			const rideResults: RideResult[] = w.rides.map((ride) => {
				const given = scoresByRide.get(ride.id) ?? [];
				const detail = judges.flatMap((judgeId) => {
					const note = given.find((s) => s.judgeId === judgeId);
					if (note) return [{ judgeId, value: note.value }];
					return input.unseen.some(
						(u) => u.rideId === ride.id && u.judgeId === judgeId,
					)
						? [{ judgeId, value: null }]
						: [];
				});
				const value = shared
					? (rideCents.get(ride.id) ?? 0)
					: (given[0]?.cents ?? 0);
				return {
					rideId: ride.id,
					type: ride.type,
					at: ride.at,
					...(ride.figure === undefined ? {} : { figure: ride.figure }),
					...(ride.variant === undefined ? {} : { variant: ride.variant }),
					value: fromCents(value),
					counted: keptIds.has(ride.id),
					judges: given.length,
					...(!shared && given[0] ? { judgeId: given[0].judgeId } : {}),
					scores: detail,
				};
			});
			const result: RiderResult = {
				riderId: w.riderId,
				rank: group.position,
				tied: group.items.length > 1,
				total: fromCents(w.points.total),
				byType: Object.fromEntries(
					[...w.points.byType].map(([type, cents]) => [type, fromCents(cents)]),
				),
				rides: rideResults,
				interferences: w.penalties.length,
				dsqSuggested: w.penalties.length >= 2,
				missingScores: missing.has(w.riderId),
			};
			if (config.method === "placings") {
				result.placingsSum = placingsSum(w);
				result.placesByJudge = placesByRider.get(w.riderId) ?? {};
			}
			return result;
		}),
	);

	return {
		method: config.method,
		riders,
		unresolvedTie: riders.some((r) => r.tied),
		issues,
	};
}
