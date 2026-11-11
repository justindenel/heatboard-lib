import { describe, expect, it } from "vitest";
import { computeHeatResult } from "../compute";
import { rankingFromResult } from "../ranking";
import { config, merge, ride, score, scored } from "./helpers";

const codes = (r: ReturnType<typeof computeHeatResult>) =>
	r.issues.map((i) => i.code);

describe("issues", () => {
	it("INVALID_SCORE for out of range and off-grid notes", () => {
		const rides = [ride("r1", "a")];
		const r = computeHeatResult(config(), ["a"], rides, [
			score("r1", "j1", 11),
			score("r1", "j2", 5.55),
			score("r1", "j3", 5.5),
		]);
		expect(codes(r)).toEqual(["INVALID_SCORE", "INVALID_SCORE"]);
		expect(r.riders[0]?.total).toBe(5.5);
	});

	it("UNKNOWN_TYPE excludes the ride", () => {
		const d = scored("a", "spin", [[5]]);
		const r = computeHeatResult(config(), ["a"], d.rides, d.scores);
		expect(codes(r)).toEqual(["UNKNOWN_TYPE"]);
		expect(r.riders[0]?.rides).toEqual([]);
	});

	it("UNKNOWN_RIDE for a score on a missing ride", () => {
		const r = computeHeatResult(config(), ["a"], [], [score("nope", "j1", 5)]);
		expect(codes(r)).toEqual(["UNKNOWN_RIDE"]);
	});

	it("UNKNOWN_RIDER excludes the ride", () => {
		const d = scored("z", "wave", [[5]]);
		const r = computeHeatResult(config(), ["a"], d.rides, d.scores);
		expect(codes(r)).toEqual(["UNKNOWN_RIDER"]);
		expect(r.riders).toHaveLength(1);
	});

	it("DUPLICATE_SCORE keeps the most recent, whatever the input order", () => {
		const rides = [ride("r1", "a")];
		const newer = score("r1", "j1", 8, "2026-02-01T00:00:00.000Z");
		const older = score("r1", "j1", 3, "2026-01-01T00:00:00.000Z");
		for (const scores of [
			[older, newer],
			[newer, older],
		]) {
			const r = computeHeatResult(config(), ["a"], rides, scores);
			expect(codes(r)).toEqual(["DUPLICATE_SCORE"]);
			expect(r.riders[0]?.total).toBe(8);
		}
	});

	it("MISSING_SCORE per rider a judge did not score, calculation continues", () => {
		const d = merge(scored("a", "wave", [[6, 8]]), scored("b", "wave", [[7]]));
		const r = computeHeatResult(config(), ["a", "b"], d.rides, d.scores);
		expect(r.issues.map((i) => [i.code, i.details])).toEqual([
			["MISSING_SCORE", { riderId: "b", judgeId: "j2" }],
		]);
		expect(r.riders.find((x) => x.riderId === "b")?.missingScores).toBe(true);
		expect(r.riders.find((x) => x.riderId === "a")?.missingScores).toBe(false);
		expect(r.riders.find((x) => x.riderId === "b")?.total).toBe(3.5);
	});

	it("MISSING_SCORE for a ride whose only score was dropped", () => {
		const r = computeHeatResult(
			config(),
			["a"],
			[ride("r1", "a")],
			[score("r1", "j1", 11)],
		);
		expect(codes(r)).toEqual(["INVALID_SCORE", "MISSING_SCORE"]);
		expect(r.riders[0]?.missingScores).toBe(true);
	});

	it("RIDE_MULTIPLE_JUDGES keeps the judge who scored first", () => {
		const rides = [ride("r1", "a")];
		const first = score("r1", "j2", 4, "2026-01-01T00:00:00.000Z");
		const later = score("r1", "j1", 9, "2026-01-02T00:00:00.000Z");
		for (const scores of [
			[first, later],
			[later, first],
		]) {
			const r = computeHeatResult(config(), ["a"], rides, scores);
			expect(r.issues.map((i) => [i.code, i.details])).toEqual([
				[
					"RIDE_MULTIPLE_JUDGES",
					{ rideId: "r1", judgeId: "j1", ownerJudgeId: "j2" },
				],
			]);
			expect(r.riders[0]?.total).toBe(4);
			expect(r.riders[0]?.rides[0]).toMatchObject({
				judgeId: "j2",
				judges: 1,
			});
		}
	});

	it("RIDE_MULTIPLE_JUDGES lists every other judge", () => {
		const rides = [ride("r1", "a")];
		const r = computeHeatResult(config(), ["a"], rides, [
			score("r1", "j1", 4, "2026-01-01T00:00:00.000Z"),
			score("r1", "j2", 5, "2026-01-02T00:00:00.000Z"),
			score("r1", "j3", 6, "2026-01-03T00:00:00.000Z"),
		]);
		expect(codes(r)).toEqual(["RIDE_MULTIPLE_JUDGES", "RIDE_MULTIPLE_JUDGES"]);
		expect(r.riders[0]?.total).toBe(4);
	});

	it("a judge's repeated score does not count as a second judge", () => {
		const rides = [ride("r1", "a")];
		const r = computeHeatResult(config(), ["a"], rides, [
			score("r1", "j1", 4, "2026-01-01T00:00:00.000Z"),
			score("r1", "j1", 6, "2026-01-02T00:00:00.000Z"),
		]);
		expect(codes(r)).toEqual(["DUPLICATE_SCORE"]);
	});

	describe("UNKNOWN_FIGURE", () => {
		const jumps = (figures?: string[]) =>
			config({
				categories: [
					{
						type: "jump",
						counted: 2,
						...(figures === undefined
							? {}
							: {
									families: [{ id: "f", name: "F" }],
									figures: figures.map((code) => ({ code, family: "f" })),
								}),
					},
				],
			});
		const withFigure = (figure?: string) => [
			ride("r1", "a", "jump", figure === undefined ? {} : { figure }),
		];

		it("accepts a listed figure and a ride without figure", () => {
			for (const figure of ["Backloop", undefined]) {
				const r = computeHeatResult(
					jumps(["Backloop", "Forward"]),
					["a"],
					withFigure(figure),
					[score("r1", "j1", 7)],
				);
				expect(r.issues).toEqual([]);
			}
		});

		it("reports an unlisted figure but still counts the ride", () => {
			const r = computeHeatResult(
				jumps(["Backloop"]),
				["a"],
				withFigure("Forward"),
				[score("r1", "j1", 7)],
			);
			expect(r.issues.map((i) => [i.code, i.details])).toEqual([
				["UNKNOWN_FIGURE", { rideId: "r1", type: "jump", figure: "Forward" }],
			]);
			expect(r.riders[0]?.total).toBe(7);
		});

		it("reports any figure on a category with an empty or absent list", () => {
			for (const list of [[], undefined]) {
				const r = computeHeatResult(jumps(list), ["a"], withFigure("X"), [
					score("r1", "j1", 7),
				]);
				expect(codes(r)).toEqual(["UNKNOWN_FIGURE"]);
			}
		});

		it("checks the figure against the category of the ride", () => {
			const cfg = config({
				categories: [
					{ type: "wave", counted: 1 },
					{
						type: "jump",
						counted: 1,
						families: [{ id: "f", name: "F" }],
						figures: [{ code: "Backloop", family: "f" }],
					},
				],
			});
			const r = computeHeatResult(
				cfg,
				["a"],
				[ride("r1", "a", "wave", { figure: "Backloop" })],
				[score("r1", "j1", 7)],
			);
			expect(codes(r)).toEqual(["UNKNOWN_FIGURE"]);
		});

		it("does not double-report a ride already excluded for its type", () => {
			const r = computeHeatResult(
				jumps(["Backloop"]),
				["a"],
				[ride("r1", "a", "spin", { figure: "Backloop" })],
				[],
			);
			expect(codes(r)).toEqual(["UNKNOWN_TYPE"]);
		});
	});

	it("restores the figure and sorts rides by date", () => {
		const rides = [
			ride("late", "a", "wave", {
				at: "2026-01-02T00:00:00.000Z",
				figure: "FS360",
			}),
			ride("early", "a", "wave", { at: "2026-01-01T00:00:00.000Z" }),
		];
		const r = computeHeatResult(config(), ["a"], rides, [
			score("late", "j1", 5),
			score("early", "j1", 4),
		]);
		expect(r.riders[0]?.rides.map((x) => x.rideId)).toEqual(["early", "late"]);
		expect(r.riders[0]?.rides[1]?.figure).toBe("FS360");
		expect("figure" in (r.riders[0]?.rides[0] ?? {})).toBe(false);
	});
});

