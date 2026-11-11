import type { HeatData } from "../lifecycle/scoring";
import type { Ride, Score, ScoringConfig } from "../scoring/model";
import { createRandom } from "./random";

export interface GenerateNotesOptions {
	scoring: ScoringConfig;
	riderIds: string[];
	judgeIds: string[];
	seed: number;
	/** ISO date the heat starts; the moves of each rider follow over the next minutes. */
	startAt: string;
}

function snap(value: number, scale: ScoringConfig["scale"]): number {
	const clamped = Math.min(scale.max, Math.max(scale.min, value));
	const steps = Math.round((clamped - scale.min) / scale.step);
	return Math.round((scale.min + steps * scale.step) * 100) / 100;
}

interface Move {
	type: string;
	figure: string | undefined;
	offsetMs: number;
	quality: number;
}

const MOVE_SPACING_MS = 40_000;
const MOVE_JITTER_MS = 30_000;
const JUDGE_JITTER_MS = 4_000;
const SKIP_RATE = 0.12;
const FIGURE_DISAGREEMENT_RATE = 0.08;

/** One shared sequence of moves per rider, in the order the random source is drawn. */
function buildMoves(
	options: GenerateNotesOptions,
	random: () => number,
): Map<string, Move[]> {
	const { scoring, riderIds } = options;
	const spread = scoring.scale.max - scoring.scale.min;
	const pick = <T>(items: T[]): T | undefined =>
		items[Math.floor(random() * items.length)];
	const moves = new Map<string, Move[]>();
	for (const riderId of riderIds) {
		const quality = scoring.scale.min + spread * (0.35 + random() * 0.4);
		const count = 3 + Math.floor(random() * 3);
		const sequence: Move[] = [];
		for (let i = 0; i < count; i++) {
			const category = pick(scoring.categories);
			if (!category) continue;
			sequence.push({
				type: category.type,
				figure: pick(category.figures ?? [])?.code,
				offsetMs: i * MOVE_SPACING_MS + random() * MOVE_JITTER_MS,
				quality: quality + (random() - 0.5) * spread * 0.3,
			});
		}
		moves.set(riderId, sequence);
	}
	return moves;
}

/**
 * Plausible, deterministic notes: each rider has one shared sequence of moves; each judge notes most
 * of them a few seconds apart, with a slightly different value, and now and then misses one.
 */
export function generateNotes(
	options: GenerateNotesOptions,
): Record<string, HeatData> {
	const { scoring, riderIds, judgeIds, startAt } = options;
	const random = createRandom(options.seed);
	const spread = scoring.scale.max - scoring.scale.min;
	const start = Date.parse(startAt);
	const pick = <T>(items: T[]): T | undefined =>
		items[Math.floor(random() * items.length)];

	const moves = buildMoves(options, random);

	const result: Record<string, HeatData> = {};
	for (const judgeId of judgeIds) {
		const rides: Ride[] = [];
		const scores: Score[] = [];
		for (const riderId of riderIds) {
			const sequence = moves.get(riderId) ?? [];
			sequence.forEach((move, i) => {
				const skipped = random() < SKIP_RATE;
				const kept =
					!skipped ||
					(i === sequence.length - 1 &&
						rides.every((r) => r.riderId !== riderId));
				const at = new Date(
					start + move.offsetMs + (random() - 0.5) * 2 * JUDGE_JITTER_MS,
				).toISOString();
				const figures =
					scoring.categories.find((c) => c.type === move.type)?.figures ?? [];
				const figure =
					random() < FIGURE_DISAGREEMENT_RATE
						? pick(figures)?.code
						: move.figure;
				const raw = move.quality + (random() - 0.5) * spread * 0.1;
				if (!kept) return;
				const id = `${judgeId}-${riderId}-${i}`;
				rides.push({
					id,
					riderId,
					type: move.type,
					at,
					...(figure !== undefined && { figure }),
				});
				scores.push({
					rideId: id,
					judgeId,
					value: snap(raw, scoring.scale),
					at,
				});
			});
		}
		result[judgeId] = { rides, scores };
	}
	return result;
}

export interface HeadJudgeOptions extends GenerateNotesOptions {
	/** Default true; false has every judge answer every ride. */
	leaveUnanswered?: boolean;
}

export interface HeadJudgeNotes {
	rides: Ride[];
	scores: Score[];
}

const UNSEEN_RATE = 0.12;
const ANSWER_DELAY_MS = 6_000;

/**
 * Head-judge data: the rides come from the shared move timeline (figures included) and every judge
 * scores them with some noise, now and then "not seen". The latest rides stay unanswered by some
 * judges (judge `i` leaves the last `i + 1`), so each queue has something waiting.
 */
export function generateHeadJudgeNotes(
	options: HeadJudgeOptions,
): HeadJudgeNotes {
	const { scoring, judgeIds, startAt, leaveUnanswered = true } = options;
	const random = createRandom(options.seed);
	const spread = scoring.scale.max - scoring.scale.min;
	const start = Date.parse(startAt);
	const moves = buildMoves(options, random);

	const timeline = [...moves].flatMap(([riderId, sequence]) =>
		sequence.map((move, i) => ({
			move,
			ride: {
				id: `ride-${riderId}-${i}`,
				riderId,
				type: move.type,
				at: new Date(start + move.offsetMs).toISOString(),
				...(move.figure !== undefined && { figure: move.figure }),
			} satisfies Ride,
		})),
	);
	timeline.sort((a, b) => Date.parse(a.ride.at) - Date.parse(b.ride.at));

	const scores: Score[] = [];
	timeline.forEach(({ move, ride }, index) => {
		const fromEnd = timeline.length - index;
		const unanswered = (j: number) => leaveUnanswered && fromEnd <= j + 1;
		const unseenBy = new Set<string>();
		judgeIds.forEach((judgeId, j) => {
			if (unanswered(j)) return;
			if (random() < UNSEEN_RATE) unseenBy.add(judgeId);
		});
		const answering = judgeIds.filter((_, j) => !unanswered(j));
		if (answering.length > 0 && answering.every((id) => unseenBy.has(id))) {
			unseenBy.delete(answering[answering.length - 1] ?? "");
		}
		judgeIds.forEach((judgeId, j) => {
			if (unanswered(j)) return;
			const raw = move.quality + (random() - 0.5) * spread * 0.1;
			scores.push({
				rideId: ride.id,
				judgeId,
				value: unseenBy.has(judgeId) ? null : snap(raw, scoring.scale),
				at: new Date(
					Date.parse(ride.at) + ANSWER_DELAY_MS + random() * ANSWER_DELAY_MS,
				).toISOString(),
			});
		});
	});
	return { rides: timeline.map((t) => t.ride), scores };
}
