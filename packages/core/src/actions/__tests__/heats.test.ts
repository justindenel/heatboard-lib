import { describe, expect, test } from "vitest";
import type { Bracket } from "../../model";
import {
	advanceHeat,
	bracket,
	errorCode,
	heat,
	okBracket,
	round,
	run,
	sampleBracket,
} from "../../__tests__/fixtures";

const published = () => sampleBracket("published");

const to = (
	b: Bracket,
	heatId: string,
	status: "running" | "judged" | "locked" | "pending",
) => okBracket(b, { type: "setHeatStatus", heatId, status });
describe("setHeatStatus", () => {
	test("allowed transitions", () => {
		const steps: [string, string][] = [
			["pending", "running"],
			["running", "pending"],
			["running", "judged"],
			["judged", "running"],
			["judged", "locked"],
			["locked", "judged"],
		];
		for (const [from, target] of steps) {
			const slots =
				from === "running" && target === "pending"
					? ["a"]
					: [{ id: "a", rank: 1 }];
			const b = bracket(
				[round("r", [heat("h", slots, { status: from as "pending" })])],
				{ status: "published" },
			);
			expect(
				errorCode(b, {
					type: "setHeatStatus",
					heatId: "h",
					status: target as "pending",
				}),
			).toBe("ok");
		}
	});

	test("forbidden transitions", () => {
		const steps: [string, string][] = [
			["pending", "judged"],
			["pending", "locked"],
			["running", "locked"],
			["judged", "pending"],
			["locked", "running"],
			["locked", "pending"],
		];
		for (const [from, target] of steps) {
			const b = bracket([
				round("r", [
					heat("h", [{ id: "a", rank: 1 }], { status: from as "pending" }),
				]),
			]);
			expect(
				errorCode(b, {
					type: "setHeatStatus",
					heatId: "h",
					status: target as "pending",
				}),
			).toBe("INVALID_STATUS_TRANSITION");
		}
	});

	test("a heat without any known rider cannot start", () => {
		const b = bracket([round("r", [heat("h", [])])], { status: "published" });
		expect(
			errorCode(b, { type: "setHeatStatus", heatId: "h", status: "running" }),
		).toBe("HEAT_EMPTY");
	});

	test("same status is a no-op", () => {
		const b = sampleBracket();
		const result = run(b, {
			type: "setHeatStatus",
			heatId: "h1",
			status: "pending",
		});
		expect(result.ok && result.bracket).toBe(b);
	});

	test("judging requires every rider without status to be ranked", () => {
		const b = to(published(), "h1", "running");
		expect(
			errorCode(b, { type: "setHeatStatus", heatId: "h1", status: "judged" }),
		).toBe("HEAT_NOT_RANKED");
		const ranked = okBracket(b, { type: "rankByPosition", heatId: "h1" });
		expect(
			errorCode(ranked, {
				type: "setHeatStatus",
				heatId: "h1",
				status: "judged",
			}),
		).toBe("ok");
	});

	test("unknown heat", () => {
		expect(
			errorCode(sampleBracket(), {
				type: "setHeatStatus",
				heatId: "x",
				status: "running",
			}),
		).toBe("UNKNOWN_HEAT");
	});

	test("reopening flags later heats that hold one of its riders without being a link target", () => {
		let b = published();
		b = okBracket(b, { type: "place", riderId: "a", heatId: "h4" });
		b = okBracket(b, { type: "place", riderId: "e", heatId: "h4" });
		b = okBracket(b, {
			type: "place",
			riderId: "seed",
			heatId: "h4",
			index: 0,
		});
		b = advanceHeat(b, "h1", "judged");
		const reopened = to(b, "h1", "running");
		expect(reopened.rounds[1]?.heats[0]?.slots).toEqual([]);
		expect(reopened.rounds[1]?.heats[0]?.needsReview).toBeUndefined();
		expect(reopened.rounds[2]?.heats[0]?.needsReview).toBe(true);
		expect(reopened.rounds[0]?.heats[1]).toBe(b.rounds[0]?.heats[1]);

		const lockedB = to(b, "h1", "locked");
		const unlocked = to(lockedB, "h1", "judged");
		expect(unlocked.rounds[2]?.heats[0]?.needsReview).toBe(true);
		expect(unlocked.rounds[1]?.heats[0]?.slots).toBe(
			lockedB.rounds[1]?.heats[0]?.slots,
		);
		expect(lockedB.rounds[2]?.heats[0]?.needsReview).toBeUndefined();
	});

	test("normal forward transitions do not flag anything", () => {
		let b = okBracket(sampleBracket(), {
			type: "place",
			riderId: "a",
			heatId: "h3",
		});
		b = advanceHeat(b, "h1", "locked");
		expect(b.rounds[1]?.heats[0]?.needsReview).toBeUndefined();
	});
});

