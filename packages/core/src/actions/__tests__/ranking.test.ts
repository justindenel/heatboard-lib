import { describe, expect, test } from "vitest";
import { applyAction, type Action } from "..";
import type { Bracket } from "../../model";
import { validateBracket } from "../../validate";
import {
	advanceHeat,
	bracket,
	errorCode,
	heat,
	okBracket,
	round,
	run,
} from "../../__tests__/fixtures";

const fixture = () =>
	bracket(
		[
			round("r1", [
				heat("h1", ["a", "b", "c", { id: "d", status: "DNF" }]),
				heat("h2", ["e", "f"]),
			]),
			round("r2", [heat("h3", ["a"])]),
		],
		{ status: "published" },
	);

const started = () =>
	okBracket(fixture(), {
		type: "setHeatStatus",
		heatId: "h1",
		status: "running",
	});

const slotsOf = (b: Bracket, round = 0, h = 0) =>
	b.rounds[round]?.heats[h]?.slots;
const locked = (b: Bracket, heatId: string) => advanceHeat(b, heatId, "locked");

describe("setRanks", () => {
	test("ranks riders without status and keeps statused ones unranked", () => {
		const b = started();
		const next = okBracket(b, {
			type: "setRanks",
			heatId: "h1",
			riderIds: ["c", "a", "b"],
		});
		expect(slotsOf(next)).toEqual([
			{ riderId: "a", rank: 2 },
			{ riderId: "b", rank: 3 },
			{ riderId: "c", rank: 1 },
			{ riderId: "d", rank: null, status: "DNF" },
		]);
		expect(slotsOf(next)?.[3]).toBe(slotsOf(b)?.[3]);
		expect(next.rounds[1]).toBe(b.rounds[1]);
		expect(next.rounds[0]?.heats[1]).toBe(b.rounds[0]?.heats[1]);
	});

	test("override flag is set then removed", () => {
		const b = okBracket(started(), {
			type: "setRanks",
			heatId: "h1",
			riderIds: ["a", "b", "c"],
			override: true,
		});
		expect(slotsOf(b)?.[0]).toEqual({
			riderId: "a",
			rank: 1,
			overridden: true,
		});
		expect(slotsOf(b)?.[3]).not.toHaveProperty("overridden");
		const again = okBracket(b, {
			type: "setRanks",
			heatId: "h1",
			riderIds: ["a", "b", "c"],
		});
		expect(slotsOf(again)?.[0]).toEqual({ riderId: "a", rank: 1 });
	});

	test("identical ranking returns the same bracket", () => {
		const b = okBracket(started(), {
			type: "setRanks",
			heatId: "h1",
			riderIds: ["a", "b", "c"],
		});
		const result = run(b, {
			type: "setRanks",
			heatId: "h1",
			riderIds: ["a", "b", "c"],
		});
		expect(result.ok && result.bracket).toBe(b);
	});

	test("refusals", () => {
		const b = started();
		const pending = fixture();
		const set = (riderIds: string[]): Action => ({
			type: "setRanks",
			heatId: "h1",
			riderIds,
		});
		expect(errorCode(b, { type: "setRanks", heatId: "x", riderIds: [] })).toBe(
			"UNKNOWN_HEAT",
		);
		expect(errorCode(b, set(["a", "b"]))).toBe("INVALID_RANKS");
		expect(errorCode(b, set(["a", "b", "c", "d"]))).toBe("INVALID_RANKS");
		expect(errorCode(b, set(["a", "a", "b"]))).toBe("INVALID_RANKS");
		expect(errorCode(b, set(["a", "b", "z"]))).toBe("INVALID_RANKS");
		expect(errorCode(locked(pending, "h1"), set(["a", "b", "c"]))).toBe(
			"HEAT_LOCKED",
		);
		expect(errorCode(pending, set(["a", "b", "c"]))).toBe("HEAT_NOT_RUNNING");
	});

	test("allowed on running and judged heats", () => {
		const running = okBracket(fixture(), {
			type: "setHeatStatus",
			heatId: "h1",
			status: "running",
		});
		expect(
			errorCode(running, {
				type: "setRanks",
				heatId: "h1",
				riderIds: ["a", "b", "c"],
			}),
		).toBe("ok");
	});
});

