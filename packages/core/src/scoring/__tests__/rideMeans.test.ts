import { describe, expect, it } from "vitest";
import type { HeatData } from "../../lifecycle/scoring";
import { computeHeatResult } from "../compute";
import { scoreNeeded } from "../needed";
import { config, ride, score } from "./helpers";
import { applyAction } from "../../actions";
import { okBracket, sampleBracket } from "../../__tests__/fixtures";

const m3 = (extra = {}) =>
	config({
		method: "rideMeans",
		scale: { min: 0, max: 10, step: 0.5 },
		categories: [
			{ type: "wave", counted: 1 },
			{
				type: "jump",
				counted: 1,
				coefficient: 2,
				families: [{ id: "f", name: "F" }],
				figures: [{ code: "B", family: "f" }],
			},
		],
		...extra,
	});

const compute = (
	cfg: ReturnType<typeof m3>,
	rides: ReturnType<typeof ride>[],
	scores: ReturnType<typeof score>[],
	riders = ["a", "b"],
) => computeHeatResult(cfg, riders, rides, scores, [], {});

describe("rideMeans compute", () => {
	const rides = [
		ride("w1", "a", "wave"),
		ride("w2", "a", "wave"),
		ride("j1", "a", "jump", { figure: "B" }),
		ride("w3", "b", "wave"),
	];

	it("means the judges' notes per ride, keeps the best, applies coefficients", () => {
		const result = compute(m3(), rides, [
			score("w1", "j1", 6),
			score("w1", "j2", 7),
			score("w2", "j1", 4),
			score("w2", "j2", 5),
			score("j1", "j1", 3),
			score("j1", "j2", 4),
			score("w3", "j1", 8),
			score("w3", "j2", 8),
		]);
		const a = result.riders.find((r) => r.riderId === "a");
		const b = result.riders.find((r) => r.riderId === "b");
		expect(a?.byType).toEqual({ wave: 6.5, jump: 7 });
		expect(a?.total).toBe(13.5);
		expect(
			a?.rides.map((r) => [r.rideId, r.value, r.counted, r.judges]),
		).toEqual([
			["w1", 6.5, true, 2],
			["w2", 4.5, false, 2],
			["j1", 3.5, true, 2],
		]);
		expect(a?.rides[0]?.scores).toEqual([
			{ judgeId: "j1", value: 6 },
			{ judgeId: "j2", value: 7 },
		]);
		expect(b?.rank).toBe(2);
		expect(a?.rank).toBe(1);
		expect(result.issues).toEqual([]);
	});

	it("leaves unseen notes out of the mean", () => {
		const result = compute(
			m3(),
			[ride("w1", "a", "wave")],
			[
				score("w1", "j1", 6),
				{ rideId: "w1", judgeId: "j2", value: null, at: "" },
			],
		);
		const a = result.riders[0];
		expect(a?.total).toBe(6);
		expect(a?.rides[0]?.judges).toBe(1);
		expect(a?.rides[0]?.scores).toEqual([
			{ judgeId: "j1", value: 6 },
			{ judgeId: "j2", value: null },
		]);
		expect(result.issues).toEqual([]);
	});

	it("does not count a ride nobody saw", () => {
		const result = compute(
			m3(),
			[ride("w1", "a", "wave"), ride("w2", "a", "wave")],
			[
				score("w1", "j1", 3),
				{ rideId: "w2", judgeId: "j1", value: null, at: "" },
			],
		);
		const a = result.riders.find((r) => r.riderId === "a");
		expect(a?.total).toBe(3);
		expect(a?.rides.find((r) => r.rideId === "w2")).toMatchObject({
			value: 0,
			counted: false,
			judges: 0,
		});
	});

	it("applies trimmedMean per ride", () => {
		const result = compute(
			m3({ aggregation: "trimmedMean" }),
			[ride("w1", "a", "wave")],
			[score("w1", "j1", 2), score("w1", "j2", 6), score("w1", "j3", 10)],
		);
		expect(result.riders[0]?.total).toBe(6);
	});

	it("sums the notes of a ride with the sum aggregation", () => {
		const result = compute(
			m3({ aggregation: "sum" }),
			[ride("w1", "a", "wave")],
			[score("w1", "j1", 2), score("w1", "j2", 6)],
		);
		expect(result.riders[0]?.total).toBe(8);
	});

	it("reports judges who have not answered a ride without refusing to compute", () => {
		const result = compute(
			m3(),
			[ride("w1", "a", "wave"), ride("w2", "a", "wave")],
			[score("w1", "j1", 6), score("w1", "j2", 8), score("w2", "j1", 4)],
		);
		expect(result.issues).toEqual([
			expect.objectContaining({
				code: "MISSING_SCORE",
				details: { rideId: "w2", judgeId: "j2" },
			}),
		]);
		expect(result.riders.find((r) => r.riderId === "a")?.total).toBe(7);
		expect(result.riders.find((r) => r.riderId === "a")?.missingScores).toBe(
			true,
		);
	});

	it("keeps the notes of several judges on a shared ride (no RIDE_MULTIPLE_JUDGES)", () => {
		const result = compute(
			m3(),
			[ride("w1", "a", "wave")],
			[score("w1", "j1", 6), score("w1", "j2", 8)],
		);
		expect(result.issues).toEqual([]);
	});

	it("breaks ties on the counted ride values", () => {
		const result = compute(
			m3({ categories: [{ type: "wave", counted: 2 }], priorityType: "wave" }),
			[
				ride("a1", "a", "wave"),
				ride("a2", "a", "wave"),
				ride("b1", "b", "wave"),
				ride("b2", "b", "wave"),
			],
			[
				score("a1", "j1", 8),
				score("a2", "j1", 2),
				score("b1", "j1", 5),
				score("b2", "j1", 5),
			],
		);
		expect(result.unresolvedTie).toBe(false);
		expect(result.riders.map((r) => [r.riderId, r.rank])).toEqual([
			["a", 1],
			["b", 2],
		]);
	});
});

