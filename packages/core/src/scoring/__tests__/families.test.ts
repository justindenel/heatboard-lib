import { describe, expect, it } from "vitest";
import { computeHeatResult } from "../compute";
import { scoringProblem } from "../validate";
import type { ScoringCategory, ScoringConfig } from "../model";
import { config, halfStepScale, ride, score } from "./helpers";

const jump = (extra: Partial<ScoringCategory> = {}): ScoringCategory => ({
	type: "jump",
	counted: 2,
	distinctFamilies: true,
	families: [
		{ id: "fwd", name: "Forward" },
		{ id: "back", name: "Backward" },
	],
	figures: [
		{ code: "F", family: "fwd", variants: ["1H"] },
		{ code: "B", family: "back", variants: ["1H"] },
		{ code: "P", family: "back" },
	],
	...extra,
});

const withJump = (extra: Partial<ScoringCategory> = {}): ScoringConfig =>
	config({
		scale: halfStepScale,
		categories: [jump(extra)],
		variants: [{ code: "1H", name: "One hand", suffix: "1H" }],
	});

function run(
	scoring: ScoringConfig,
	entries: Array<[string | undefined, number, string?]>,
) {
	const rides = entries.map(([figure, , variant], i) =>
		ride(`r${i}`, "a", "jump", {
			...(figure === undefined ? {} : { figure }),
			...(variant === undefined ? {} : { variant }),
		}),
	);
	const scores = entries.map(([, value], i) => score(`r${i}`, "j1", value));
	return computeHeatResult(scoring, ["a"], rides, scores);
}

const countedIds = (r: ReturnType<typeof run>) =>
	r.riders[0]?.rides.filter((x) => x.counted).map((x) => x.rideId);

describe("scoringProblem families", () => {
	it("accepts a valid config", () => {
		expect(scoringProblem(withJump())).toBeUndefined();
	});

	it("rejects a repeated family id", () => {
		const problem = scoringProblem(
			withJump({
				families: [
					{ id: "a", name: "A" },
					{ id: "a", name: "A bis" },
				],
				figures: [],
			}),
		);
		expect(problem?.field).toBe("categories.0.families.1.id");
	});

	it("rejects a figure of an unknown family", () => {
		const problem = scoringProblem(
			withJump({ figures: [{ code: "X", family: "nope" }] }),
		);
		expect(problem?.field).toBe("categories.0.figures.0.family");
	});

	it("rejects a repeated figure code", () => {
		const problem = scoringProblem(
			withJump({
				figures: [
					{ code: "F", family: "fwd" },
					{ code: "F", family: "back" },
				],
			}),
		);
		expect(problem?.field).toBe("categories.0.figures.1.code");
	});

	it("rejects a figure variant missing from the scoring list", () => {
		const scoring = { ...withJump(), variants: [] };
		expect(scoringProblem(scoring)?.field).toBe(
			"categories.0.figures.0.variants",
		);
	});

	it("rejects distinct families with fewer than two families", () => {
		const problem = scoringProblem(
			withJump({
				families: [{ id: "fwd", name: "Forward" }],
				figures: [{ code: "F", family: "fwd" }],
			}),
		);
		expect(problem?.field).toBe("categories.0.distinctFamilies");
	});
});

describe("distinct families counting", () => {
	it("picks the best allowed set instead of the two best rides", () => {
		const r = run(withJump(), [
			["B", 8],
			["B", 7.5],
			["F", 6],
		]);
		expect(r.riders[0]?.total).toBe(14);
		expect(countedIds(r)).toEqual(["r0", "r2"]);
	});

	it("takes the two best rides when the option is off", () => {
		const r = run(withJump({ distinctFamilies: false }), [
			["B", 8],
			["B", 7.5],
			["F", 6],
		]);
		expect(r.riders[0]?.total).toBe(15.5);
	});

	it("counts a single ride when only one family was ridden", () => {
		const r = run(withJump(), [
			["B", 8],
			["P", 7],
		]);
		expect(r.riders[0]?.total).toBe(8);
	});

	it("keeps the earliest ride on equal values within a family", () => {
		const r = run(withJump(), [
			["B", 8],
			["P", 8],
			["F", 5],
		]);
		expect(countedIds(r)).toEqual(["r0", "r2"]);
	});

	it("keeps the base family for a variant", () => {
		const r = run(withJump(), [
			["B", 8, "1H"],
			["B", 7.5],
			["F", 6],
		]);
		expect(r.issues).toEqual([]);
		expect(r.riders[0]?.total).toBe(14);
	});

	it("never excludes rides without figure, even two together", () => {
		const r = run(withJump(), [
			[undefined, 8],
			[undefined, 7],
			["B", 6],
		]);
		expect(r.riders[0]?.total).toBe(15);
	});

	it("combines a ride without figure with any family", () => {
		const r = run(withJump(), [
			["B", 8],
			["P", 7.5],
			[undefined, 6],
		]);
		expect(r.riders[0]?.total).toBe(14);
	});
});

describe("UNKNOWN_VARIANT", () => {
	it("flags a variant the figure does not accept", () => {
		const r = run(withJump(), [["P", 7, "1H"]]);
		expect(r.issues.map((i) => i.code)).toEqual(["UNKNOWN_VARIANT"]);
		expect(r.riders[0]?.total).toBe(7);
	});

	it("flags a variant without figure", () => {
		const r = run(withJump(), [[undefined, 7, "1H"]]);
		expect(r.issues.map((i) => i.code)).toEqual(["UNKNOWN_VARIANT"]);
	});

	it("passes the variant through to the ride result", () => {
		const r = run(withJump(), [["B", 7, "1H"]]);
		expect(r.riders[0]?.rides[0]?.variant).toBe("1H");
	});
});
