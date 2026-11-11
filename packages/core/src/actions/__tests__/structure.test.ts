import { describe, expect, test } from "vitest";
import type { Action } from "..";
import {
	advanceHeat,
	errorCode,
	okBracket,
	run,
	sampleBracket,
	withRider,
} from "../../__tests__/fixtures";

const newRound = (id: string) => ({
	id,
	name: `Round ${id}`,
	group: "main",
	maxPerHeat: 4,
	advancing: 2,
});

const addRound = (id: string, index?: number): Action => ({
	type: "addRound",
	round: newRound(id),
	...(index === undefined ? {} : { index }),
});

describe("addRound with rideMeans", () => {
	const scoring = {
		method: "rideMeans" as const,
		scale: { min: 0, max: 10, step: 0.5 },
		categories: [{ type: "wave", counted: 1 }],
		aggregation: "mean" as const,
	};

	test("refuses a round that would be in free mode", () => {
		const b = { ...sampleBracket(), scoring };
		const result = run(b, addRound("r9"));
		expect(!result.ok && result.error).toMatchObject({
			code: "INVALID_SCORING",
			details: { field: "method" },
		});
	});

	test("accepts it in head-judge mode", () => {
		const b = {
			...sampleBracket(),
			scoring,
			judgingMode: "headJudge" as const,
		};
		expect(errorCode(b, addRound("r9"))).toBe("ok");
	});
});

describe("addRound", () => {
	test("appends an empty round by default, or inserts at the index", () => {
		const b = sampleBracket();
		const appended = okBracket(b, addRound("r9"));
		expect(appended.rounds.map((r) => r.id)).toEqual(["r1", "r2", "r3", "r9"]);
		expect(appended.rounds[3]).toEqual({ ...newRound("r9"), heats: [] });
		expect(appended.rounds[0]).toBe(b.rounds[0]);
		expect(appended.links).toBe(b.links);
		const inserted = okBracket(b, addRound("r9", 1));
		expect(inserted.rounds.map((r) => r.id)).toEqual(["r1", "r9", "r2", "r3"]);
	});

	test("refusals", () => {
		const b = sampleBracket();
		expect(errorCode(b, addRound("r2"))).toBe("DUPLICATE_ID");
		expect(errorCode(b, addRound("r9", 4))).toBe("INVALID_ARGUMENT");
		expect(errorCode(b, addRound("r9", -1))).toBe("INVALID_ARGUMENT");
		const badMax: Action = {
			type: "addRound",
			round: { ...newRound("r9"), maxPerHeat: 0 },
		};
		expect(errorCode(b, badMax)).toBe("INVALID_MAX");
		const badAdvancing: Action = {
			type: "addRound",
			round: { ...newRound("r9"), advancing: 1.5 },
		};
		expect(errorCode(b, badAdvancing)).toBe("INVALID_ARGUMENT");
	});

	test("cannot be placed before or among started rounds", () => {
		const started = advanceHeat(
			withRider(sampleBracket(), "h3"),
			"h3",
			"running",
		);
		expect(errorCode(started, addRound("r9", 0))).toBe("ROUND_STARTED");
		expect(errorCode(started, addRound("r9", 1))).toBe("ROUND_STARTED");
		expect(errorCode(started, addRound("r9", 2))).toBe("ok");
		expect(errorCode(started, addRound("r9"))).toBe("ok");
		const earlier = advanceHeat(sampleBracket(), "h1", "running");
		expect(errorCode(earlier, addRound("r9", 0))).toBe("ROUND_STARTED");
		expect(errorCode(earlier, addRound("r9", 1))).toBe("ok");
	});
});

describe("removeRound", () => {
	test("removes the round and the links that reference its heats", () => {
		const b = okBracket(sampleBracket(), {
			type: "updateEntry",
			riderId: "seed",
			entryRoundId: null,
		});
		const next = okBracket(b, { type: "removeRound", roundId: "r2" });
		expect(next.rounds.map((r) => r.id)).toEqual(["r1", "r3"]);
		expect(next.links).toEqual([
			{ from: { heatId: "h1", rank: 3 }, to: "eliminated" },
		]);
		expect(next.rounds[0]).toBe(b.rounds[0]);
	});

	test("keeps the links reference when none is concerned", () => {
		const b = okBracket(sampleBracket(), {
			type: "addRound",
			round: newRound("r9"),
		});
		const next = okBracket(b, { type: "removeRound", roundId: "r9" });
		expect(next.links).toBe(b.links);
	});

	test("refusals", () => {
		const b = sampleBracket();
		expect(errorCode(b, { type: "removeRound", roundId: "x" })).toBe(
			"UNKNOWN_ROUND",
		);
		for (const final of ["running", "judged", "locked"] as const) {
			const started = advanceHeat(withRider(b, "h3"), "h3", final);
			expect(errorCode(started, { type: "removeRound", roundId: "r2" })).toBe(
				"ROUND_STARTED",
			);
		}
	});
});

