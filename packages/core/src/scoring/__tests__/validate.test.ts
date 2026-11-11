import { describe, expect, it } from "vitest";
import { compareAt, ridesProblem, sanitize, scaleProblem } from "../validate";
import { config, ride, score } from "./helpers";

describe("compareAt", () => {
	it("orders parseable dates chronologically", () => {
		expect(
			compareAt("2026-01-01T00:00:01Z", "2026-01-01T00:00:00Z"),
		).toBeGreaterThan(0);
		expect(
			compareAt("2026-01-01T00:00:00Z", "2026-01-01T00:00:01Z"),
		).toBeLessThan(0);
	});

	it("falls back to string order when a date cannot be parsed", () => {
		expect(compareAt("a", "b")).toBe(-1);
		expect(compareAt("b", "a")).toBe(1);
		expect(compareAt("a", "a")).toBe(0);
		expect(compareAt("not a date", "2026-01-01T00:00:00Z")).toBe(1);
	});
});

describe("sanitize duplicates with unparseable timestamps", () => {
	it("keeps the later score in string order", () => {
		const rides = [ride("r1", "a")];
		const result = sanitize(config(), ["a"], rides, [
			score("r1", "j1", 4, "b"),
			score("r1", "j1", 6, "a"),
		]);
		expect(result.issues.map((i) => i.code)).toEqual(["DUPLICATE_SCORE"]);
		expect(result.scores.map((s) => s.value)).toEqual([4]);
	});
});

describe("scaleProblem", () => {
	it("accepts steps of 1 and 0.5 on aligned bounds", () => {
		expect(scaleProblem({ min: 0, max: 10, step: 0.5 })).toBeUndefined();
		expect(scaleProblem({ min: 0, max: 10, step: 1 })).toBeUndefined();
		expect(scaleProblem({ min: 0.5, max: 9.5, step: 0.5 })).toBeUndefined();
	});

	it("names the faulty field", () => {
		expect(scaleProblem({ min: 0, max: 10, step: 0.1 })?.field).toBe("step");
		expect(scaleProblem({ min: 0.5, max: 10, step: 1 })?.field).toBe("min");
		expect(scaleProblem({ min: 0, max: 10.5, step: 1 })?.field).toBe("max");
		expect(scaleProblem({ min: 10, max: 10, step: 1 })?.field).toBe("max");
	});
});

describe("sanitize follows the scale step", () => {
	const accepted = (step: number, values: number[]) =>
		sanitize(
			config({ scale: { min: 0, max: 10, step } }),
			["a"],
			values.map((_, i) => ride(`r${i}`, "a")),
			values.map((v, i) => score(`r${i}`, "j1", v)),
		).scores.map((s) => s.value);

	it("step 0.5 accepts halves only", () => {
		expect(accepted(0.5, [5, 5.5, 5.25, 5.1])).toEqual([5, 5.5]);
	});

	it("step 1 accepts integers only", () => {
		expect(accepted(1, [5, 5.5, 10, 11])).toEqual([5, 10]);
	});
});

describe("ridesProblem", () => {
	it("accepts rides of riders of the heat", () => {
		const rides = [ride("r1", "a"), ride("r2", "b")];
		expect(ridesProblem(rides, new Set(["a", "b"]))).toBeUndefined();
	});

	it("reports a repeated ride id", () => {
		const rides = [ride("r1", "a"), ride("r1", "b")];
		expect(ridesProblem(rides, new Set(["a", "b"]))?.code).toBe(
			"DUPLICATE_RIDE",
		);
	});

	it("reports a ride of a rider who is not in the heat", () => {
		const problem = ridesProblem([ride("r1", "z")], new Set(["a"]));
		expect(problem?.code).toBe("UNKNOWN_RIDER");
		expect(problem?.details).toEqual({ rideId: "r1", riderId: "z" });
	});
});
