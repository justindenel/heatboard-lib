import { toCents } from "./cents";
import type { JudgingMode } from "../model";
import type { Ride, Score, ScoringConfig, ScoringIssue } from "./model";

export interface ValidInput {
	rides: Ride[];
	scores: Array<Score & { cents: number }>;
	/** Latest answers recorded as "not seen"; only produced in head-judge mode. */
	unseen: Score[];
	issues: ScoringIssue[];
}

export function compareAt(a: string, b: string): number {
	const ta = Date.parse(a);
	const tb = Date.parse(b);
	if (Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
	return a < b ? -1 : a > b ? 1 : 0;
}

function isOnScale(cents: number, scale: ScoringConfig["scale"]): boolean {
	const min = toCents(scale.min);
	const max = toCents(scale.max);
	const step = toCents(scale.step);
	return step > 0 && cents >= min && cents <= max && (cents - min) % step === 0;
}

/**
 * Splits the raw input into usable rides and scores, reporting everything dropped.
 * In head-judge mode rides are shared by all judges and a `null` score is a valid "not seen".
 */
export function sanitize(
	config: ScoringConfig,
	riderIds: string[],
	rides: Ride[],
	scores: Score[],
	judgingMode: JudgingMode = "free",
): ValidInput {
	const shared = judgingMode === "headJudge";
	const issues: ScoringIssue[] = [];
	const types = new Set(config.categories.map((c) => c.type));
	const figuresByType = new Map(
		config.categories.map((c) => [c.type, c.figures ?? []]),
	);
	const variantCodes = new Set((config.variants ?? []).map((v) => v.code));
	const riders = new Set(riderIds);
	const validRides: Ride[] = [];
	const knownRideIds = new Set(rides.map((r) => r.id));
	const seenRideIds = new Set<string>();
	for (const ride of rides) {
		if (seenRideIds.has(ride.id)) {
			issues.push({
				code: "DUPLICATE_RIDE",
				message: `Ride id "${ride.id}" appears more than once; only the first is kept`,
				details: { rideId: ride.id, riderId: ride.riderId },
			});
			continue;
		}
		seenRideIds.add(ride.id);
		if (!types.has(ride.type)) {
			issues.push({
				code: "UNKNOWN_TYPE",
				message: `Ride "${ride.id}" has type "${ride.type}" which is not in the scoring config`,
				details: { rideId: ride.id, type: ride.type },
			});
		} else if (!riders.has(ride.riderId)) {
			issues.push({
				code: "UNKNOWN_RIDER",
				message: `Ride "${ride.id}" belongs to rider "${ride.riderId}" who is not in the heat`,
				details: { rideId: ride.id, riderId: ride.riderId },
			});
		} else {
			validRides.push(ride);
			const figures = figuresByType.get(ride.type) ?? [];
			const figure =
				ride.figure === undefined
					? undefined
					: figures.find((f) => f.code === ride.figure);
			if (ride.figure !== undefined && !figure) {
				issues.push({
					code: "UNKNOWN_FIGURE",
					message: `Ride "${ride.id}" has figure "${ride.figure}" which is not listed for type "${ride.type}"`,
					details: {
						rideId: ride.id,
						type: ride.type,
						figure: ride.figure,
					},
				});
			}
			if (
				ride.variant !== undefined &&
				!(
					figure?.variants?.includes(ride.variant) &&
					variantCodes.has(ride.variant)
				)
			) {
				issues.push({
					code: "UNKNOWN_VARIANT",
					message: `Ride "${ride.id}" has variant "${ride.variant}" which is not accepted by its figure`,
					details: {
						rideId: ride.id,
						type: ride.type,
						variant: ride.variant,
					},
				});
			}
		}
	}
	const validRideIds = new Set(validRides.map((r) => r.id));

	const latest = new Map<string, Score & { cents: number | null }>();
	for (const score of scores) {
		if (!knownRideIds.has(score.rideId)) {
			issues.push({
				code: "UNKNOWN_RIDE",
				message: `Score from judge "${score.judgeId}" targets unknown ride "${score.rideId}"`,
				details: { rideId: score.rideId, judgeId: score.judgeId },
			});
			continue;
		}
		if (!validRideIds.has(score.rideId)) continue;
		let cents: number | null = null;
		if (score.value !== null || !shared) {
			cents = score.value === null ? Number.NaN : toCents(score.value);
			if (
				score.value === null ||
				!Number.isFinite(score.value) ||
				!isOnScale(cents, config.scale)
			) {
				issues.push({
					code: "INVALID_SCORE",
					message:
						score.value === null
							? `Score from judge "${score.judgeId}" on ride "${score.rideId}" is empty`
							: `Score ${score.value} from judge "${score.judgeId}" on ride "${score.rideId}" is outside the scale`,
					details: {
						rideId: score.rideId,
						judgeId: score.judgeId,
						...(score.value === null ? {} : { value: score.value }),
					},
				});
				continue;
			}
		}
		const key = JSON.stringify([score.rideId, score.judgeId]);
		const previous = latest.get(key);
		if (previous) {
			const keepNew = compareAt(score.at, previous.at) >= 0;
			issues.push({
				code: "DUPLICATE_SCORE",
				message: `Judge "${score.judgeId}" scored ride "${score.rideId}" more than once; the latest is kept`,
				details: { rideId: score.rideId, judgeId: score.judgeId },
			});
			if (!keepNew) continue;
		}
		latest.set(key, { ...score, cents });
	}
	const answered = [...latest.values()];
	const given = answered.flatMap((s) =>
		s.cents === null ? [] : [{ ...s, cents: s.cents }],
	);
	if (shared) {
		return {
			rides: validRides,
			scores: given,
			unseen: answered.flatMap((s) =>
				s.cents === null
					? [{ rideId: s.rideId, judgeId: s.judgeId, value: null, at: s.at }]
					: [],
			),
			issues,
		};
	}
	const owners = new Map<string, Score & { cents: number }>();
	for (const score of given) {
		const owner = owners.get(score.rideId);
		if (!owner || compareAt(score.at, owner.at) < 0) {
			owners.set(score.rideId, score);
		}
	}
	const owned: Array<Score & { cents: number }> = [];
	for (const score of given) {
		const owner = owners.get(score.rideId);
		if (!owner || owner.judgeId === score.judgeId) {
			owned.push(score);
			continue;
		}
		issues.push({
			code: "RIDE_MULTIPLE_JUDGES",
			message: `Ride "${score.rideId}" is scored by judge "${owner.judgeId}" and by judge "${score.judgeId}"; only the first judge's scores are kept`,
			details: {
				rideId: score.rideId,
				judgeId: score.judgeId,
				ownerJudgeId: owner.judgeId,
			},
		});
	}
	return { rides: validRides, scores: owned, unseen: [], issues };
}

export const SCALE_STEPS: readonly number[] = [1, 0.5];

/** Describes the first problem of a scoring config's scale, or `undefined` when it is usable. */
export function scaleProblem(
	scale: ScoringConfig["scale"],
): { field: "min" | "max" | "step"; message: string } | undefined {
	const { min, max, step } = scale;
	if (!SCALE_STEPS.includes(step)) {
		return {
			field: "step",
			message: `Scale step must be 1 or 0.5, got ${step}`,
		};
	}
	if (!Number.isFinite(min) || toCents(min) % toCents(step) !== 0) {
		return {
			field: "min",
			message: `Scale min must be a multiple of the step ${step}, got ${min}`,
		};
	}
	if (!Number.isFinite(max) || toCents(max) % toCents(step) !== 0) {
		return {
			field: "max",
			message: `Scale max must be a multiple of the step ${step}, got ${max}`,
		};
	}
	if (min >= max) {
		return {
			field: "max",
			message: `Scale max must be above min, got ${min}..${max}`,
		};
	}
	return undefined;
}

/** Describes the first problem of a scoring config, or `undefined` when it is usable. */
export function scoringProblem(
	scoring: ScoringConfig,
): { field: string; message: string } | undefined {
	const scale = scaleProblem(scoring.scale);
	if (scale) return { field: `scale.${scale.field}`, message: scale.message };
	const window = scoring.alignWindowSec;
	if (window !== undefined && !(Number.isInteger(window) && window > 0)) {
		return {
			field: "alignWindowSec",
			message: `Alignment window must be a positive integer of seconds, got ${window}`,
		};
	}
	return categoriesProblem(scoring);
}

function categoriesProblem(
	scoring: ScoringConfig,
): { field: string; message: string } | undefined {
	const variantCodes = new Set<string>();
	for (const [v, variant] of (scoring.variants ?? []).entries()) {
		if (variantCodes.has(variant.code)) {
			return {
				field: `variants.${v}.code`,
				message: `Variant code "${variant.code}" is used more than once`,
			};
		}
		variantCodes.add(variant.code);
	}
	for (const [c, category] of scoring.categories.entries()) {
		const path = `categories.${c}`;
		const familyIds = new Set<string>();
		for (const [f, family] of (category.families ?? []).entries()) {
			if (familyIds.has(family.id)) {
				return {
					field: `${path}.families.${f}.id`,
					message: `Family id "${family.id}" is used more than once in category "${category.type}"`,
				};
			}
			familyIds.add(family.id);
		}
		if (category.distinctFamilies === true && familyIds.size < 2) {
			return {
				field: `${path}.distinctFamilies`,
				message: `Category "${category.type}" requires distinct families but defines fewer than two`,
			};
		}
		const codes = new Set<string>();
		for (const [f, figure] of (category.figures ?? []).entries()) {
			if (codes.has(figure.code)) {
				return {
					field: `${path}.figures.${f}.code`,
					message: `Figure code "${figure.code}" is used more than once in category "${category.type}"`,
				};
			}
			codes.add(figure.code);
			if (!familyIds.has(figure.family)) {
				return {
					field: `${path}.figures.${f}.family`,
					message: `Figure "${figure.code}" names family "${figure.family}" which is not defined in category "${category.type}"`,
				};
			}
			const unknown = (figure.variants ?? []).find(
				(code) => !variantCodes.has(code),
			);
			if (unknown !== undefined) {
				return {
					field: `${path}.figures.${f}.variants`,
					message: `Figure "${figure.code}" accepts variant "${unknown}" which is not in the scoring variants`,
				};
			}
		}
	}
	return undefined;
}

/** First structural problem of the rides of a heat: a repeated id, or a ride of a rider who is not in the heat. */
export function ridesProblem(
	rides: Ride[],
	riderIds: ReadonlySet<string>,
): ScoringIssue | undefined {
	const seen = new Set<string>();
	for (const ride of rides) {
		if (seen.has(ride.id)) {
			return {
				code: "DUPLICATE_RIDE",
				message: `Ride id "${ride.id}" appears more than once`,
				details: { rideId: ride.id, riderId: ride.riderId },
			};
		}
		seen.add(ride.id);
		if (!riderIds.has(ride.riderId)) {
			return {
				code: "UNKNOWN_RIDER",
				message: `Ride "${ride.id}" belongs to rider "${ride.riderId}" who is not in the heat`,
				details: { rideId: ride.id, riderId: ride.riderId },
			};
		}
	}
	return undefined;
}
