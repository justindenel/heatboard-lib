import { describe, expect, test } from "vitest";
import type { Bracket } from "../../model";
import {
	bracket,
	errorCode,
	heat,
	link,
	okBracket,
	round,
	run,
	sampleBracket,
	withRider,
} from "../../__tests__/fixtures";

const to = (
	b: Bracket,
	heatId: string,
	status: "running" | "judged" | "locked" | "pending",
) => okBracket(b, { type: "setHeatStatus", heatId, status });

const ridersOf = (b: Bracket, heatId: string): string[] =>
	b.rounds
		.flatMap((r) => r.heats)
		.find((h) => h.id === heatId)
		?.slots.map((s) => s.riderId) ?? [];

/** h1 and h2 running and ranked, ready to be judged. */
const rankedSample = (): Bracket => {
	let b = to(to(sampleBracket("published"), "h1", "running"), "h2", "running");
	b = okBracket(b, {
		type: "setRanks",
		heatId: "h1",
		riderIds: ["c", "a", "b", "d"],
	});
	return okBracket(b, {
		type: "setRanks",
		heatId: "h2",
		riderIds: ["e", "f", "g", "h"],
	});
};

describe("judging a heat places its qualifiers", () => {
	test("moves the ranked riders to the linked heats, ignoring eliminated links", () => {
		const b = rankedSample();
		const next = to(b, "h1", "judged");
		expect(next.rounds[1]?.heats[0]?.slots).toEqual([
			{ riderId: "c", rank: null },
			{ riderId: "a", rank: null },
		]);
		expect(next.rounds[0]?.heats[1]).toBe(b.rounds[0]?.heats[1]);
		expect(next.rounds[2]).toBe(b.rounds[2]);
	});

	test("each heat adds its own qualifiers as it is judged", () => {
		const both = to(to(rankedSample(), "h1", "judged"), "h2", "judged");
		expect(ridersOf(both, "h3")).toEqual(["c", "a", "e", "f"]);
	});

	test("promotes by post-status rank, so a rider with a status is skipped", () => {
		let b = to(sampleBracket("published"), "h1", "running");
		b = okBracket(b, {
			type: "setStatus",
			heatId: "h1",
			riderId: "c",
			status: "DSQ",
		});
		b = okBracket(b, { type: "rankByPosition", heatId: "h1" });
		expect(ridersOf(to(b, "h1", "judged"), "h3")).toEqual(["a", "b"]);
	});

	test("leaves a heat without links alone", () => {
		let b = to(withRider(sampleBracket("published"), "h4"), "h4", "running");
		b = okBracket(b, { type: "rankByPosition", heatId: "h4" });
		const next = to(b, "h4", "judged");
		expect(next.rounds.map((r) => r.heats.length)).toEqual([2, 1, 1]);
		expect(ridersOf(next, "h4")).toEqual(["seed"]);
	});

	test("a rider already in the target heat is not added twice", () => {
		let b = okBracket(rankedSample(), {
			type: "place",
			riderId: "c",
			heatId: "h3",
		});
		b = to(b, "h1", "judged");
		expect(ridersOf(b, "h3")).toEqual(["c", "a"]);
	});

	test("locking a judged heat changes nothing more", () => {
		const judged = to(rankedSample(), "h1", "judged");
		expect(to(judged, "h1", "locked").rounds[1]).toBe(judged.rounds[1]);
	});
});

