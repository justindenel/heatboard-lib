import { describe, expect, test } from "vitest";
import { applyAction, type Action } from "..";
import {
	advanceHeat,
	bracket,
	errorCode,
	heat,
	okBracket,
	round,
	run,
	sampleBracket,
	withRanks,
} from "../../__tests__/fixtures";

const base = () =>
	bracket(
		[
			round("r1", [heat("h1", ["a", "b"]), heat("h2", ["c"])], {
				maxPerHeat: 3,
			}),
			round("r2", [heat("h3"), heat("h4")]),
		],
		{
			status: "published",
			entries: [
				...["a", "b", "c", "d"].map((riderId) => ({
					riderId,
					displayName: riderId,
				})),
				{ riderId: "late", displayName: "late", entryRoundId: "r2" },
			],
		},
	);

describe("place", () => {
	test("appends by default and shares untouched structure", () => {
		const b = base();
		const next = okBracket(b, { type: "place", riderId: "d", heatId: "h2" });
		expect(next.rounds[0]?.heats[1]?.slots.map((s) => s.riderId)).toEqual([
			"c",
			"d",
		]);
		expect(next.rounds[0]?.heats[0]).toBe(b.rounds[0]?.heats[0]);
		expect(next.rounds[1]).toBe(b.rounds[1]);
		expect(next.entries).toBe(b.entries);
	});

	test("inserts at an index", () => {
		const next = okBracket(base(), {
			type: "place",
			riderId: "d",
			heatId: "h1",
			index: 1,
		});
		expect(next.rounds[0]?.heats[0]?.slots.map((s) => s.riderId)).toEqual([
			"a",
			"d",
			"b",
		]);
	});

	test("refusals", () => {
		const b = base();
		expect(errorCode(b, { type: "place", riderId: "d", heatId: "nope" })).toBe(
			"UNKNOWN_HEAT",
		);
		expect(errorCode(b, { type: "place", riderId: "zz", heatId: "h1" })).toBe(
			"UNKNOWN_RIDER",
		);
		expect(errorCode(b, { type: "place", riderId: "late", heatId: "h1" })).toBe(
			"BEFORE_ENTRY_ROUND",
		);
		expect(errorCode(b, { type: "place", riderId: "c", heatId: "h1" })).toBe(
			"RIDER_ALREADY_IN_ROUND",
		);
		expect(errorCode(b, { type: "place", riderId: "a", heatId: "h1" })).toBe(
			"RIDER_ALREADY_IN_ROUND",
		);
		const full = okBracket(b, { type: "place", riderId: "d", heatId: "h1" });
		expect(
			errorCode(full, { type: "place", riderId: "late", heatId: "h3" }),
		).toBe("ok");
		const tight = okBracket(base(), {
			type: "setMaxPerHeat",
			roundId: "r1",
			max: 2,
		});
		expect(
			errorCode(tight, { type: "place", riderId: "d", heatId: "h1" }),
		).toBe("HEAT_FULL");
	});

	test("refuses on started or locked heats", () => {
		const b = base();
		const running = okBracket(b, {
			type: "setHeatStatus",
			heatId: "h1",
			status: "running",
		});
		expect(
			errorCode(running, { type: "place", riderId: "d", heatId: "h1" }),
		).toBe("HEAT_STARTED");
		const judged = advanceHeat(b, "h1", "judged");
		expect(
			errorCode(judged, { type: "place", riderId: "d", heatId: "h1" }),
		).toBe("HEAT_STARTED");
		const locked = advanceHeat(b, "h1", "locked");
		expect(
			errorCode(locked, { type: "place", riderId: "d", heatId: "h1" }),
		).toBe("HEAT_LOCKED");
	});
});

describe("remove", () => {
	test("removes and renumbers remaining ranks", () => {
		let b = base();
		b = okBracket(b, { type: "place", riderId: "d", heatId: "h1" });
		b = withRanks(b, "h1", ["b", "a", "d"]);
		const next = okBracket(b, { type: "remove", riderId: "b", heatId: "h1" });
		expect(next.rounds[0]?.heats[0]?.slots).toEqual([
			{ riderId: "a", rank: 1 },
			{ riderId: "d", rank: 2 },
		]);
		expect(next.rounds[1]).toBe(b.rounds[1]);
	});

	test("refusals", () => {
		const b = base();
		expect(errorCode(b, { type: "remove", riderId: "a", heatId: "x" })).toBe(
			"UNKNOWN_HEAT",
		);
		expect(errorCode(b, { type: "remove", riderId: "c", heatId: "h1" })).toBe(
			"RIDER_NOT_IN_HEAT",
		);
		const running = okBracket(b, {
			type: "setHeatStatus",
			heatId: "h1",
			status: "running",
		});
		expect(
			errorCode(running, { type: "remove", riderId: "a", heatId: "h1" }),
		).toBe("HEAT_STARTED");
	});
});

