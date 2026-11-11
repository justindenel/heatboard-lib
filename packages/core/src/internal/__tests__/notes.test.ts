import { describe, expect, it } from "vitest";
import { alignRides } from "../../scoring/align";
import { computeHeatResult } from "../../scoring/compute";
import type { Ride, Score } from "../../scoring/model";
import { scoringPresets } from "../../scoring/presets";
import { generateHeadJudgeNotes, generateNotes } from "../notes";

const options = {
	scoring: scoringPresets.windsurfWave,
	riderIds: ["r01", "r02", "r03", "r04"],
	judgeIds: ["judge1", "judge2", "judge3"],
	seed: 42,
	startAt: "2030-01-01T10:00:00.000Z",
};

describe("generateNotes", () => {
	it("is deterministic for a seed and varies with it", () => {
		expect(generateNotes(options)).toEqual(generateNotes(options));
		expect(generateNotes({ ...options, seed: 43 })).not.toEqual(
			generateNotes(options),
		);
	});

	it("gives each judge their own rides with valid values on the scale", () => {
		const notes = generateNotes(options);
		const { scale, categories } = scoringPresets.windsurfWave;
		expect(Object.keys(notes)).toEqual(options.judgeIds);
		for (const [judgeId, { rides, scores }] of Object.entries(notes)) {
			expect(rides.length).toBe(scores.length);
			for (const riderId of options.riderIds) {
				expect(rides.some((r) => r.riderId === riderId)).toBe(true);
			}
			for (const score of scores) {
				const value = score.value as number;
				expect(score.judgeId).toBe(judgeId);
				expect(value).toBeGreaterThanOrEqual(scale.min);
				expect(value).toBeLessThanOrEqual(scale.max);
				expect((value / scale.step) % 1).toBe(0);
			}
			for (const ride of rides) {
				expect(ride.id.startsWith(judgeId)).toBe(true);
				const category = categories.find((c) => c.type === ride.type);
				expect(category).toBeDefined();
				if (ride.figure !== undefined) {
					expect(category?.figures?.map((f) => f.code)).toContain(ride.figure);
				}
			}
		}
	});

	it("produces notes the core accepts and ranks without a tie", () => {
		const notes = Object.values(generateNotes(options));
		const rides: Ride[] = notes.flatMap((n) => n.rides);
		const scores: Score[] = notes.flatMap((n) => n.scores);
		const result = computeHeatResult(
			scoringPresets.windsurfWave,
			options.riderIds,
			rides,
			scores,
		);
		expect(result.issues).toEqual([]);
		expect(result.unresolvedTie).toBe(false);
	});

	it("gives the judges the same moves a few seconds apart, with some missed", () => {
		const riderIds = Array.from({ length: 12 }, (_, i) => `r${i + 1}`);
		const notes = Object.values(
			generateNotes({ ...options, riderIds, seed: 7 }),
		);
		const aligned = alignRides(
			scoringPresets.windsurfWave,
			notes.flatMap((n) => n.rides),
			notes.flatMap((n) => n.scores),
		);
		const groups = aligned.flatMap((r) => r.groups);
		expect(aligned).toHaveLength(riderIds.length);
		for (const rider of aligned) {
			expect(rider.groups.length).toBeGreaterThanOrEqual(3);
			expect(rider.groups.length).toBeLessThanOrEqual(5);
		}
		expect(groups.every((g) => g.of === options.judgeIds.length)).toBe(true);
		expect(groups.filter((g) => g.complete).length).toBeGreaterThan(
			groups.length / 2,
		);
		expect(groups.some((g) => !g.complete)).toBe(true);
	});
});

describe("generateHeadJudgeNotes", () => {
	const scoring = {
		...scoringPresets.windsurfWave,
		method: "rideMeans" as const,
	};
	const generated = () => generateHeadJudgeNotes({ ...options, scoring });

	it("is deterministic and announces rides from the shared timeline with their figures", () => {
		expect(generated()).toEqual(generated());
		const { rides } = generated();
		expect(rides.length).toBeGreaterThan(options.riderIds.length);
		const times = rides.map((r) => Date.parse(r.at));
		expect(times).toEqual([...times].sort((a, b) => a - b));
		for (const ride of rides) {
			const category = scoring.categories.find((c) => c.type === ride.type);
			if (ride.figure !== undefined) {
				expect(category?.figures?.map((f) => f.code)).toContain(ride.figure);
			}
		}
	});

	it("has every judge score with noise, some as not seen, never a ride nobody saw", () => {
		const { rides, scores } = generated();
		expect(scores.some((s) => s.value === null)).toBe(true);
		for (const ride of rides) {
			const given = scores.filter((s) => s.rideId === ride.id);
			if (given.length === options.judgeIds.length) {
				expect(given.some((s) => s.value !== null)).toBe(true);
			}
		}
	});

	it("leaves the latest rides unanswered by some judges so queues are not empty", () => {
		const { rides, scores } = generated();
		for (const [i, judgeId] of options.judgeIds.entries()) {
			const answered = new Set(
				scores.filter((s) => s.judgeId === judgeId).map((s) => s.rideId),
			);
			const waiting = rides.filter((r) => !answered.has(r.id));
			expect(waiting).toHaveLength(i + 1);
			expect(waiting.map((r) => r.id)).toEqual(
				rides.slice(-(i + 1)).map((r) => r.id),
			);
		}
	});

	it("is computed by the core without refusing, only reporting the unanswered rides", () => {
		const { rides, scores } = generated();
		const result = computeHeatResult(scoring, options.riderIds, rides, scores);
		expect(result.issues.every((i) => i.code === "MISSING_SCORE")).toBe(true);
		expect(result.riders.every((r) => r.total > 0)).toBe(true);
	});
});
