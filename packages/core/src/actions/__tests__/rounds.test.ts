import { describe, expect, test } from "vitest";
import type { Action } from "..";
import type { Bracket } from "../../model";
import {
	advanceHeat,
	errorCode,
	okBracket,
	run,
	sampleBracket,
} from "../../__tests__/fixtures";

const to = (
	b: Bracket,
	heatId: string,
	status: "running" | "judged" | "locked" | "pending",
) => okBracket(b, { type: "setHeatStatus", heatId, status });

describe("setMaxPerHeat", () => {
	test("updates only the target round", () => {
		const b = sampleBracket("published");
		const next = okBracket(b, { type: "setMaxPerHeat", roundId: "r2", max: 6 });
		expect(next.rounds[1]?.maxPerHeat).toBe(6);
		expect(next.rounds[0]).toBe(b.rounds[0]);
		expect(next.rounds[2]).toBe(b.rounds[2]);
		expect(next.rounds[1]?.heats).toBe(b.rounds[1]?.heats);
	});

	test("same value is a no-op", () => {
		const b = sampleBracket("published");
		const result = run(b, { type: "setMaxPerHeat", roundId: "r1", max: 4 });
		expect(result.ok && result.bracket).toBe(b);
	});

	test("refusals", () => {
		const b = sampleBracket("published");
		const set = (roundId: string, max: number): Action => ({
			type: "setMaxPerHeat",
			roundId,
			max,
		});
		expect(errorCode(b, set("x", 3))).toBe("UNKNOWN_ROUND");
		expect(errorCode(b, set("r1", 0))).toBe("INVALID_MAX");
		expect(errorCode(b, set("r1", 2.5))).toBe("INVALID_MAX");
		expect(errorCode(b, set("r1", Number.NaN))).toBe("INVALID_MAX");
		expect(errorCode(b, set("r1", 3))).toBe("MAX_BELOW_CURRENT");
	});
});

describe("reset", () => {
	const dirty = () => {
		let b = to(sampleBracket("published"), "h1", "running");
		b = okBracket(b, { type: "rankByPosition", heatId: "h1" });
		b = okBracket(b, {
			type: "setStatus",
			heatId: "h1",
			riderId: "d",
			status: "DNF",
			override: true,
		});
		b = to(b, "h1", "judged");
		b = okBracket(b, {
			type: "setHeatStatus",
			heatId: "h1",
			status: "running",
		});
		b = okBracket(b, { type: "place", riderId: "a", heatId: "h3" });
		return okBracket(b, { type: "place", riderId: "seed", heatId: "h4" });
	};

	test("keeps round 1 composition, clears the rest", () => {
		const next = okBracket(dirty(), { type: "reset" });
		const h1 = next.rounds[0]?.heats[0];
		expect(h1?.status).toBe("pending");
		expect(h1?.slots).toEqual(
			["a", "b", "c", "d"].map((riderId) => ({ riderId, rank: null })),
		);
		expect(next.rounds[1]?.heats[0]?.slots).toEqual([]);
		expect(next.rounds[2]?.heats[0]?.slots).toEqual([]);
		expect(next.rounds[1]?.heats[0]).not.toHaveProperty("needsReview");
	});

	test("clears the start time of every heat", () => {
		let b = okBracket(sampleBracket("published"), {
			type: "setHeatStatus",
			heatId: "h1",
			status: "running",
			at: "2026-03-01T10:00:00.000Z",
		});
		b = okBracket(b, {
			type: "setHeatStatus",
			heatId: "h2",
			status: "running",
			at: "2026-03-01T10:20:00.000Z",
		});
		const next = okBracket(b, { type: "reset", confirm: true });
		for (const h of next.rounds[0]?.heats ?? []) {
			expect(h).not.toHaveProperty("startedAt");
			expect(h.status).toBe("pending");
		}
	});

	test("keepRounds is honored and untouched structure is shared", () => {
		const b = dirty();
		const next = okBracket(b, { type: "reset", keepRounds: 2 });
		expect(next.rounds[1]?.heats[0]?.slots).toEqual([
			{ riderId: "a", rank: null },
		]);
		expect(next.rounds[2]?.heats[0]?.slots).toEqual([]);
		expect(next.rounds[0]?.heats[1]).toBe(b.rounds[0]?.heats[1]);
		const none = okBracket(b, { type: "reset", keepRounds: 0 });
		expect(none.rounds[0]?.heats[0]?.slots).toEqual([]);
	});

	test("resetting a clean bracket returns it unchanged", () => {
		const b = sampleBracket("published");
		const result = run(b, { type: "reset" });
		expect(result.ok && result.bracket).toBe(b);
	});
});

describe("reset arguments and slot sharing", () => {
	test("invalid keepRounds is refused", () => {
		const b = sampleBracket("published");
		for (const keepRounds of [-1, 1.5, Number.NaN]) {
			expect(errorCode(b, { type: "reset", keepRounds })).toBe(
				"INVALID_ARGUMENT",
			);
		}
	});

	test("clean slots in kept rounds keep their reference", () => {
		const b = okBracket(sampleBracket("published"), {
			type: "setStatus",
			heatId: "h1",
			riderId: "a",
			status: "DNF",
		});
		const next = okBracket(b, { type: "reset" });
		const before = b.rounds[0]?.heats[0]?.slots;
		const after = next.rounds[0]?.heats[0]?.slots;
		expect(after?.[0]).not.toBe(before?.[0]);
		expect(after?.[1]).toBe(before?.[1]);
		expect(next.rounds[0]?.heats[1]).toBe(b.rounds[0]?.heats[1]);
	});
});

describe("reset on a bracket with results", () => {
	const judged = () => advanceHeat(sampleBracket("published"), "h1", "judged");

	test("needs confirmation once the bracket has started", () => {
		const b = judged();
		const refused = run(b, { type: "reset" });
		expect(!refused.ok && refused.error).toMatchObject({
			code: "DESTRUCTIVE_CHANGE",
			details: { judgedHeats: 1 },
		});
		const next = okBracket(b, { type: "reset", confirm: true });
		expect(next.rounds[0]?.heats[0]?.status).toBe("pending");
	});

	test("does not need confirmation while preparing or without judged heat", () => {
		const prepared: Bracket = { ...judged(), status: "published" };
		expect(errorCode(prepared, { type: "reset" })).toBe("ok");
		const running = advanceHeat(sampleBracket("published"), "h1", "running");
		expect(errorCode(running, { type: "reset" })).toBe("ok");
	});
});