describe("cancelling the start of a heat", () => {
	const running = (slots: Parameters<typeof heat>[1]) =>
		bracket([round("r", [heat("h", slots, { status: "running" })])], {
			status: "running",
		});
	const back = {
		type: "setHeatStatus",
		heatId: "h",
		status: "pending",
	} as const;

	test("is allowed while no rank is entered", () => {
		const next = okBracket(running(["a", "b"]), back);
		expect(next.rounds[0]?.heats[0]?.status).toBe("pending");
	});

	test("is refused once a rank is entered, naming the rider", () => {
		const b = running([{ id: "a", rank: 1 }, "b"]);
		expect(errorCode(b, back)).toBe("HEAT_HAS_RANKS");
		const result = run(b, back);
		expect(!result.ok && result.error.details).toEqual({
			heatId: "h",
			riderId: "a",
		});
	});

	test("is allowed again after the ranks are cleared", () => {
		const cleared = okBracket(running([{ id: "a", rank: 1 }, "b"]), {
			type: "clearRanks",
			heatId: "h",
		});
		expect(errorCode(cleared, back)).toBe("ok");
	});

	test("a status without rank does not block it", () => {
		const b = running(["a", { id: "b", status: "DNS" }]);
		expect(errorCode(b, back)).toBe("ok");
	});

	test("flags nothing downstream", () => {
		const b = bracket(
			[
				round("r1", [heat("h", ["a"], { status: "running" })]),
				round("r2", [heat("next", ["a"])]),
			],
			{ status: "running" },
		);
		const next = okBracket(b, back);
		expect(next.rounds[1]).toBe(b.rounds[1]);
	});
});

describe("reopening a heat with downstream heats", () => {
	type Status = "pending" | "running" | "judged" | "locked";
	const build = (source: Status, downstream: Status[]) =>
		bracket(
			[
				round("r1", [
					heat(
						"h1",
						[
							{ id: "a", rank: 1 },
							{ id: "b", rank: 2 },
						],
						{ status: source },
					),
					heat("h2", [{ id: "c", rank: 1 }], { status: "judged" }),
				]),
				round(
					"r2",
					downstream.map((status, i) =>
						heat(`d${i}`, ["a", `x${i}`], { status }),
					),
				),
			],
			{ status: "running" },
		);
	const reopen = (source: Status) =>
		({
			type: "setHeatStatus",
			heatId: "h1",
			status: source === "locked" ? "judged" : "running",
		}) as const;

	for (const source of ["judged", "locked"] as const) {
		for (const started of ["running", "judged", "locked"] as const) {
			test(`${source} heat is refused when a later heat is ${started}`, () => {
				const b = build(source, [started]);
				const result = run(b, reopen(source));
				expect(!result.ok && result.error.code).toBe("DOWNSTREAM_STARTED");
				expect(!result.ok && result.error.details).toEqual({
					heatId: "h1",
					blockingHeatId: "d0",
				});
			});
		}

		test(`${source} heat is reopened and flags pending later heats`, () => {
			const b = build(source, ["pending"]);
			const next = okBracket(b, reopen(source));
			expect(next.rounds[1]?.heats[0]?.needsReview).toBe(true);
		});
	}

	test("a later heat without any rider of the heat does not block", () => {
		const b = bracket(
			[
				round("r1", [heat("h1", [{ id: "a", rank: 1 }], { status: "judged" })]),
				round("r2", [heat("other", ["z"], { status: "running" })]),
			],
			{ status: "running" },
		);
		expect(errorCode(b, reopen("judged"))).toBe("ok");
	});

	test("a started heat of an earlier round or the same round does not block", () => {
		const b = bracket(
			[
				round("r1", [
					heat("h0", ["a"], { status: "running" }),
					heat("h1", [{ id: "a", rank: 1 }], { status: "judged" }),
				]),
			],
			{ status: "running" },
		);
		expect(errorCode(b, reopen("judged"))).toBe("ok");
	});

	test("the first blocking heat is reported, in round order", () => {
		const b = bracket(
			[
				round("r1", [heat("h1", [{ id: "a", rank: 1 }], { status: "judged" })]),
				round("r2", [
					heat("p", ["a"], { status: "pending" }),
					heat("late", ["x"], { status: "pending" }),
				]),
				round("r3", [heat("final", ["a"], { status: "running" })]),
			],
			{ status: "running" },
		);
		const result = run(b, reopen("judged"));
		expect(!result.ok && result.error.details?.blockingHeatId).toBe("final");
	});

	test("every later heat is flagged when all of them are pending", () => {
		const b = build("judged", ["pending", "pending"]);
		const next = okBracket(b, reopen("judged"));
		expect(next.rounds[1]?.heats.map((h) => h.needsReview)).toEqual([
			true,
			true,
		]);
	});

	test("going forward is never blocked by started heats downstream", () => {
		const b = build("running", ["running"]);
		const withRanks = okBracket(b, { type: "rankByPosition", heatId: "h1" });
		expect(
			errorCode(withRanks, {
				type: "setHeatStatus",
				heatId: "h1",
				status: "judged",
			}),
		).toBe("ok");
	});
});

