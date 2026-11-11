import { describe, expect, test } from "vitest";
import type { Action } from "..";
import type { Bracket } from "../../model";
import type { Penalty } from "../../scoring/model";
import { config, halfStepScale } from "../../scoring/__tests__/helpers";
import {
	advanceHeat,
	errorCode,
	okBracket,
	sampleBracket,
} from "../../__tests__/fixtures";

const scoring = config({
	scale: halfStepScale,
	categories: [{ type: "wave", counted: 1 }],
});

const zeroBest = (riderId: string): Penalty => ({
	riderId,
	type: "wave",
	kind: "zeroBest",
});

const set = (penalties: Penalty[], heatId = "h1"): Action => ({
	type: "setPenalties",
	heatId,
	penalties,
});

/** h1 (a, b, c, d) running with a scoring config. */
const running = (): Bracket =>
	okBracket(
		{ ...sampleBracket("published"), scoring },
		{ type: "setHeatStatus", heatId: "h1", status: "running" },
	);

const penaltiesOf = (b: Bracket) => b.rounds[0]?.heats[0]?.penalties;

describe("addPenalty and removePenalty", () => {
	const add = (penalty: Penalty, heatId = "h1"): Action => ({
		type: "addPenalty",
		heatId,
		penalty,
	});
	const remove = (penalty: Penalty, heatId = "h1"): Action => ({
		type: "removePenalty",
		heatId,
		penalty,
	});

	test("adds to the list already on the heat, duplicates included", () => {
		const first = okBracket(running(), add(zeroBest("a")));
		const second = okBracket(first, add(zeroBest("b")));
		const third = okBracket(second, add(zeroBest("a")));
		expect(penaltiesOf(third)).toEqual([
			zeroBest("a"),
			zeroBest("b"),
			zeroBest("a"),
		]);
	});

	test("removes only the first equal penalty", () => {
		const b = okBracket(
			running(),
			set([zeroBest("a"), zeroBest("b"), zeroBest("a")]),
		);
		const next = okBracket(b, remove(zeroBest("a")));
		expect(penaltiesOf(next)).toEqual([zeroBest("b"), zeroBest("a")]);
	});

	test("removing the last one drops the field, removing an absent one is a no-op", () => {
		const b = okBracket(running(), add(zeroBest("a")));
		const absent = okBracket(b, remove(zeroBest("b")));
		expect(absent).toBe(b);
		const cleared = okBracket(b, remove(zeroBest("a")));
		expect(penaltiesOf(cleared)).toBeUndefined();
	});

	test("keeps the refusals of setPenalties", () => {
		expect(errorCode(running(), add(zeroBest("a"), "nope"))).toBe(
			"UNKNOWN_HEAT",
		);
		expect(errorCode(running(), remove(zeroBest("a"), "nope"))).toBe(
			"UNKNOWN_HEAT",
		);
		expect(errorCode(running(), add(zeroBest("e")))).toBe("RIDER_NOT_IN_HEAT");
		expect(errorCode(running(), add({ ...zeroBest("a"), type: "" }))).toBe(
			"INVALID_PENALTY",
		);
		const pending = { ...sampleBracket("published"), scoring };
		expect(errorCode(pending, add(zeroBest("a")))).toBe("HEAT_NOT_RUNNING");
		expect(errorCode(pending, remove(zeroBest("a")))).toBe("HEAT_NOT_RUNNING");
		const full = okBracket(
			running(),
			set(Array.from({ length: 50 }, () => zeroBest("a"))),
		);
		expect(errorCode(full, add(zeroBest("a")))).toBe("INVALID_PENALTY");
	});
});