describe("addHeat", () => {
	test("adds a pending empty heat, optionally named and positioned", () => {
		const b = sampleBracket();
		const next = okBracket(b, {
			type: "addHeat",
			roundId: "r1",
			heat: { id: "h9", name: "Extra" },
			index: 0,
		});
		expect(next.rounds[0]?.heats.map((h) => h.id)).toEqual(["h9", "h1", "h2"]);
		expect(next.rounds[0]?.heats[0]).toEqual({
			id: "h9",
			name: "Extra",
			status: "pending",
			slots: [],
		});
		expect(next.rounds[0]?.heats[1]).toBe(b.rounds[0]?.heats[0]);
		expect(next.rounds[1]).toBe(b.rounds[1]);
		const plain = okBracket(b, {
			type: "addHeat",
			roundId: "r2",
			heat: { id: "h9" },
		});
		expect(plain.rounds[1]?.heats[1]).toEqual({
			id: "h9",
			status: "pending",
			slots: [],
		});
	});

	test("is allowed in a started round", () => {
		const started = advanceHeat(sampleBracket(), "h1", "locked");
		expect(
			errorCode(started, {
				type: "addHeat",
				roundId: "r1",
				heat: { id: "h9" },
			}),
		).toBe("ok");
	});

	test("refusals", () => {
		const b = sampleBracket();
		expect(
			errorCode(b, { type: "addHeat", roundId: "x", heat: { id: "h9" } }),
		).toBe("UNKNOWN_ROUND");
		expect(
			errorCode(b, { type: "addHeat", roundId: "r1", heat: { id: "h4" } }),
		).toBe("DUPLICATE_ID");
		expect(
			errorCode(b, {
				type: "addHeat",
				roundId: "r1",
				heat: { id: "h9" },
				index: 3,
			}),
		).toBe("INVALID_ARGUMENT");
	});
});

describe("removeHeat", () => {
	test("removes the heat and the links that reference it", () => {
		const b = sampleBracket();
		const next = okBracket(b, { type: "removeHeat", heatId: "h3" });
		expect(next.rounds[1]?.heats).toEqual([]);
		expect(next.links).toEqual([
			{ from: { heatId: "h1", rank: 3 }, to: "eliminated" },
		]);
		expect(next.rounds[0]).toBe(b.rounds[0]);
		expect(next.rounds[2]).toBe(b.rounds[2]);
	});

	test("refusals", () => {
		const b = sampleBracket();
		expect(errorCode(b, { type: "removeHeat", heatId: "x" })).toBe(
			"UNKNOWN_HEAT",
		);
		for (const final of ["running", "judged", "locked"] as const) {
			expect(
				errorCode(advanceHeat(withRider(b, "h3"), "h3", final), {
					type: "removeHeat",
					heatId: "h3",
				}),
			).toBe("HEAT_STARTED");
		}
	});
});

describe("removal of heats and rounds fed by judged heats", () => {
	/** h1 is judged and feeds h3; a also sits in h4. */
	const afterH1 = () => {
		let b = okBracket(sampleBracket(), {
			type: "updateEntry",
			riderId: "seed",
			entryRoundId: null,
		});
		b = okBracket(b, { type: "place", riderId: "a", heatId: "h4" });
		return advanceHeat(b, "h1", "judged");
	};

	test("removeHeat needs confirmation and flags the heats downstream", () => {
		const b = afterH1();
		const refused = run(b, { type: "removeHeat", heatId: "h3" });
		expect(!refused.ok && refused.error).toMatchObject({
			code: "DESTRUCTIVE_CHANGE",
			details: { judgedHeats: 1 },
		});
		const next = okBracket(b, {
			type: "removeHeat",
			heatId: "h3",
			confirm: true,
		});
		expect(next.rounds[1]?.heats).toEqual([]);
		expect(next.rounds[2]?.heats[0]?.needsReview).toBe(true);
		expect(next.rounds[0]).toBe(b.rounds[0]);
	});

	test("removeRound needs confirmation and flags the heats downstream", () => {
		const b = afterH1();
		expect(errorCode(b, { type: "removeRound", roundId: "r2" })).toBe(
			"DESTRUCTIVE_CHANGE",
		);
		const next = okBracket(b, {
			type: "removeRound",
			roundId: "r2",
			confirm: true,
		});
		expect(next.rounds.map((r) => r.id)).toEqual(["r1", "r3"]);
		expect(next.rounds[1]?.heats[0]?.needsReview).toBe(true);
		expect(next.links).toEqual([
			{ from: { heatId: "h1", rank: 3 }, to: "eliminated" },
		]);
	});

	test("links from pending heats only are dropped without confirmation", () => {
		const b = afterH1();
		expect(errorCode(b, { type: "removeHeat", heatId: "h4" })).toBe("ok");
	});
});

describe("removeRound and entry rounds", () => {
	test("refuses a round that is some rider's entry round", () => {
		const b = sampleBracket();
		const result = run(b, { type: "removeRound", roundId: "r2" });
		expect(!result.ok && result.error).toMatchObject({
			code: "ROUND_REFERENCED",
			details: { roundId: "r2", riderId: "seed" },
		});
		expect(errorCode(b, { type: "removeRound", roundId: "r3" })).toBe("ok");
	});
});
