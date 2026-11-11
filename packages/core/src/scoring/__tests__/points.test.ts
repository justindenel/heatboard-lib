import { describe, expect, it } from "vitest";
import { computeHeatResult } from "../compute";
import {
	byJudge,
	config,
	merge,
	penalty,
	ride,
	score,
	scored,
} from "./helpers";

const total = (
	cfg = config(),
	notes: number[][],
	pens = [] as ReturnType<typeof penalty>[],
) => {
	const d = scored("a", "wave", notes);
	return computeHeatResult(cfg, ["a"], d.rides, d.scores, pens).riders[0];
};

describe("aggregation", () => {
	it("mean", () => {
		expect(total(config({ aggregation: "mean" }), [[5, 6, 8]])?.total).toBe(
			6.33,
		);
	});
	it("sum", () => {
		expect(total(config({ aggregation: "sum" }), [[5, 6, 8]])?.total).toBe(19);
	});
	it("trimmedMean with 3 notes drops highest and lowest", () => {
		expect(
			total(config({ aggregation: "trimmedMean" }), [[2, 6, 9]])?.total,
		).toBe(6);
	});
	it("trimmedMean with 2 notes is a plain mean", () => {
		expect(total(config({ aggregation: "trimmedMean" }), [[2, 7]])?.total).toBe(
			4.5,
		);
	});
});

describe("best N per type", () => {
	it("keeps the best counted rides and weights by coefficient", () => {
		const cfg = config({
			categories: [
				{ type: "wave", counted: 2 },
				{ type: "jump", counted: 1, coefficient: 1.5 },
			],
		});
		const d = merge(
			scored("a", "wave", [[3], [8], [6]]),
			scored("a", "jump", [[4], [6]]),
		);
		const r = computeHeatResult(cfg, ["a"], d.rides, d.scores).riders[0];
		expect(r?.byType).toEqual({ wave: 14, jump: 9 });
		expect(r?.total).toBe(23);
		expect(
			r?.rides
				.filter((x) => x.counted)
				.map((x) => x.value)
				.sort(),
		).toEqual([6, 6, 8]);
	});
});

describe("penalties", () => {
	const notes = [[8], [6], [4]];
	it("halfSecondBest halves the second best", () => {
		expect(
			total(config(), notes, [penalty("a", "halfSecondBest")])?.total,
		).toBe(11);
	});
	it("zeroSecondBest zeroes the second best", () => {
		expect(
			total(config(), notes, [penalty("a", "zeroSecondBest")])?.total,
		).toBe(8);
	});
	it("zeroBest zeroes the best", () => {
		expect(total(config(), notes, [penalty("a", "zeroBest")])?.total).toBe(6);
	});
	it("cumulates in the given order on the kept list", () => {
		const r = total(config(), notes, [
			penalty("a", "zeroBest"),
			penalty("a", "halfSecondBest"),
		]);
		expect(r?.total).toBe(3);
		expect(r?.interferences).toBe(2);
		expect(r?.dsqSuggested).toBe(true);
	});
	it("has no effect when the targeted value does not exist", () => {
		const r = total(
			config({ categories: [{ type: "wave", counted: 1 }] }),
			notes,
			[penalty("a", "zeroSecondBest")],
		);
		expect(r?.total).toBe(8);
		expect(r?.dsqSuggested).toBe(false);
	});
	it("rounds half to the hundredth", () => {
		expect(
			total(config(), [[8], [0.5]], [penalty("a", "halfSecondBest")])?.total,
		).toBe(8.25);
	});
});