describe("rankByPosition and clearRanks", () => {
	test("ranks by slot order skipping statused riders", () => {
		const b = started();
		const next = okBracket(b, { type: "rankByPosition", heatId: "h1" });
		expect(slotsOf(next)?.map((s) => s.rank)).toEqual([1, 2, 3, null]);
		expect(next.rounds[1]).toBe(b.rounds[1]);
	});

	test("rankByPosition is idempotent and clears the override flag", () => {
		const b = okBracket(started(), {
			type: "setRanks",
			heatId: "h1",
			riderIds: ["a", "b", "c"],
			override: true,
		});
		const next = okBracket(b, { type: "rankByPosition", heatId: "h1" });
		expect(slotsOf(next)?.[0]).toEqual({ riderId: "a", rank: 1 });
		const result = run(next, { type: "rankByPosition", heatId: "h1" });
		expect(result.ok && result.bracket).toBe(next);
	});

	test("clearRanks nulls ranks but keeps statuses", () => {
		const ranked = okBracket(started(), {
			type: "rankByPosition",
			heatId: "h1",
		});
		const next = okBracket(ranked, { type: "clearRanks", heatId: "h1" });
		expect(slotsOf(next)?.map((s) => s.rank)).toEqual([null, null, null, null]);
		expect(slotsOf(next)?.[3]?.status).toBe("DNF");
		const again = run(next, { type: "clearRanks", heatId: "h1" });
		expect(again.ok && again.bracket).toBe(next);
	});

	test("refusals", () => {
		const b = fixture();
		expect(errorCode(b, { type: "rankByPosition", heatId: "x" })).toBe(
			"UNKNOWN_HEAT",
		);
		expect(errorCode(b, { type: "clearRanks", heatId: "x" })).toBe(
			"UNKNOWN_HEAT",
		);
		expect(
			errorCode(locked(b, "h1"), { type: "rankByPosition", heatId: "h1" }),
		).toBe("HEAT_LOCKED");
		expect(
			errorCode(locked(b, "h1"), { type: "clearRanks", heatId: "h1" }),
		).toBe("HEAT_LOCKED");
		expect(errorCode(b, { type: "rankByPosition", heatId: "h1" })).toBe(
			"HEAT_NOT_RUNNING",
		);
		expect(errorCode(b, { type: "clearRanks", heatId: "h1" })).toBe(
			"HEAT_NOT_RUNNING",
		);
	});
});

