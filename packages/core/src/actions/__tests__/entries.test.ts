import { describe, expect, test } from "vitest";
import type { Bracket, Entry } from "../../model";
import {
	errorCode,
	okBracket,
	run,
	sampleBracket,
	withRanks,
	withRider,
} from "../../__tests__/fixtures";

const running = (): Bracket => {
	const b = sampleBracket("published");
	return okBracket(b, {
		type: "setHeatStatus",
		heatId: "h1",
		status: "running",
	});
};

describe("addEntry", () => {
	test("appends the entry and shares the rounds", () => {
		const b = sampleBracket();
		const entry = { riderId: "z", displayName: "Zed", seed: 1 };
		const next = okBracket(b, { type: "addEntry", entry });
		expect(next.entries.at(-1)).toEqual(entry);
		expect(next.entries).toHaveLength(b.entries.length + 1);
		expect(next.rounds).toBe(b.rounds);
	});

	test("refuses a duplicate rider id", () => {
		const b = sampleBracket();
		expect(
			errorCode(b, {
				type: "addEntry",
				entry: { riderId: "a", displayName: "A" },
			}),
		).toBe("DUPLICATE_ID");
	});

	test("stores only the known fields of the entry", () => {
		const b = sampleBracket();
		const entry = {
			riderId: "z",
			displayName: "Z",
			seed: 3,
			entryRoundId: "r2",
		} as Entry;
		const next = okBracket(b, { type: "addEntry", entry });
		expect(next.entries.at(-1)).toEqual({
			riderId: "z",
			displayName: "Z",
			seed: 3,
		});
	});

	test("refuses to join once the first round has started and the bracket is running", () => {
		expect(
			errorCode(running(), {
				type: "addEntry",
				entry: { riderId: "z", displayName: "Z" },
			}),
		).toBe("ROUND_STARTED");
	});

	test("joining is allowed while preparing, even with a started round", () => {
		const b: Bracket = { ...running(), status: "published" };
		expect(
			errorCode(b, {
				type: "addEntry",
				entry: { riderId: "z", displayName: "Z" },
			}),
		).toBe("ok");
	});
});

describe("addEntries", () => {
	const entry = (riderId: string, extra = {}) => ({
		riderId,
		displayName: riderId.toUpperCase(),
		...extra,
	});

	test("appends every entry in order, sharing the rounds", () => {
		const b = sampleBracket();
		const entries = [entry("y", { seed: 1 }), entry("z")];
		const next = okBracket(b, { type: "addEntries", entries });
		expect(next.entries.slice(-2)).toEqual(entries);
		expect(next.entries).toHaveLength(b.entries.length + 2);
		expect(next.rounds).toBe(b.rounds);
	});

	test("an empty list is a no-op", () => {
		const b = sampleBracket();
		const result = run(b, { type: "addEntries", entries: [] });
		expect(result.ok && result.bracket).toBe(b);
	});

	test("one invalid entry rejects the whole batch", () => {
		const b = sampleBracket();
		const result = run(b, {
			type: "addEntries",
			entries: [entry("y"), entry("a"), entry("z")],
		});
		expect(!result.ok && result.error).toMatchObject({
			code: "DUPLICATE_ID",
			details: { id: "a", index: 1 },
		});
	});

	test("refuses a started first round like addEntry does", () => {
		expect(
			errorCode(running(), {
				type: "addEntries",
				entries: [entry("y"), entry("z")],
			}),
		).toBe("ROUND_STARTED");
	});

	test("refuses a duplicate inside the batch", () => {
		const result = run(sampleBracket(), {
			type: "addEntries",
			entries: [entry("y"), entry("y")],
		});
		expect(!result.ok && result.error).toMatchObject({
			code: "DUPLICATE_ID",
			details: { id: "y", index: 1 },
		});
	});
});

describe("updateEntry", () => {
	test("changes the display name only", () => {
		const b = sampleBracket();
		const next = okBracket(b, {
			type: "updateEntry",
			riderId: "a",
			displayName: "Alpha",
		});
		expect(next.entries.find((e) => e.riderId === "a")).toEqual({
			riderId: "a",
			displayName: "Alpha",
		});
		expect(next.entries.find((e) => e.riderId === "b")).toBe(
			b.entries.find((e) => e.riderId === "b"),
		);
		expect(next.rounds).toBe(b.rounds);
	});

	test("sets and removes the seed", () => {
		const b = sampleBracket();
		const seeded = okBracket(b, {
			type: "updateEntry",
			riderId: "seed",
			seed: 2,
		});
		expect(seeded.entries.find((e) => e.riderId === "seed")).toEqual({
			riderId: "seed",
			displayName: "seed",
			seed: 2,
		});
		const cleared = okBracket(seeded, {
			type: "updateEntry",
			riderId: "seed",
			seed: null,
		});
		expect(cleared.entries.find((e) => e.riderId === "seed")).toEqual({
			riderId: "seed",
			displayName: "seed",
		});
	});

	test("a change that leaves the entry identical is a no-op", () => {
		const b = sampleBracket();
		const result = run(b, {
			type: "updateEntry",
			riderId: "seed",
			displayName: "seed",
			seed: null,
		});
		expect(result.ok && result.bracket).toBe(b);
	});

	test("refusals", () => {
		const b = sampleBracket();
		expect(
			errorCode(b, { type: "updateEntry", riderId: "zz", displayName: "x" }),
		).toBe("UNKNOWN_RIDER");
	});
});

describe("removeEntry", () => {
	test("removes the entry and its slots from pending heats, renumbering ranks", () => {
		let b = sampleBracket();
		b = withRanks(b, "h1", ["a", "b", "c", "d"]);
		b = withRider(b, "h3", "b");
		const next = okBracket(b, { type: "removeEntry", riderId: "b" });
		expect(next.entries.some((e) => e.riderId === "b")).toBe(false);
		expect(next.rounds[0]?.heats[0]?.slots).toEqual([
			{ riderId: "a", rank: 1 },
			{ riderId: "c", rank: 2 },
			{ riderId: "d", rank: 3 },
		]);
		expect(next.rounds[1]?.heats[0]?.slots).toEqual([]);
		expect(next.rounds[0]?.heats[1]).toBe(b.rounds[0]?.heats[1]);
		expect(next.rounds[2]).toBe(b.rounds[2]);
		expect(next.links).toBe(b.links);
	});

	test("refuses when the rider is in a started heat", () => {
		const b = running();
		expect(errorCode(b, { type: "removeEntry", riderId: "a" })).toBe(
			"RIDER_IN_STARTED_HEAT",
		);
		expect(errorCode(b, { type: "removeEntry", riderId: "e" })).toBe("ok");
		expect(errorCode(b, { type: "removeEntry", riderId: "zz" })).toBe(
			"UNKNOWN_RIDER",
		);
	});
});