describe("tie-break", () => {
	const run = (
		cfg: ReturnType<typeof config>,
		a: Parameters<typeof scored>[2],
		b: Parameters<typeof scored>[2],
		type = "wave",
	) => {
		const d = merge(scored("a", type, a), scored("b", type, b));
		return computeHeatResult(cfg, ["a", "b"], d.rides, d.scores);
	};
	it("best single score first", () => {
		const r = run(config(), [[9], [3]], [[6], [6]]);
		expect(r.riders.map((x) => x.riderId)).toEqual(["a", "b"]);
		expect(r.unresolvedTie).toBe(false);
	});
	it("then the next one", () => {
		const cfg = config({ categories: [{ type: "wave", counted: 3 }] });
		const r = run(cfg, [[9], [5], [1]], [[9], [4], [2]]);
		expect(r.riders.map((x) => x.riderId)).toEqual(["a", "b"]);
	});
	it("priorityType compares the best of that type first", () => {
		const cfg = config({
			categories: [
				{ type: "wave", counted: 1 },
				{ type: "jump", counted: 1 },
			],
			priorityType: "jump",
		});
		const d = merge(
			scored("a", "wave", [[9]]),
			scored("a", "jump", [[3]]),
			scored("b", "wave", [[4]]),
			scored("b", "jump", [[8]]),
		);
		const r = computeHeatResult(cfg, ["a", "b"], d.rides, d.scores);
		expect(r.riders[0]?.total).toBe(12);
		expect(r.riders.map((x) => x.riderId)).toEqual(["b", "a"]);
	});
	it("the longer list wins on equal prefix", () => {
		const cfg = config({ categories: [{ type: "wave", counted: 3 }] });
		const r = run(cfg, [[6], [4]], [[6], [4], [0]]);
		expect(r.riders.map((x) => x.riderId)).toEqual(["b", "a"]);
	});
	it("persistent tie shares the rank", () => {
		const r = run(config(), [[6], [4]], [[4], [6]]);
		expect(r.riders.map((x) => [x.rank, x.tied])).toEqual([
			[1, true],
			[1, true],
		]);
		expect(r.unresolvedTie).toBe(true);
	});
});

describe("precision", () => {
	it("sums 0.1 and 0.2 exactly", () => {
		const r = total(config({ categories: [{ type: "wave", counted: 2 }] }), [
			[0.1],
			[0.2],
		]);
		expect(r?.total).toBe(0.3);
	});
});

describe("riders without rides", () => {
	it("are listed with a zero total, in input order", () => {
		const r = computeHeatResult(config(), ["a", "b"], [], []);
		expect(r.riders.map((x) => [x.riderId, x.total, x.rank])).toEqual([
			["a", 0, 1],
			["b", 0, 1],
		]);
	});
});

describe("coefficient precision", () => {
	const weighted = (note: number, coefficient: number) => {
		const cfg = config({
			scale: { min: 0, max: 10, step: 0.01 },
			categories: [{ type: "wave", counted: 1, coefficient }],
		});
		return total(cfg, [[note]])?.total;
	};
	it("rounds half up without float error", () => {
		expect(weighted(0.45, 0.7)).toBe(0.32);
		expect(weighted(0.5, 1.15)).toBe(0.58);
	});
	it("matches an integer reference over a sweep", () => {
		for (const cents of [1, 5, 45, 99, 250, 333, 705, 999]) {
			for (const coefficient of [0.1, 0.35, 0.7, 1.15, 1.5, 2.05]) {
				const expected =
					Math.floor((cents * Math.round(coefficient * 1000) + 500) / 1000) /
					100;
				expect(weighted(cents / 100, coefficient)).toBe(expected);
			}
		}
	});
});

