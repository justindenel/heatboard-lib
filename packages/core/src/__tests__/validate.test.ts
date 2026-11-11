import { describe, expect, test } from "vitest";
import type { Bracket, HeatStatus } from "../model";
import { config } from "../scoring/__tests__/helpers";
import { validateBracket } from "../validate";
import { bracket, heat, link, round, sampleBracket } from "./fixtures";

const codes = (b: Bracket) => validateBracket(b).map((e) => e.code);

test("a valid bracket has no problem", () => {
	expect(validateBracket(sampleBracket())).toEqual([]);
	const ranked = bracket([
		round("r1", [
			heat("h1", [
				{ id: "a", rank: 1 },
				{ id: "b", rank: 2 },
				{ id: "c", status: "DNS" },
			]),
		]),
	]);
	expect(validateBracket(ranked)).toEqual([]);
});

describe("problems", () => {
	test("duplicate rider in a round, across heats", () => {
		const b = bracket([round("r1", [heat("h1", ["a"]), heat("h2", ["a"])])]);
		expect(codes(b)).toEqual(["RIDER_ALREADY_IN_ROUND"]);
	});

	test("heat above max", () => {
		const b = bracket([
			round("r1", [heat("h1", ["a", "b", "c"])], { maxPerHeat: 2 }),
		]);
		expect(codes(b)).toEqual(["HEAT_FULL"]);
	});

	test("duplicate, gapped and statused ranks", () => {
		const dup = bracket([
			round("r1", [
				heat("h1", [
					{ id: "a", rank: 1 },
					{ id: "b", rank: 1 },
				]),
			]),
		]);
		const gap = bracket([
			round("r1", [
				heat("h1", [
					{ id: "a", rank: 1 },
					{ id: "b", rank: 3 },
				]),
			]),
		]);
		const statused = bracket([
			round("r1", [heat("h1", [{ id: "a", rank: 1, status: "DNF" }])]),
		]);
		expect(codes(dup)).toEqual(["INVALID_RANKS"]);
		expect(codes(gap)).toEqual(["INVALID_RANKS"]);
		expect(codes(statused)).toEqual(["INVALID_RANKS"]);
	});

	test("rider missing from entries", () => {
		const b = bracket([round("r1", [heat("h1", ["a"])])], { entries: [] });
		expect(codes(b)).toEqual(["UNKNOWN_RIDER"]);
	});

	test("placement before the entry round and unknown entry round", () => {
		const early = bracket(
			[round("r1", [heat("h1", ["a"])]), round("r2", [heat("h2")])],
			{
				entries: [{ riderId: "a", displayName: "a", entryRoundId: "r2" }],
			},
		);
		expect(codes(early)).toEqual(["BEFORE_ENTRY_ROUND"]);
		const unknown = bracket([round("r1", [heat("h1")])], {
			entries: [{ riderId: "a", displayName: "a", entryRoundId: "zz" }],
		});
		expect(codes(unknown)).toEqual(["UNKNOWN_ROUND"]);
	});

	test("bad links", () => {
		const b = bracket([round("r1", [heat("h1")])], {
			links: [
				link("ghost", 1, "h1"),
				link("h1", 0, "h1"),
				link("h1", 1, "ghost"),
			],
		});
		expect(codes(b)).toEqual([
			"UNKNOWN_HEAT",
			"INVALID_LINK",
			"INVALID_LINK",
			"UNKNOWN_HEAT",
		]);
	});

	test("reports everything instead of stopping at the first problem", () => {
		const b = bracket(
			[round("r1", [heat("h1", ["a", "a", "b"])], { maxPerHeat: 2 })],
			{ entries: [] },
		);
		expect(codes(b)).toContain("HEAT_FULL");
		expect(codes(b)).toContain("RIDER_ALREADY_IN_ROUND");
		expect(codes(b).filter((c) => c === "UNKNOWN_RIDER")).toHaveLength(3);
	});
});

test("duplicate ids of rounds, heats and entries", () => {
	const b = bracket(
		[round("r1", [heat("h1"), heat("h2")]), round("r1", [heat("h2")])],
		{
			entries: [
				{ riderId: "a", displayName: "a" },
				{ riderId: "a", displayName: "a2" },
			],
		},
	);
	expect(codes(b)).toEqual(["DUPLICATE_ID", "DUPLICATE_ID", "DUPLICATE_ID"]);
});