describe("reorderSlots", () => {
	const running = () => advanceHeat(fixture(), "h1", "running");
	const reorder = (riderIds: string[]): Action => ({
		type: "reorderSlots",
		heatId: "h1",
		riderIds,
	});

	test("stores a provisional order and leaves slots untouched", () => {
		const before = running();
		const next = okBracket(before, reorder(["c", "a", "b"]));
		const heat = next.rounds[0]!.heats[0]!;
		expect(heat.order).toEqual(["c", "a", "b"]);
		expect(heat.slots).toBe(before.rounds[0]!.heats[0]!.slots);
		expect(next.rounds[1]).toBe(before.rounds[1]);
		expect(validateBracket(next)).toEqual([]);
	});

	test("keeps the order of a heat reordered back to the composition as is", () => {
		const before = running();
		expect(okBracket(before, reorder(["a", "b", "c"]))).toBe(before);
	});

	test("keeps the order when a status is set, dropping that rider from it", () => {
		const b = okBracket(running(), reorder(["c", "a", "b"]));
		const next = okBracket(b, {
			type: "setStatus",
			heatId: "h1",
			riderId: "a",
			status: "DNS",
		});
		expect(next.rounds[0]!.heats[0]!.order).toEqual(["c", "b"]);
	});

	test("drops the order when ranks are set or the heat leaves running", () => {
		const b = okBracket(running(), reorder(["c", "a", "b"]));
		const ranked = okBracket(b, { type: "rankByPosition", heatId: "h1" });
		expect(ranked.rounds[0]!.heats[0]!.order).toBeUndefined();
		const back = okBracket(b, {
			type: "setHeatStatus",
			heatId: "h1",
			status: "pending",
		});
		expect(back.rounds[0]!.heats[0]!.order).toBeUndefined();
	});

	test("rejects a stale or invalid order in validateBracket", () => {
		const b = okBracket(running(), reorder(["c", "a", "b"]));
		const bad = structuredClone(b);
		bad.rounds[0]!.heats[0]!.order = ["c", "c", "z"];
		expect(validateBracket(bad).map((e) => e.code)).toEqual(["INVALID_RANKS"]);
	});

	test("is followed by rankByPosition in the provisional order", () => {
		const next = okBracket(okBracket(running(), reorder(["c", "a", "b"])), {
			type: "rankByPosition",
			heatId: "h1",
		});
		expect(slotsOf(next)?.map((s) => [s.riderId, s.rank])).toEqual([
			["a", 2],
			["b", 3],
			["c", 1],
			["d", null],
		]);
	});

	test("is refused once a rank is set", () => {
		const ranked = okBracket(running(), {
			type: "setRanks",
			heatId: "h1",
			riderIds: ["a", "b", "c"],
		});
		expect(errorCode(ranked, reorder(["c", "a", "b"]))).toBe("HEAT_HAS_RANKS");
	});

	test("is refused outside a running heat", () => {
		const b = fixture();
		expect(errorCode(b, reorder(["c", "a", "b"]))).toBe("HEAT_NOT_RUNNING");
		expect(
			errorCode(advanceHeat(b, "h1", "judged"), reorder(["a", "b", "c"])),
		).toBe("HEAT_JUDGED");
		expect(errorCode(locked(b, "h1"), reorder(["a", "b", "c"]))).toBe(
			"HEAT_LOCKED",
		);
	});

	test("refuses an order that does not list each rider without status once", () => {
		for (const riderIds of [
			["a", "b"],
			["a", "a", "b"],
			["a", "b", "d"],
		]) {
			expect(errorCode(running(), reorder(riderIds))).toBe("INVALID_RANKS");
		}
		expect(
			errorCode(running(), { type: "reorderSlots", heatId: "x", riderIds: [] }),
		).toBe("UNKNOWN_HEAT");
	});
});

