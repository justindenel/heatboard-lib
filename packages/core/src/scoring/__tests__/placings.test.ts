import { describe, expect, it } from "vitest";
import { computeHeatResult } from "../compute";
import { byJudge, config, merge, ride, score, scored } from "./helpers";

const cfg = (extra = {}) =>
	config({
		method: "placings",
		categories: [{ type: "wave", counted: 1 }],
		...extra,
	});

describe("placings", () => {
	it("a harsh but consistent judge does not change the ranking, unlike points", () => {
		const d = merge(
			scored("a", "wave", [[6, 6, 2]]),
			scored("b", "wave", [[5, 5, 5]]),
			scored("c", "wave", [[1, 1, 1]]),
		);
		const ids = ["a", "b", "c"];
		const placings = computeHeatResult(cfg(), ids, d.rides, d.scores);
		const points = computeHeatResult(
			config({ method: "points" }),
			ids,
			d.rides,
			d.scores,
		);
		expect(placings.riders.map((r) => r.riderId)).toEqual(["a", "b", "c"]);
		expect(points.riders.map((r) => r.riderId)).toEqual(["b", "a", "c"]);
		expect(placings.riders[0]?.placingsSum).toBe(4);
	});

	it("a tie within a judge is split by the best single ride", () => {
		const d = merge(
			scored("a", "wave", [[9], [3]]),
			scored("b", "wave", [[6], [6]]),
		);
		const r = computeHeatResult(
			cfg({ categories: [{ type: "wave", counted: 2 }] }),
			["a", "b"],
			d.rides,
			d.scores,
		);
		expect(r.riders.map((x) => [x.riderId, x.placesByJudge])).toEqual([
			["a", { j1: 1 }],
			["b", { j1: 2 }],
		]);
		expect(r.unresolvedTie).toBe(false);
	});

	it("shares the average place when the tie persists", () => {
		const tied = merge(scored("a", "wave", [[7]]), scored("b", "wave", [[7]]));
		const r = computeHeatResult(cfg(), ["a", "b"], tied.rides, tied.scores);
		expect(r.riders.map((x) => x.placesByJudge)).toEqual([
			{ j1: 1.5 },
			{ j1: 1.5 },
		]);
		expect(r.unresolvedTie).toBe(true);
	});

	it("breaks equal place sums with the points total", () => {
		const d = merge(
			scored("a", "wave", [[9, 5]]),
			scored("b", "wave", [[8, 6.5]]),
		);
		const r = computeHeatResult(cfg(), ["a", "b"], d.rides, d.scores);
		expect(r.riders.map((x) => [x.riderId, x.placingsSum])).toEqual([
			["b", 3],
			["a", 3],
		]);
		expect(r.riders[0]?.tied).toBe(false);
		expect(r.riders[0]?.rank).toBe(1);
	});

	it("trimPlacings drops best and worst place only from 5 judges", () => {
		const build = (judges: number) => {
			const row = (v: number) => Array.from({ length: judges }, () => v);
			const a = row(8);
			const b = row(5);
			a[0] = 1;
			b[0] = 9;
			return merge(scored("a", "wave", [a]), scored("b", "wave", [b]));
		};
		const run = (judges: number, trim: boolean) => {
			const d = build(judges);
			return computeHeatResult(
				cfg({ trimPlacings: trim }),
				["a", "b"],
				d.rides,
				d.scores,
			);
		};
		expect(
			run(4, true).riders.find((r) => r.riderId === "a")?.placingsSum,
		).toBe(5);
		expect(
			run(5, false).riders.find((r) => r.riderId === "a")?.placingsSum,
		).toBe(6);
		expect(
			run(5, true).riders.find((r) => r.riderId === "a")?.placingsSum,
		).toBe(3);
	});

	it("ignores a ride a judge did not score for that judge", () => {
		const d = merge(scored("a", "wave", [[7, 7]]), scored("b", "wave", [[5]]));
		const r = computeHeatResult(cfg(), ["a", "b"], d.rides, d.scores);
		expect(r.riders.find((x) => x.riderId === "b")?.placesByJudge).toEqual({
			j1: 2,
			j2: 2,
		});
		expect(r.riders.find((x) => x.riderId === "b")?.missingScores).toBe(true);
	});
});

describe("placings with per-judge rides", () => {
	it("ranks each judge on his own rides, with different ride counts", () => {
		const d = merge(
			byJudge("j1", "a", "wave", [7]),
			byJudge("j1", "b", "wave", [5]),
			byJudge("j2", "a", "wave", [4, 3]),
			byJudge("j2", "b", "wave", [6]),
		);
		const r = computeHeatResult(
			cfg({ categories: [{ type: "wave", counted: 2 }] }),
			["a", "b"],
			d.rides,
			d.scores,
		);
		expect(r.riders.map((x) => [x.riderId, x.placesByJudge])).toEqual([
			["a", { j1: 1, j2: 1 }],
			["b", { j1: 2, j2: 2 }],
		]);
	});

	it("breaks equal place sums with the aggregated judge totals", () => {
		const d = merge(
			byJudge("j1", "a", "wave", [7]),
			byJudge("j1", "b", "wave", [5]),
			byJudge("j2", "a", "wave", [4]),
			byJudge("j2", "b", "wave", [6]),
		);
		const r = computeHeatResult(cfg(), ["a", "b"], d.rides, d.scores);
		expect(r.riders.map((x) => [x.riderId, x.placingsSum, x.total])).toEqual([
			["a", 3, 5.5],
			["b", 3, 5.5],
		]);
		expect(r.riders[0]?.riderId).toBe("a");
		expect(r.unresolvedTie).toBe(false);
	});
});

describe("placings in head-judge mode, ride not seen by a judge", () => {
	it("places the judge with the mean of the judges who saw the ride", () => {
		const r = computeHeatResult(
			cfg(),
			["a", "b"],
			[ride("a1", "a"), ride("b1", "b")],
			[
				score("a1", "j1", 9),
				{ rideId: "a1", judgeId: "j2", value: null, at: "" },
				score("b1", "j1", 6),
				score("b1", "j2", 6),
			],
			[],
			{ judgingMode: "headJudge" },
		);
		expect(
			r.riders.map((x) => [x.riderId, x.rank, x.placingsSum, x.placesByJudge]),
		).toEqual([
			["a", 1, 2, { j1: 1, j2: 1 }],
			["b", 2, 4, { j1: 2, j2: 2 }],
		]);
	});
});