describe("judging refused because of a target heat", () => {
	const twoRounds = (target = heat("h2")) =>
		bracket(
			[
				round("r1", [
					heat(
						"h1",
						[
							{ id: "a", rank: 1 },
							{ id: "b", rank: 2 },
						],
						{ status: "running" },
					),
				]),
				round("r2", [target, heat("h3")], { maxPerHeat: 1 }),
			],
			{
				status: "running",
				links: [link("h1", 1, "h2"), link("h1", 2, "h3")],
			},
		);
	const judge = (b: Bracket) =>
		run(b, { type: "setHeatStatus", heatId: "h1", status: "judged" });

	test("all or nothing: a started target keeps the heat running", () => {
		const blocked = twoRounds(heat("h2"));
		blocked.rounds[1] = {
			...blocked.rounds[1]!,
			heats: [heat("h2"), heat("h3", [], { status: "running" })],
		};
		const result = judge(blocked);
		expect(!result.ok && result.error.code).toBe("HEAT_STARTED");
	});

	test("a locked target, a full target", () => {
		expect(
			errorCode(twoRounds(heat("h2", [], { status: "locked" })), {
				type: "setHeatStatus",
				heatId: "h1",
				status: "judged",
			}),
		).toBe("HEAT_LOCKED");
		const full = twoRounds(heat("h2", ["z"]));
		const result = judge(full);
		expect(!result.ok && result.error.code).toBe("HEAT_FULL");
	});

	test("a rider already in another heat of the target round is skipped, the other links still apply", () => {
		const duplicate = twoRounds(heat("h2"));
		duplicate.rounds[1] = {
			...duplicate.rounds[1]!,
			heats: [heat("h2"), heat("h3", ["a"])],
		};
		duplicate.links = [link("h1", 1, "h2"), link("h1", 2, "h2")];
		const result = judge(duplicate);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const [h2, h3] = result.bracket.rounds[1]!.heats;
		expect(h2!.slots.map((s) => s.riderId)).toEqual(["b"]);
		expect(h3!.slots.map((s) => s.riderId)).toEqual(["a"]);
	});

	test("a rider who enters later, an unknown target, a backward link", () => {
		const early = bracket(
			[
				round("r1", [
					heat("h1", [{ id: "a", rank: 1 }], { status: "running" }),
				]),
				round("r2", [heat("h2")]),
				round("r3", [heat("h3")]),
			],
			{
				entries: [{ riderId: "a", displayName: "a", entryRoundId: "r3" }],
				links: [link("h1", 1, "h2")],
			},
		);
		expect(
			errorCode(early, {
				type: "setHeatStatus",
				heatId: "h1",
				status: "judged",
			}),
		).toBe("BEFORE_ENTRY_ROUND");
		const unknown = bracket(
			[
				round("r1", [
					heat("h1", [{ id: "a", rank: 1 }], { status: "running" }),
				]),
			],
			{ links: [link("h1", 1, "nowhere")] },
		);
		expect(
			errorCode(unknown, {
				type: "setHeatStatus",
				heatId: "h1",
				status: "judged",
			}),
		).toBe("UNKNOWN_HEAT");
		const back = bracket(
			[
				round("r1", [heat("h0")]),
				round("r2", [
					heat("h1", [{ id: "a", rank: 1 }], { status: "running" }),
				]),
			],
			{ links: [link("h1", 1, "h0")] },
		);
		expect(
			errorCode(back, {
				type: "setHeatStatus",
				heatId: "h1",
				status: "judged",
			}),
		).toBe("INVALID_LINK");
	});
});

describe("reopening a judged heat", () => {
	const judgedSample = () =>
		to(to(rankedSample(), "h1", "judged"), "h2", "judged");

	test("takes its riders back out of the target heats, leaving the other heat's", () => {
		const reopened = to(judgedSample(), "h1", "running");
		expect(ridersOf(reopened, "h3")).toEqual(["e", "f"]);
		expect(reopened.rounds[1]?.heats[0]).not.toHaveProperty("needsReview");
	});

	test("judging again with another order places the new qualifiers", () => {
		let b = to(judgedSample(), "h1", "running");
		b = okBracket(b, {
			type: "setRanks",
			heatId: "h1",
			riderIds: ["d", "b", "a", "c"],
		});
		b = to(b, "h1", "judged");
		expect(ridersOf(b, "h3").sort()).toEqual(["b", "d", "e", "f"]);
	});

	test("is refused with DOWNSTREAM_STARTED once a target heat has started", () => {
		const started = to(judgedSample(), "h3", "running");
		const result = run(started, {
			type: "setHeatStatus",
			heatId: "h1",
			status: "running",
		});
		expect(!result.ok && result.error).toMatchObject({
			code: "DOWNSTREAM_STARTED",
			details: { heatId: "h1", blockingHeatId: "h3" },
		});
	});

	test("a locked heat can be unlocked without touching the target heats", () => {
		const locked = to(judgedSample(), "h1", "locked");
		const unlocked = to(locked, "h1", "judged");
		expect(ridersOf(unlocked, "h3")).toEqual(["c", "a", "e", "f"]);
	});

	test("a rider placed by hand in a later heat is flagged for review, not removed", () => {
		let b = okBracket(judgedSample(), {
			type: "place",
			riderId: "d",
			heatId: "h4",
		});
		b = to(b, "h1", "running");
		expect(ridersOf(b, "h4")).toEqual(["d"]);
		expect(b.rounds[2]?.heats[0]?.needsReview).toBe(true);
	});
});