describe("move", () => {
	test("moves between heats of the same round", () => {
		const b = base();
		const next = okBracket(b, {
			type: "move",
			riderId: "a",
			fromHeatId: "h1",
			toHeatId: "h2",
			index: 0,
		});
		expect(next.rounds[0]?.heats[0]?.slots.map((s) => s.riderId)).toEqual([
			"b",
		]);
		expect(next.rounds[0]?.heats[1]?.slots.map((s) => s.riderId)).toEqual([
			"a",
			"c",
		]);
		expect(next.rounds[1]).toBe(b.rounds[1]);
	});

	test("resets the moved rank and renumbers the source heat", () => {
		let b = withRanks(base(), "h1", ["a", "b"]);
		b = okBracket(b, {
			type: "move",
			riderId: "a",
			fromHeatId: "h1",
			toHeatId: "h2",
		});
		expect(b.rounds[0]?.heats[0]?.slots).toEqual([{ riderId: "b", rank: 1 }]);
		expect(b.rounds[0]?.heats[1]?.slots[1]).toEqual({
			riderId: "a",
			rank: null,
		});
	});

	test("reorders inside a heat, even when full", () => {
		let b = okBracket(base(), { type: "place", riderId: "d", heatId: "h1" });
		b = okBracket(b, {
			type: "move",
			riderId: "d",
			fromHeatId: "h1",
			toHeatId: "h1",
			index: 0,
		});
		expect(b.rounds[0]?.heats[0]?.slots.map((s) => s.riderId)).toEqual([
			"d",
			"a",
			"b",
		]);
	});

	test("reorder to the same position is a no-op", () => {
		const b = base();
		const result = run(b, {
			type: "move",
			riderId: "a",
			fromHeatId: "h1",
			toHeatId: "h1",
			index: 0,
		});
		expect(result.ok && result.bracket).toBe(b);
	});

	test("refusals", () => {
		const b = base();
		const move = (
			over: Partial<Extract<Action, { type: "move" }>>,
		): Action => ({
			type: "move",
			riderId: "a",
			fromHeatId: "h1",
			toHeatId: "h2",
			...over,
		});
		expect(errorCode(b, move({ fromHeatId: "x" }))).toBe("UNKNOWN_HEAT");
		expect(errorCode(b, move({ toHeatId: "x" }))).toBe("UNKNOWN_HEAT");
		expect(errorCode(b, move({ riderId: "c" }))).toBe("RIDER_NOT_IN_HEAT");
		expect(errorCode(b, move({ toHeatId: "h3" }))).toBe("CROSS_ROUND_MOVE");
		const tight = okBracket(b, {
			type: "setMaxPerHeat",
			roundId: "r1",
			max: 2,
		});
		const full = okBracket(tight, {
			type: "place",
			riderId: "d",
			heatId: "h2",
		});
		expect(errorCode(full, move({}))).toBe("HEAT_FULL");
		const running = okBracket(b, {
			type: "setHeatStatus",
			heatId: "h2",
			status: "running",
		});
		expect(errorCode(running, move({}))).toBe("HEAT_STARTED");
		expect(
			errorCode(
				running,
				move({ fromHeatId: "h2", toHeatId: "h1", riderId: "c" }),
			),
		).toBe("HEAT_STARTED");
		const locked = advanceHeat(b, "h1", "locked");
		expect(
			errorCode(locked, {
				type: "move",
				riderId: "a",
				fromHeatId: "h1",
				toHeatId: "h1",
				index: 1,
			}),
		).toBe("HEAT_LOCKED");
	});

	test("cross-round move when allowed, with entry and duplicate checks", () => {
		const b = base();
		const options = { allowCrossRoundMove: true };
		const next = okBracket(
			b,
			{ type: "move", riderId: "a", fromHeatId: "h1", toHeatId: "h3" },
			options,
		);
		expect(next.rounds[1]?.heats[0]?.slots.map((s) => s.riderId)).toEqual([
			"a",
		]);
		const withB = okBracket(next, {
			type: "place",
			riderId: "b",
			heatId: "h4",
		});
		expect(
			errorCode(
				withB,
				{ type: "move", riderId: "b", fromHeatId: "h1", toHeatId: "h3" },
				options,
			),
		).toBe("RIDER_ALREADY_IN_ROUND");
		const lateInR2 = okBracket(b, {
			type: "place",
			riderId: "late",
			heatId: "h3",
		});
		expect(
			errorCode(
				lateInR2,
				{ type: "move", riderId: "late", fromHeatId: "h3", toHeatId: "h1" },
				options,
			),
		).toBe("BEFORE_ENTRY_ROUND");
	});

	test("cross-round move into a full heat", () => {
		let b = okBracket(base(), { type: "setMaxPerHeat", roundId: "r2", max: 1 });
		b = okBracket(b, { type: "place", riderId: "d", heatId: "h3" });
		expect(
			errorCode(
				b,
				{ type: "move", riderId: "a", fromHeatId: "h1", toHeatId: "h3" },
				{ allowCrossRoundMove: true },
			),
		).toBe("HEAT_FULL");
	});
});