describe("headJudge mode with the other methods", () => {
	const rides = [ride("w1", "a", "wave"), ride("w2", "b", "wave")];
	const notes = [
		score("w1", "j1", 8),
		score("w1", "j2", 6),
		score("w2", "j1", 4),
		{ rideId: "w2", judgeId: "j2", value: null, at: "" },
	];

	it("computes points per judge on the shared rides", () => {
		const result = computeHeatResult(
			config({ scale: { min: 0, max: 10, step: 0.5 } }),
			["a", "b"],
			rides,
			notes,
			[],
			{ judgingMode: "headJudge" },
		);
		expect(result.issues.map((i) => i.code)).not.toContain(
			"RIDE_MULTIPLE_JUDGES",
		);
		expect(result.riders.map((r) => [r.riderId, r.total])).toEqual([
			["a", 7],
			["b", 4],
		]);
	});

	it("computes places per judge from their own non-null notes", () => {
		const result = computeHeatResult(
			config({ method: "placings", scale: { min: 0, max: 10, step: 0.5 } }),
			["a", "b"],
			rides,
			notes,
			[],
			{ judgingMode: "headJudge" },
		);
		expect(result.riders.find((r) => r.riderId === "a")?.placesByJudge).toEqual(
			{ j1: 1, j2: 1 },
		);
		expect(result.riders.find((r) => r.riderId === "b")?.placesByJudge).toEqual(
			{ j1: 2, j2: 2 },
		);
	});

	it("rejects a null note in free mode", () => {
		const result = computeHeatResult(
			config({ scale: { min: 0, max: 10, step: 0.5 } }),
			["a"],
			[ride("w1", "a", "wave")],
			[{ rideId: "w1", judgeId: "j1", value: null, at: "" }],
		);
		expect(result.issues.map((i) => i.code)).toContain("INVALID_SCORE");
	});
});

describe("judgeHeatFromScores in rideMeans", () => {
	const scoring = m3({ categories: [{ type: "wave", counted: 1 }] });
	const base = () => {
		const b = {
			...sampleBracket("published"),
			scoring,
			judgingMode: "headJudge" as const,
		};
		return okBracket(b, {
			type: "setHeatStatus",
			heatId: "h1",
			status: "running",
		});
	};
	const data = (): HeatData => ({
		rides: ["a", "b", "c", "d"].map((id) => ride(`r${id}`, id, "wave")),
		scores: [
			score("ra", "j1", 9),
			score("ra", "j2", 8),
			score("rb", "j1", 7),
			score("rc", "j1", 5),
			{ rideId: "rd", judgeId: "j1", value: null, at: "" },
		],
	});

	it("judges the heat even when a judge has not answered every ride", () => {
		const result = applyAction(base(), {
			type: "judgeHeatFromScores",
			heatId: "h1",
			data: data(),
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const slots = result.bracket.rounds[0]?.heats[0]?.slots;
		expect(slots?.map((s) => [s.riderId, s.rank])).toEqual([
			["a", 1],
			["b", 2],
			["c", 3],
			["d", 4],
		]);
	});
});

describe("scoreNeeded in rideMeans", () => {
	it("probes a single shared ride", () => {
		const cfg = m3({ categories: [{ type: "wave", counted: 1 }] });
		const rides = [ride("a1", "a", "wave"), ride("b1", "b", "wave")];
		const scores = [
			score("a1", "j1", 6),
			score("a1", "j2", 8),
			score("b1", "j1", 3),
			score("b1", "j2", 3),
		];
		expect(
			scoreNeeded(cfg, ["a", "b"], rides, scores, [], "b", 1, "wave"),
		).toEqual({ status: "needed", value: 7.5 });
	});
});