describe("per-judge totals", () => {
	const cfg = (extra = {}) =>
		config({ categories: [{ type: "wave", counted: 2 }], ...extra });
	const three = () =>
		merge(
			byJudge("j1", "a", "wave", [8, 6]),
			byJudge("j2", "a", "wave", [4, 2]),
			byJudge("j3", "a", "wave", [10, 10]),
		);
	const totalOf = (c: ReturnType<typeof config>, d = three()) =>
		computeHeatResult(c, ["a"], d.rides, d.scores).riders[0];

	it("aggregates the judges' totals, not ride by ride", () => {
		expect(totalOf(cfg({ aggregation: "mean" }))?.total).toBe(13.33);
		expect(totalOf(cfg({ aggregation: "sum" }))?.total).toBe(40);
		expect(totalOf(cfg({ aggregation: "trimmedMean" }))?.total).toBe(14);
	});

	it("trimmedMean is a plain mean with fewer than 3 judges", () => {
		const d = merge(
			byJudge("j1", "a", "wave", [8, 6]),
			byJudge("j2", "a", "wave", [4, 2]),
		);
		expect(totalOf(cfg({ aggregation: "trimmedMean" }), d)?.total).toBe(10);
	});

	it("keeps the best counted rides of each judge separately", () => {
		const d = merge(
			byJudge("j1", "a", "wave", [9, 1]),
			byJudge("j2", "a", "wave", [1, 9]),
		);
		const r = totalOf(cfg({ categories: [{ type: "wave", counted: 1 }] }), d);
		expect(r?.total).toBe(9);
		expect(r?.rides.filter((x) => x.counted).map((x) => x.judgeId)).toEqual([
			"j1",
			"j2",
		]);
	});

	it("flags counted rides relative to their own judge", () => {
		const d = merge(
			byJudge("j1", "a", "wave", [3, 8, 6]),
			byJudge("j2", "a", "wave", [2]),
		);
		const r = totalOf(cfg(), d);
		expect(r?.rides.map((x) => [x.judgeId, x.value, x.counted]).sort()).toEqual(
			[
				["j1", 3, false],
				["j1", 6, true],
				["j1", 8, true],
				["j2", 2, true],
			],
		);
	});

	it("aggregates byType the same way and applies coefficients per judge", () => {
		const c = config({
			categories: [
				{ type: "wave", counted: 1 },
				{ type: "jump", counted: 1, coefficient: 2 },
			],
		});
		const d = merge(
			byJudge("j1", "a", "wave", [6]),
			byJudge("j1", "a", "jump", [3]),
			byJudge("j2", "a", "wave", [4]),
			byJudge("j2", "a", "jump", [5]),
		);
		const r = totalOf(c, d);
		expect(r?.byType).toEqual({ wave: 5, jump: 8 });
		expect(r?.total).toBe(13);
	});

	it("applies a penalty to each judge's retained values", () => {
		const d = merge(
			byJudge("j1", "a", "wave", [8, 6]),
			byJudge("j2", "a", "wave", [4, 2]),
		);
		const r = computeHeatResult(cfg(), ["a"], d.rides, d.scores, [
			penalty("a", "zeroBest"),
		]).riders[0];
		expect(r?.total).toBe(4);
	});

	it("treats a judge without ride for a rider as a zero total", () => {
		const d = merge(
			byJudge("j1", "a", "wave", [8]),
			byJudge("j2", "a", "wave", [8]),
			byJudge("j1", "b", "wave", [8]),
		);
		const r = computeHeatResult(cfg(), ["a", "b"], d.rides, d.scores);
		expect(r.riders.map((x) => [x.riderId, x.total])).toEqual([
			["a", 8],
			["b", 4],
		]);
	});

	it("breaks a total tie with the best single note across judges", () => {
		const c = cfg({ categories: [{ type: "wave", counted: 1 }] });
		const d = merge(
			byJudge("j1", "a", "wave", [9]),
			byJudge("j2", "a", "wave", [1]),
			byJudge("j1", "b", "wave", [5]),
			byJudge("j2", "b", "wave", [5]),
		);
		const r = computeHeatResult(c, ["a", "b"], d.rides, d.scores);
		expect(r.riders.map((x) => [x.riderId, x.total])).toEqual([
			["a", 5],
			["b", 5],
		]);
		expect(r.unresolvedTie).toBe(false);
	});

	it("is a tie when totals and every note match", () => {
		const d = merge(
			byJudge("j1", "a", "wave", [6]),
			byJudge("j2", "a", "wave", [4]),
			byJudge("j1", "b", "wave", [4]),
			byJudge("j2", "b", "wave", [6]),
		);
		const r = computeHeatResult(
			cfg({ categories: [{ type: "wave", counted: 1 }] }),
			["a", "b"],
			d.rides,
			d.scores,
		);
		expect(r.unresolvedTie).toBe(true);
	});

	it("keeps the legacy single-judge behaviour unchanged", () => {
		const d = byJudge("j1", "a", "wave", [8, 6, 3]);
		expect(totalOf(cfg(), d)?.total).toBe(14);
	});
});

describe("head-judge mode, ride not seen by a judge", () => {
	const rides = [ride("a1", "a"), ride("b1", "b")];
	const notes = [
		score("a1", "j1", 9),
		{ rideId: "a1", judgeId: "j2", value: null, at: "" },
		score("b1", "j1", 6),
		score("b1", "j2", 6),
	];

	it("counts, for that judge, the mean of the judges who saw it", () => {
		const r = computeHeatResult(config(), ["a", "b"], rides, notes, [], {
			judgingMode: "headJudge",
		});
		expect(r.riders.map((x) => [x.riderId, x.rank, x.total])).toEqual([
			["a", 1, 9],
			["b", 2, 6],
		]);
	});

	it("does not substitute a ride nobody saw", () => {
		const r = computeHeatResult(
			config(),
			["a"],
			[ride("a1", "a")],
			[
				{ rideId: "a1", judgeId: "j1", value: null, at: "" },
				{ rideId: "a1", judgeId: "j2", value: null, at: "" },
			],
			[],
			{ judgingMode: "headJudge" },
		);
		expect(r.riders[0]?.total).toBe(0);
	});
});