describe("duplicate rides", () => {
	it("keeps the first ride when the same ride is sent twice", () => {
		const first = ride("r1", "a");
		const rides = [first, { ...first }];
		const r = computeHeatResult(
			config({ categories: [{ type: "wave", counted: 2 }] }),
			["a"],
			rides,
			[score("r1", "j1", 8)],
		);
		expect(codes(r)).toEqual(["DUPLICATE_RIDE"]);
		expect(r.riders[0]?.total).toBe(8);
		expect(r.riders[0]?.rides).toHaveLength(1);
	});

	it("flags a reused id even for another rider", () => {
		const rides = [ride("r1", "a"), ride("r1", "b")];
		const r = computeHeatResult(config(), ["a", "b"], rides, [
			score("r1", "j1", 8),
		]);
		expect(codes(r)).toEqual(["DUPLICATE_RIDE", "MISSING_SCORE"]);
		expect(r.riders.find((x) => x.riderId === "b")?.rides).toEqual([]);
		expect(r.riders.find((x) => x.riderId === "a")?.total).toBe(8);
	});
});

describe("rankingFromResult", () => {
	it("returns arrival order when there is no tie", () => {
		const d = merge(scored("a", "wave", [[3]]), scored("b", "wave", [[9]]));
		const r = computeHeatResult(config(), ["a", "b"], d.rides, d.scores);
		expect(rankingFromResult(r)).toEqual({ ok: true, riderIds: ["b", "a"] });
	});
	it("returns the tied groups otherwise", () => {
		const d = merge(
			scored("a", "wave", [[5]]),
			scored("b", "wave", [[5]]),
			scored("c", "wave", [[9]]),
		);
		const r = computeHeatResult(config(), ["a", "b", "c"], d.rides, d.scores);
		expect(rankingFromResult(r)).toEqual({
			ok: false,
			tiedRiderIds: [["a", "b"]],
		});
	});
});

describe("immutability", () => {
	it("does not mutate its inputs", () => {
		const d = merge(
			scored("a", "wave", [[3, 4]]),
			scored("b", "wave", [[9, 1]]),
		);
		const ids = ["a", "b"];
		const pens = [{ riderId: "a", type: "wave", kind: "zeroBest" as const }];
		const before = structuredClone({ ids, d, pens });
		const cfg = config({ method: "placings" });
		const cfgBefore = structuredClone(cfg);
		computeHeatResult(cfg, ids, d.rides, d.scores, pens);
		expect({ ids, d, pens }).toEqual(before);
		expect(cfg).toEqual(cfgBefore);
	});
});
