import { describe, expect, test } from "vitest";
import type { Action } from "..";
import type { HeatData } from "../../lifecycle/scoring";
import type { Bracket } from "../../model";
import { getQualified } from "../../queries";
import {
	byJudge,
	config,
	halfStepScale,
	merge,
} from "../../scoring/__tests__/helpers";
import {
	errorCode,
	okBracket,
	run,
	sampleBracket,
} from "../../__tests__/fixtures";

const scoring = (extra = {}) =>
	config({
		scale: halfStepScale,
		categories: [{ type: "wave", counted: 1 }],
		...extra,
	});

/** h1 (a, b, c, d) running, with a scoring config. */
const running = (extra = {}): Bracket => {
	const b = okBracket(
		{ ...sampleBracket("published"), scoring: scoring(extra) },
		{ type: "setHeatStatus", heatId: "h1", status: "running" },
	);
	return b;
};

const data = (...parts: Array<ReturnType<typeof byJudge>>): HeatData => ({
	...merge(...parts),
});

const judge = (heatId: string, d: HeatData): Action => ({
	type: "judgeHeatFromScores",
	heatId,
	data: d,
});

const scores = (a: number, b: number, c: number, d: number) =>
	data(
		byJudge("j1", "a", "wave", [a]),
		byJudge("j1", "b", "wave", [b]),
		byJudge("j1", "c", "wave", [c]),
		byJudge("j1", "d", "wave", [d]),
	);

const slotsOf = (b: Bracket, heatId = "h1") =>
	b.rounds
		.flatMap((r) => r.heats)
		.find((h) => h.id === heatId)
		?.slots.map((s) => [s.riderId, s.rank, s.status]) ?? [];

describe("judgeHeatFromScores", () => {
	test("ranks the riders from their scores and judges the heat", () => {
		const next = okBracket(running(), judge("h1", scores(5, 9, 7, 3)));
		const h1 = next.rounds[0]?.heats[0];
		expect(h1?.status).toBe("judged");
		expect(slotsOf(next)).toEqual([
			["a", 3, undefined],
			["b", 1, undefined],
			["c", 2, undefined],
			["d", 4, undefined],
		]);
		expect(getQualified(next, "h1")).toEqual(["b", "c"]);
	});

	test("places the qualifiers of the heat it judges", () => {
		const next = okBracket(running(), judge("h1", scores(5, 9, 7, 3)));
		expect(slotsOf(next, "h3")).toEqual([
			["b", null, undefined],
			["c", null, undefined],
		]);
	});

	test("gives the same bracket as setRanks followed by setHeatStatus judged", () => {
		const start = running();
		const direct = okBracket(start, judge("h1", scores(5, 9, 7, 3)));
		const manual = okBracket(
			okBracket(start, {
				type: "setRanks",
				heatId: "h1",
				riderIds: ["b", "c", "a", "d"],
			}),
			{ type: "setHeatStatus", heatId: "h1", status: "judged" },
		);
		expect(direct).toEqual(manual);
	});

	test("clears the provisional order and forced marks, keeps the start time", () => {
		let b = okBracket(
			{ ...sampleBracket("published"), scoring: scoring() },
			{
				type: "setHeatStatus",
				heatId: "h1",
				status: "running",
				at: "2026-03-01T10:00:00.000Z",
			},
		);
		b = okBracket(b, {
			type: "reorderSlots",
			heatId: "h1",
			riderIds: ["d", "c", "b", "a"],
		});
		const next = okBracket(b, judge("h1", scores(5, 9, 7, 3)));
		const h1 = next.rounds[0]?.heats[0];
		expect(h1).not.toHaveProperty("order");
		expect(h1?.startedAt).toBe("2026-03-01T10:00:00.000Z");
		expect(h1?.slots.some((s) => s.overridden)).toBe(false);
	});

	test("keeps forced ranks even when the scores disagree", () => {
		const forced = okBracket(running(), {
			type: "setRanks",
			heatId: "h1",
			riderIds: ["a", "b", "c", "d"],
			override: true,
		});
		const next = okBracket(forced, judge("h1", scores(5, 9, 7, 3)));
		expect(next.rounds[0]?.heats[0]?.slots.map((s) => s.rank)).toEqual([
			1, 2, 3, 4,
		]);
	});

	test("leaves riders with a status out of the computation and keeps their status", () => {
		const b = okBracket(running(), {
			type: "setStatus",
			heatId: "h1",
			riderId: "d",
			status: "DNF",
		});
		const next = okBracket(b, judge("h1", scores(5, 9, 7, 10)));
		expect(slotsOf(next)).toEqual([
			["a", 3, undefined],
			["b", 1, undefined],
			["c", 2, undefined],
			["d", null, "DNF"],
		]);
		expect(next.rounds[0]?.heats[0]?.status).toBe("judged");
	});

	test("a heat where everyone has a status is judged without rank", () => {
		let b = running();
		for (const riderId of ["a", "b", "c", "d"]) {
			b = okBracket(b, {
				type: "setStatus",
				heatId: "h1",
				riderId,
				status: "DNS",
			});
		}
		const next = okBracket(b, judge("h1", data()));
		expect(next.rounds[0]?.heats[0]?.status).toBe("judged");
	});

	test("aggregates several judges, each with his own rides", () => {
		const d = data(
			byJudge("j1", "a", "wave", [9]),
			byJudge("j2", "a", "wave", [1]),
			byJudge("j1", "b", "wave", [5]),
			byJudge("j2", "b", "wave", [6]),
			byJudge("j1", "c", "wave", [2]),
			byJudge("j2", "c", "wave", [2]),
			byJudge("j1", "d", "wave", [1]),
			byJudge("j2", "d", "wave", [1]),
		);
		const next = okBracket(running(), judge("h1", d));
		expect(next.rounds[0]?.heats[0]?.slots.map((s) => s.rank)).toEqual([
			2, 1, 3, 4,
		]);
	});

	test("works with the placings method", () => {
		const d = data(
			byJudge("j1", "a", "wave", [9]),
			byJudge("j1", "b", "wave", [5]),
			byJudge("j1", "c", "wave", [7]),
			byJudge("j1", "d", "wave", [3]),
		);
		const next = okBracket(running({ method: "placings" }), judge("h1", d));
		expect(next.rounds[0]?.heats[0]?.slots.map((s) => s.rank)).toEqual([
			1, 3, 2, 4,
		]);
	});

	test("uses the penalties stored on the heat", () => {
		const penalized = okBracket(running(), {
			type: "setPenalties",
			heatId: "h1",
			penalties: [{ riderId: "a", type: "wave", kind: "zeroBest" }],
		});
		const next = okBracket(penalized, judge("h1", scores(9, 8, 3, 1)));
		expect(next.rounds[0]?.heats[0]?.slots.map((s) => s.rank)).toEqual([
			4, 1, 2, 3,
		]);
	});

	test("does not block on data issues", () => {
		const d = data(
			byJudge("j1", "a", "wave", [9]),
			byJudge("j1", "ghost", "wave", [10]),
			byJudge("j1", "b", "wave", [8]),
			byJudge("j1", "c", "wave", [7]),
			byJudge("j1", "d", "wave", [6]),
		);
		expect(errorCode(running(), judge("h1", d))).toBe("ok");
	});
});