test("links must point to a later round", () => {
	const b = bracket(
		[round("r1", [heat("h1"), heat("h2")]), round("r2", [heat("h3")])],
		{
			links: [link("h1", 1, "h2"), link("h3", 1, "h1"), link("h1", 1, "h3")],
		},
	);
	expect(codes(b)).toEqual(["INVALID_LINK", "INVALID_LINK"]);
});

describe("timer and scoring fields", () => {
	const started = (extra: object, status: HeatStatus = "running") =>
		bracket([round("r1", [heat("h1", ["a"], { status, ...extra })])]);

	test("a valid startedAt on a started heat is fine", () => {
		for (const status of ["running", "judged", "locked"] as const) {
			expect(
				codes(started({ startedAt: "2026-03-01T10:00:00.000Z" }, status)),
			).toEqual([]);
		}
	});

	test("startedAt on a pending heat is invalid", () => {
		expect(
			codes(started({ startedAt: "2026-03-01T10:00:00.000Z" }, "pending")),
		).toEqual(["INVALID_ARGUMENT"]);
	});

	test("startedAt must be an ISO date", () => {
		for (const startedAt of ["", "now", "2026-02-31T00:00:00Z", "2026-03-01"]) {
			expect(codes(started({ startedAt }))).toEqual(["INVALID_ARGUMENT"]);
		}
	});

	test("race durations must be integers, positive for a heat and not negative for a break", () => {
		const withTiming = (timing: {
			heatDurationSec?: number;
			breakSec?: number;
		}) => ({
			...bracket([round("r1", [heat("h1", ["a"])])]),
			timing,
		});
		expect(codes(withTiming({ heatDurationSec: 600, breakSec: 0 }))).toEqual(
			[],
		);
		for (const value of [0, -1, 1.5, Number.NaN]) {
			expect(codes(withTiming({ heatDurationSec: value }))).toEqual([
				"INVALID_ARGUMENT",
			]);
		}
		expect(codes(withTiming({ breakSec: -1 }))).toEqual(["INVALID_ARGUMENT"]);
	});

	test("a race format snapshot needs a started heat", () => {
		const snapshot = (status: HeatStatus) =>
			bracket([
				round("r1", [
					heat("h1", ["a"], { status, timing: {}, judgingMode: "free" }),
				]),
			]);
		expect(codes(snapshot("pending"))).toEqual(["INVALID_ARGUMENT"]);
		expect(codes({ ...snapshot("running"), status: "running" })).toEqual([]);
	});

	test("penalties need a started heat and riders of the heat", () => {
		const penalty = { riderId: "a", type: "wave", kind: "zeroBest" } as const;
		const withPenalties = (
			status: HeatStatus,
			penalties: Array<{ riderId: string; type: string; kind: "zeroBest" }>,
		) =>
			bracket([round("r1", [heat("h1", ["a"], { status, penalties })])], {
				status: "running",
			});
		expect(codes(withPenalties("running", [penalty]))).toEqual([]);
		expect(codes(withPenalties("pending", [penalty]))).toEqual([
			"INVALID_PENALTY",
		]);
		expect(
			codes(withPenalties("running", [{ ...penalty, riderId: "z" }])),
		).toEqual(["INVALID_PENALTY"]);
	});

	test("the scoring scale is checked", () => {
		const base = bracket([round("r1", [heat("h1", ["a"])])]);
		const withStep = (step: number) => ({
			...base,
			scoring: config({ scale: { min: 0, max: 10, step } }),
		});
		expect(codes(withStep(0.5))).toEqual([]);
		expect(codes(withStep(1))).toEqual([]);
		expect(codes(withStep(0.1))).toEqual(["INVALID_SCORING"]);
	});

	test("the alignment window is checked", () => {
		const base = bracket([round("r1", [heat("h1", ["a"])])]);
		const withWindow = (alignWindowSec: number) => ({
			...base,
			scoring: config({
				scale: { min: 0, max: 10, step: 0.5 },
				alignWindowSec,
			}),
		});
		expect(codes(withWindow(30))).toEqual([]);
		expect(codes(withWindow(0))).toEqual(["INVALID_SCORING"]);
		expect(codes(withWindow(1.5))).toEqual(["INVALID_SCORING"]);
	});
});
