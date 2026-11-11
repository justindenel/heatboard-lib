import { describe, expect, test } from "vitest";
import type { HeatData } from "../../lifecycle/scoring";
import type { Bracket, Heat } from "../../model";
import {
	byJudge,
	config,
	halfStepScale,
	merge,
} from "../../scoring/__tests__/helpers";
import { okBracket, sampleBracket } from "../../__tests__/fixtures";
import { validateBracket } from "../../validate";

const best = config({
	scale: halfStepScale,
	categories: [{ type: "wave", counted: 1 }],
});
const sum = config({
	scale: halfStepScale,
	categories: [{ type: "wave", counted: 2 }],
});

/** With `best` the first rider wins; with `sum` the second one does. */
const heatData = (first: string, second: string, others: [string, string]) =>
	merge(
		byJudge("j1", first, "wave", [9, 0]),
		byJudge("j1", second, "wave", [5, 5]),
		byJudge("j1", others[0], "wave", [2]),
		byJudge("j1", others[1], "wave", [1]),
	) satisfies HeatData;

const h1Data = heatData("a", "b", ["c", "d"]);
const h2Data = heatData("e", "f", ["g", "h"]);

const start = (b: Bracket, heatId: string) =>
	okBracket(b, { type: "setHeatStatus", heatId, status: "running" });
const judge = (b: Bracket, heatId: string, data: HeatData) =>
	okBracket(b, { type: "judgeHeatFromScores", heatId, data });
const changeScoring = (b: Bracket, scoring: Bracket["scoring"] | null) =>
	okBracket(b, { type: "setRaceFormat", scoring: scoring ?? null });
const heatOf = (b: Bracket, id: string) =>
	b.rounds.flatMap((r) => r.heats).find((h) => h.id === id);
const ranks = (b: Bracket, id: string) =>
	Object.fromEntries(
		heatOf(b, id)?.slots.map((s) => [s.riderId, s.rank]) ?? [],
	);

const published = (): Bracket => ({
	...sampleBracket("published"),
	scoring: best,
});

describe("scoring frozen per heat", () => {
	test("starting a heat snapshots the current scoring", () => {
		const b = start(published(), "h1");
		expect(heatOf(b, "h1")?.scoring).toEqual(best);
		expect(heatOf(b, "h2")?.scoring).toBeUndefined();
	});

	test("a heat started without bracket scoring gets no snapshot", () => {
		const b = start(sampleBracket("published"), "h1");
		expect(heatOf(b, "h1")?.scoring).toBeUndefined();
	});

	test("a change after a judged heat leaves it alone and applies to the next heat", () => {
		let b = judge(start(published(), "h1"), "h1", h1Data);
		expect(ranks(b, "h1")).toMatchObject({ a: 1, b: 2 });

		b = changeScoring(b, sum);
		expect(ranks(b, "h1")).toMatchObject({ a: 1, b: 2 });
		expect(heatOf(b, "h1")?.scoring).toEqual(best);
		expect(heatOf(b, "h1")?.needsReview).toBeUndefined();

		b = judge(start(b, "h2"), "h2", h2Data);
		expect(heatOf(b, "h2")?.scoring).toEqual(sum);
		expect(ranks(b, "h2")).toMatchObject({ f: 1, e: 2 });
	});

	test("a change while a heat runs does not affect it", () => {
		let b = start(published(), "h1");
		b = changeScoring(b, sum);
		b = judge(b, "h1", h1Data);
		expect(ranks(b, "h1")).toMatchObject({ a: 1, b: 2 });
		expect(heatOf(b, "h1")?.scoring).toEqual(best);
	});

	test("reopening a judged heat keeps its snapshot", () => {
		let b = judge(start(published(), "h1"), "h1", h1Data);
		b = changeScoring(b, sum);
		b = okBracket(b, {
			type: "setHeatStatus",
			heatId: "h1",
			status: "running",
		});
		expect(heatOf(b, "h1")?.scoring).toEqual(best);
		b = judge(b, "h1", h1Data);
		expect(ranks(b, "h1")).toMatchObject({ a: 1, b: 2 });
	});

	test("going back to pending drops the snapshot", () => {
		let b = start(published(), "h1");
		b = okBracket(b, {
			type: "setHeatStatus",
			heatId: "h1",
			status: "pending",
		});
		expect(heatOf(b, "h1")?.scoring).toBeUndefined();
		b = changeScoring(b, sum);
		expect(heatOf(start(b, "h1"), "h1")?.scoring).toEqual(sum);
	});

	test("started heats without a snapshot are frozen on the previous scoring", () => {
		let b = start(published(), "h1");
		const legacy = { ...heatOf(b, "h1") } as Heat;
		delete legacy.scoring;
		b = {
			...b,
			rounds: b.rounds.map((r) => ({
				...r,
				heats: r.heats.map((h) => (h.id === "h1" ? legacy : h)),
			})),
		};
		b = changeScoring(b, sum);
		expect(heatOf(b, "h1")?.scoring).toEqual(best);
	});

	test("a snapshot on a pending heat is invalid", () => {
		const b = published();
		const bad: Bracket = {
			...b,
			rounds: b.rounds.map((r) => ({
				...r,
				heats: r.heats.map((h) =>
					h.id === "h1" ? { ...h, scoring: best } : h,
				),
			})),
		};
		expect(validateBracket(bad).map((e) => e.code)).toContain(
			"INVALID_SCORING",
		);
	});
});
