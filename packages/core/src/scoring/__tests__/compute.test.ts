import { describe, expect, it } from "vitest";
import { computeHeatResult } from "../compute";
import { config, ride, score } from "./helpers";

describe("rides without any score", () => {
	it("reports the ride and the judge's missing rider, values the ride at 0", () => {
		const rides = [ride("a1", "a"), ride("b1", "b")];
		const result = computeHeatResult(config(), ["a", "b"], rides, [
			score("a1", "j1", 7),
		]);
		expect(result.issues.map((i) => [i.code, i.details])).toEqual([
			["MISSING_SCORE", { rideId: "b1" }],
			["MISSING_SCORE", { riderId: "b", judgeId: "j1" }],
		]);
		const b = result.riders.find((r) => r.riderId === "b");
		expect(b).toMatchObject({
			rank: 2,
			total: 0,
			missingScores: true,
			rides: [{ rideId: "b1", value: 0, judges: 0, counted: false }],
		});
		expect(result.riders[0]).toMatchObject({ riderId: "a", total: 7 });
	});

	it("placings: no judge means empty places, a zero sum and a tie", () => {
		const rides = [ride("a1", "a"), ride("b1", "b")];
		const result = computeHeatResult(
			config({ method: "placings" }),
			["a", "b"],
			rides,
			[],
		);
		expect(result.unresolvedTie).toBe(true);
		for (const rider of result.riders) {
			expect(rider).toMatchObject({
				rank: 1,
				tied: true,
				placingsSum: 0,
				placesByJudge: {},
			});
		}
	});
});