describe("setStatus", () => {
	test("sets a status, nulls the rank and renumbers the others", () => {
		const ranked = okBracket(started(), {
			type: "rankByPosition",
			heatId: "h1",
		});
		const next = okBracket(ranked, {
			type: "setStatus",
			heatId: "h1",
			riderId: "a",
			status: "DSQ",
		});
		expect(slotsOf(next)).toEqual([
			{ riderId: "a", rank: null, status: "DSQ" },
			{ riderId: "b", rank: 1 },
			{ riderId: "c", rank: 2 },
			{ riderId: "d", rank: null, status: "DNF" },
		]);
		expect(next.rounds[1]).toBe(ranked.rounds[1]);
	});

	test("does not rank anyone when the heat had no ranks", () => {
		const next = okBracket(fixture(), {
			type: "setStatus",
			heatId: "h1",
			riderId: "a",
			status: "DNS",
		});
		expect(slotsOf(next)?.map((s) => s.rank)).toEqual([null, null, null, null]);
	});

	const clearD: Action = {
		type: "setStatus",
		heatId: "h1",
		riderId: "d",
		status: null,
	};

	test("null on a heat without ranks or order leaves the rider unranked", () => {
		const next = okBracket(fixture(), clearD);
		expect(slotsOf(next)?.[3]).toEqual({ riderId: "d", rank: null });
	});

	test("null puts the rider last when other riders are ranked", () => {
		const ranked = okBracket(started(), {
			type: "setRanks",
			heatId: "h1",
			riderIds: ["c", "a", "b"],
		});
		const next = okBracket(ranked, clearD);
		expect(slotsOf(next)).toEqual([
			{ riderId: "a", rank: 2 },
			{ riderId: "b", rank: 3 },
			{ riderId: "c", rank: 1 },
			{ riderId: "d", rank: 4 },
		]);
		expect(validateBracket(next)).toEqual([]);
	});

	test("null appends the rider to the provisional order when nobody is ranked", () => {
		const running = advanceHeat(fixture(), "h1", "running");
		const ordered = okBracket(running, {
			type: "reorderSlots",
			heatId: "h1",
			riderIds: ["c", "a", "b"],
		});
		const next = okBracket(ordered, clearD);
		const h = next.rounds[0]!.heats[0]!;
		expect(h.order).toEqual(["c", "a", "b", "d"]);
		expect(slotsOf(next)?.map((s) => s.rank)).toEqual([null, null, null, null]);
		expect(validateBracket(next)).toEqual([]);
	});

	test("changing from one status to another keeps the rider unranked", () => {
		const ranked = okBracket(started(), {
			type: "setRanks",
			heatId: "h1",
			riderIds: ["a", "b", "c"],
		});
		const next = okBracket(ranked, { ...clearD, status: "DSQ" });
		expect(slotsOf(next)?.[3]).toEqual({
			riderId: "d",
			rank: null,
			status: "DSQ",
		});
		expect(slotsOf(next)?.map((s) => s.rank)).toEqual([1, 2, 3, null]);
	});

	test("override flag and no-op", () => {
		const b = okBracket(started(), {
			type: "setStatus",
			heatId: "h1",
			riderId: "d",
			status: "DSQ",
			override: true,
		});
		expect(slotsOf(b)?.[3]).toEqual({
			riderId: "d",
			rank: null,
			status: "DSQ",
			overridden: true,
		});
		const cleared = okBracket(b, { type: "clearRanks", heatId: "h1" });
		expect(slotsOf(cleared)?.[3]).toBe(slotsOf(b)?.[3]);
	});

	test("same status, or null without status, returns the same bracket", () => {
		const b = fixture();
		for (const [riderId, status] of [
			["d", "DNF"],
			["a", null],
		] as const) {
			const result = run(b, {
				type: "setStatus",
				heatId: "h1",
				riderId,
				status,
			});
			expect(result.ok && result.bracket).toBe(b);
		}
	});

	test("refusals", () => {
		const b = fixture();
		expect(
			errorCode(b, {
				type: "setStatus",
				heatId: "x",
				riderId: "a",
				status: "DNF",
			}),
		).toBe("UNKNOWN_HEAT");
		expect(
			errorCode(b, {
				type: "setStatus",
				heatId: "h1",
				riderId: "e",
				status: "DNF",
			}),
		).toBe("RIDER_NOT_IN_HEAT");
		expect(
			errorCode(locked(b, "h1"), {
				type: "setStatus",
				heatId: "h1",
				riderId: "a",
				status: "DNF",
			}),
		).toBe("HEAT_LOCKED");
	});
});

test("applyAction defaults options when omitted", () => {
	const b = fixture();
	expect(applyAction(b, { type: "clearReview", heatId: "h1" })).toEqual({
		ok: true,
		bracket: b,
	});
});

describe("judged heats", () => {
	test("ranks and statuses cannot change until the heat is reopened", () => {
		const b = advanceHeat(fixture(), "h1", "judged");
		const actions: Action[] = [
			{ type: "setRanks", heatId: "h1", riderIds: ["a", "b", "c"] },
			{ type: "rankByPosition", heatId: "h1" },
			{ type: "clearRanks", heatId: "h1" },
			{ type: "setStatus", heatId: "h1", riderId: "a", status: "DNF" },
		];
		for (const action of actions) {
			expect(errorCode(b, action), action.type).toBe("HEAT_JUDGED");
		}
		const locked = advanceHeat(fixture(), "h1", "locked");
		for (const action of actions) {
			expect(errorCode(locked, action), action.type).toBe("HEAT_LOCKED");
		}
	});
});