describe("setPenalties", () => {
	test("replaces the list of a running heat", () => {
		const first = okBracket(running(), set([zeroBest("a")]));
		expect(penaltiesOf(first)).toEqual([zeroBest("a")]);
		const second = okBracket(first, set([zeroBest("b"), zeroBest("c")]));
		expect(penaltiesOf(second)).toEqual([zeroBest("b"), zeroBest("c")]);
	});

	test("an empty list removes the field", () => {
		const first = okBracket(running(), set([zeroBest("a")]));
		const cleared = okBracket(first, set([]));
		expect(Object.hasOwn(cleared.rounds[0]?.heats[0] ?? {}, "penalties")).toBe(
			false,
		);
	});

	test("an identical list is a no-op", () => {
		const first = okBracket(running(), set([zeroBest("a")]));
		expect(okBracket(first, set([zeroBest("a")]))).toBe(first);
		const b = running();
		expect(okBracket(b, set([]))).toBe(b);
	});

	test("refuses an unknown heat, a missing scoring and a heat that is not running", () => {
		expect(errorCode(running(), set([], "nope"))).toBe("UNKNOWN_HEAT");
		const unscored = okBracket(sampleBracket("published"), {
			type: "setHeatStatus",
			heatId: "h1",
			status: "running",
		});
		expect(errorCode(unscored, set([zeroBest("a")]))).toBe("NO_SCORING");
		const pending = { ...sampleBracket("published"), scoring };
		expect(errorCode(pending, set([zeroBest("a")]))).toBe("HEAT_NOT_RUNNING");
		const judged = advanceHeat({ ...sampleBracket(), scoring }, "h1", "judged");
		expect(errorCode(judged, set([zeroBest("a")]))).toBe("HEAT_JUDGED");
		const locked = advanceHeat({ ...sampleBracket(), scoring }, "h1", "locked");
		expect(errorCode(locked, set([zeroBest("a")]))).toBe("HEAT_LOCKED");
	});

	test("refuses a rider outside the heat", () => {
		expect(errorCode(running(), set([zeroBest("e")]))).toBe(
			"RIDER_NOT_IN_HEAT",
		);
	});

	test("refuses an unknown kind, an empty type and more than 50 entries", () => {
		const kind = { ...zeroBest("a"), kind: "nope" } as unknown as Penalty;
		expect(errorCode(running(), set([kind]))).toBe("INVALID_PENALTY");
		expect(errorCode(running(), set([{ ...zeroBest("a"), type: "" }]))).toBe(
			"INVALID_PENALTY",
		);
		const many = Array.from({ length: 51 }, () => zeroBest("a"));
		expect(errorCode(running(), set(many))).toBe("INVALID_PENALTY");
		const max = Array.from({ length: 50 }, () => zeroBest("a"));
		expect(errorCode(running(), set(max))).toBe("ok");
	});

	test("cancelling the start clears the penalties", () => {
		const penalized = okBracket(running(), set([zeroBest("a")]));
		const back = okBracket(penalized, {
			type: "setHeatStatus",
			heatId: "h1",
			status: "pending",
		});
		expect(penaltiesOf(back)).toBeUndefined();
	});

	test("reopening a judged heat keeps the penalties", () => {
		const penalized = okBracket(running(), set([zeroBest("a")]));
		const ranked = okBracket(penalized, {
			type: "rankByPosition",
			heatId: "h1",
		});
		const judged = okBracket(ranked, {
			type: "setHeatStatus",
			heatId: "h1",
			status: "judged",
		});
		expect(penaltiesOf(judged)).toEqual([zeroBest("a")]);
		const reopened = okBracket(judged, {
			type: "setHeatStatus",
			heatId: "h1",
			status: "running",
		});
		expect(penaltiesOf(reopened)).toEqual([zeroBest("a")]);
	});

	test("reset clears the penalties of the emptied heats", () => {
		const penalized = okBracket(running(), set([zeroBest("a")]));
		const next = okBracket(penalized, {
			type: "reset",
			keepRounds: 1,
			confirm: true,
		});
		expect(penaltiesOf(next)).toBeUndefined();
		expect(next.rounds[0]?.heats[0]?.status).toBe("pending");
	});

	test("does not touch other heats", () => {
		const b = running();
		const next = okBracket(b, set([zeroBest("a")]));
		expect(next.rounds[0]?.heats[1]).toBe(b.rounds[0]?.heats[1]);
	});
});