describe("sample bracket sanity", () => {
	test("unknown entry round is reported on place", () => {
		const b = sampleBracket();
		b.entries.push({
			riderId: "ghost",
			displayName: "g",
			entryRoundId: "nope",
		});
		expect(
			errorCode(b, { type: "place", riderId: "ghost", heatId: "h1" }),
		).toBe("UNKNOWN_ROUND");
	});
});

describe("index validation", () => {
	test("place and move refuse indexes outside the valid range", () => {
		const b = base();
		for (const index of [-1, 3, 0.5, Number.NaN]) {
			expect(
				errorCode(b, { type: "place", riderId: "d", heatId: "h1", index }),
			).toBe("INVALID_ARGUMENT");
			expect(
				errorCode(b, {
					type: "move",
					riderId: "a",
					fromHeatId: "h1",
					toHeatId: "h2",
					index,
				}),
			).toBe("INVALID_ARGUMENT");
		}
		expect(
			errorCode(b, {
				type: "move",
				riderId: "a",
				fromHeatId: "h1",
				toHeatId: "h1",
				index: 2,
			}),
		).toBe("INVALID_ARGUMENT");
		expect(
			errorCode(b, { type: "place", riderId: "d", heatId: "h1", index: 2 }),
		).toBe("ok");
	});
});

describe("remove in the first round", () => {
	test("is allowed on a pending heat and leaves entries untouched", () => {
		const b = base();
		const next = okBracket(b, { type: "remove", riderId: "a", heatId: "h1" });
		expect(next.rounds[0]?.heats[0]?.slots.map((s) => s.riderId)).toEqual([
			"b",
		]);
		expect(next.entries).toBe(b.entries);
	});
});

test("move keeps the override flag of a kept status", () => {
	const b = okBracket(base(), {
		type: "setStatus",
		heatId: "h1",
		riderId: "a",
		status: "DNF",
		override: true,
	});
	const next = okBracket(b, {
		type: "move",
		riderId: "a",
		fromHeatId: "h1",
		toHeatId: "h2",
	});
	expect(next.rounds[0]?.heats[1]?.slots[1]).toEqual({
		riderId: "a",
		rank: null,
		status: "DNF",
		overridden: true,
	});
});

test("heats are replaced by position even when ids are duplicated", () => {
	const b = bracket(
		[round("r1", [heat("x", ["a"])]), round("r2", [heat("x")])],
		{
			entries: [
				{ riderId: "a", displayName: "a" },
				{ riderId: "b", displayName: "b" },
			],
		},
	);
	const next = okBracket(b, { type: "place", riderId: "b", heatId: "x" });
	expect(next.rounds[0]?.heats[0]?.slots).toHaveLength(2);
	expect(next.rounds[1]).toBe(b.rounds[1]);
});

test("unknown action types are reported", () => {
	const result = applyAction(base(), { type: "explode" } as unknown as Action);
	expect(!result.ok && result.error.code).toBe("UNKNOWN_ACTION");
});