describe("clearReview", () => {
	test("removes the flag, shares the rest, and is a no-op otherwise", () => {
		const b = bracket([
			round("r1", [heat("h1")]),
			round("r2", [heat("h2", [], { needsReview: true })]),
		]);
		const next = okBracket(b, { type: "clearReview", heatId: "h2" });
		expect(next.rounds[1]?.heats[0]).not.toHaveProperty("needsReview");
		expect(next.rounds[0]).toBe(b.rounds[0]);
		const again = run(next, { type: "clearReview", heatId: "h2" });
		expect(again.ok && again.bracket).toBe(next);
		expect(errorCode(b, { type: "clearReview", heatId: "x" })).toBe(
			"UNKNOWN_HEAT",
		);
	});
});

describe("setHeatStatus startedAt", () => {
	const AT = "2026-03-01T10:00:00.000Z";
	const start = (b: Bracket, at?: string) =>
		okBracket(b, {
			type: "setHeatStatus",
			heatId: "h1",
			status: "running",
			...(at === undefined ? {} : { at }),
		});
	const heatH1 = (b: Bracket) => b.rounds[0]?.heats[0];

	test("stores the time given when the heat starts", () => {
		expect(heatH1(start(published(), AT))?.startedAt).toBe(AT);
	});

	test("stores nothing without a time", () => {
		expect(heatH1(start(published()))).not.toHaveProperty("startedAt");
	});

	test("cancelling the start clears it", () => {
		const back = to(start(published(), AT), "h1", "pending");
		expect(heatH1(back)).not.toHaveProperty("startedAt");
		expect(heatH1(back)?.status).toBe("pending");
	});

	test("judged and locked keep it", () => {
		let b = start(published(), AT);
		b = okBracket(b, { type: "rankByPosition", heatId: "h1" });
		b = to(b, "h1", "judged");
		expect(heatH1(b)?.startedAt).toBe(AT);
		b = to(b, "h1", "locked");
		expect(heatH1(b)?.startedAt).toBe(AT);
	});

	test("reopening keeps the original start and ignores a new time", () => {
		let b = start(published(), AT);
		b = okBracket(b, { type: "rankByPosition", heatId: "h1" });
		b = to(b, "h1", "judged");
		const reopened = okBracket(b, {
			type: "setHeatStatus",
			heatId: "h1",
			status: "running",
			at: "2026-03-01T11:00:00.000Z",
		});
		expect(heatH1(reopened)?.startedAt).toBe(AT);
	});

	test("refuses a time that is not an ISO date", () => {
		for (const at of ["", "yesterday", "2026-13-45T00:00:00Z", "2026-03-01"]) {
			expect(
				errorCode(published(), {
					type: "setHeatStatus",
					heatId: "h1",
					status: "running",
					at,
				}),
			).toBe("INVALID_ARGUMENT");
		}
	});

	test("accepts an offset time", () => {
		const b = start(published(), "2026-03-01T12:00:00+02:00");
		expect(heatH1(b)?.startedAt).toBe("2026-03-01T12:00:00+02:00");
	});
});