describe("judgeHeatFromScores refusals", () => {
	test("an unresolved tie lists the tied groups and changes nothing", () => {
		const b = running();
		const result = run(b, judge("h1", scores(5, 5, 7, 3)));
		expect(!result.ok && result.error).toMatchObject({
			code: "UNRESOLVED_TIE",
			details: { heatId: "h1", tiedRiderIds: [["a", "b"]] },
		});
	});

	test("ranks set by hand win over the scores and break a tie", () => {
		const b = running();
		const manual = okBracket(b, {
			type: "setRanks",
			heatId: "h1",
			riderIds: ["d", "c", "b", "a"],
			override: true,
		});
		const next = okBracket(manual, judge("h1", scores(5, 5, 7, 3)));
		expect(next.rounds[0]?.heats[0]?.status).toBe("judged");
		expect(slotsOf(next)).toEqual([
			["a", 4, undefined],
			["b", 3, undefined],
			["c", 2, undefined],
			["d", 1, undefined],
		]);
	});

	test("ranks set without override are still computed from the scores", () => {
		const manual = okBracket(running(), {
			type: "setRanks",
			heatId: "h1",
			riderIds: ["d", "c", "b", "a"],
		});
		const next = okBracket(manual, judge("h1", scores(5, 9, 7, 3)));
		expect(slotsOf(next).map(([id, rank]) => [id, rank])).toEqual([
			["a", 3],
			["b", 1],
			["c", 2],
			["d", 4],
		]);
	});

	test("lists several tie groups", () => {
		const result = run(running(), judge("h1", scores(5, 5, 3, 3)));
		expect(!result.ok && result.error.details).toMatchObject({
			tiedRiderIds: [
				["a", "b"],
				["c", "d"],
			],
		});
	});

	test("a heat without any score is one big tie", () => {
		const result = run(running(), judge("h1", data()));
		expect(!result.ok && result.error).toMatchObject({
			code: "UNRESOLVED_TIE",
			details: { tiedRiderIds: [["a", "b", "c", "d"]] },
		});
	});

	test("a lone rider without score is not a tie", () => {
		const placed = okBracket(
			{ ...sampleBracket("published"), scoring: scoring() },
			{ type: "place", riderId: "a", heatId: "h3" },
		);
		const started = okBracket(placed, {
			type: "setHeatStatus",
			heatId: "h3",
			status: "running",
		});
		const next = okBracket(started, judge("h3", data()));
		expect(slotsOf(next, "h3")).toEqual([["a", 1, undefined]]);
	});

	test("no scoring config", () => {
		const b = okBracket(sampleBracket("published"), {
			type: "setHeatStatus",
			heatId: "h1",
			status: "running",
		});
		expect(errorCode(b, judge("h1", scores(1, 2, 3, 4)))).toBe("NO_SCORING");
	});

	test("heat not running, judged or locked", () => {
		const pending = { ...sampleBracket("published"), scoring: scoring() };
		expect(errorCode(pending, judge("h1", scores(1, 2, 3, 4)))).toBe(
			"HEAT_NOT_RUNNING",
		);
		const judged = okBracket(running(), judge("h1", scores(1, 2, 3, 4)));
		expect(errorCode(judged, judge("h1", scores(1, 2, 3, 4)))).toBe(
			"HEAT_JUDGED",
		);
		const locked = okBracket(judged, {
			type: "setHeatStatus",
			heatId: "h1",
			status: "locked",
		});
		expect(errorCode(locked, judge("h1", scores(1, 2, 3, 4)))).toBe(
			"HEAT_LOCKED",
		);
	});

	test("unknown heat", () => {
		expect(errorCode(running(), judge("nope", scores(1, 2, 3, 4)))).toBe(
			"UNKNOWN_HEAT",
		);
	});

	test("validated bracket", () => {
		const validated: Bracket = { ...running(), status: "validated" };
		expect(errorCode(validated, judge("h1", scores(1, 2, 3, 4)))).toBe(
			"BRACKET_VALIDATED",
		);
	});
});
