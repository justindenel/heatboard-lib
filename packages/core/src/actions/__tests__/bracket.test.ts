import { describe, expect, test } from "vitest";
import type { Action } from "..";
import type { Bracket, BracketStatus } from "../../model";
import { config } from "../../scoring/__tests__/helpers";
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

const allJudged = (b: Bracket): Bracket => ({
	...b,
	rounds: b.rounds.map((r) => ({
		...r,
		heats: r.heats.map((h) => ({ ...h, status: "judged" as const })),
	})),
});

/** A finished or validated bracket has nothing left to play. */
const withStatus = (status: BracketStatus): Bracket => {
	const b: Bracket = { ...sampleBracket(), status };
	return status === "finished" || status === "validated" ? allJudged(b) : b;
};

const setStatus = (status: BracketStatus): Action => ({
	type: "setBracketStatus",
	status,
});

describe("setBracketStatus", () => {
	test("allowed transitions", () => {
		const steps: [BracketStatus, BracketStatus][] = [
			["draft", "published"],
			["published", "draft"],
			["published", "running"],
			["finished", "validated"],
			["validated", "finished"],
		];
		for (const [from, to] of steps) {
			const b = withStatus(from);
			const next = okBracket(b, setStatus(to));
			expect(next.status).toBe(to);
			expect(next.rounds).toBe(b.rounds);
		}
	});

	test("forbidden transitions", () => {
		const steps: [BracketStatus, BracketStatus][] = [
			["draft", "running"],
			["draft", "finished"],
			["draft", "validated"],
			["published", "finished"],
			["published", "validated"],
			["running", "finished"],
			["finished", "running"],
			["running", "draft"],
			["running", "published"],
			["running", "validated"],
			["finished", "draft"],
			["finished", "published"],
		];
		for (const [from, to] of steps) {
			expect(errorCode(withStatus(from), setStatus(to))).toBe(
				"INVALID_STATUS_TRANSITION",
			);
		}
	});

	test("same status is a no-op", () => {
		for (const status of [
			"draft",
			"published",
			"running",
			"finished",
		] as const) {
			const b = withStatus(status);
			const result = run(b, setStatus(status));
			expect(result.ok && result.bracket).toBe(b);
		}
	});
});

describe("setHeatStatus and the bracket status", () => {
	const toRunning: Action = {
		type: "setHeatStatus",
		heatId: "h1",
		status: "running",
	};

	test("refuses to start a heat while the bracket is a draft", () => {
		expect(errorCode(sampleBracket(), toRunning)).toBe("BRACKET_NOT_PUBLISHED");
	});

	test("starting a heat of a published bracket makes it running", () => {
		const b = withStatus("published");
		const next = okBracket(b, toRunning);
		expect(next.status).toBe("running");
		expect(next.rounds[0]?.heats[0]?.status).toBe("running");
		expect(next.rounds[1]).toBe(b.rounds[1]);
		expect(next.rounds[0]?.heats[1]).toBe(b.rounds[0]?.heats[1]);
	});

	test("a running bracket is left alone", () => {
		expect(okBracket(withStatus("running"), toRunning).status).toBe("running");
	});

	test("starting a heat of a finished bracket reopens it", () => {
		const b = withStatus("finished");
		const next = okBracket(b, toRunning);
		expect(next.status).toBe("running");
		expect(next.rounds[0]?.heats[0]?.status).toBe("running");
		expect(next.rounds[1]).toBe(b.rounds[1]);
	});

	test("heat transitions other than starting do not touch the status", () => {
		const b = advanceHeat(withStatus("published"), "h1", "judged");
		expect(b.status).toBe("running");
		const draft = withStatus("draft");
		const same = run(draft, {
			type: "setHeatStatus",
			heatId: "h1",
			status: "pending",
		});
		expect(same.ok && same.bracket).toBe(draft);
	});
});

describe("setVisibility and renames", () => {
	test("setVisibility", () => {
		const b = sampleBracket();
		const next = okBracket(b, { type: "setVisibility", visibility: "public" });
		expect(next.visibility).toBe("public");
		expect(next.rounds).toBe(b.rounds);
		const same = run(b, { type: "setVisibility", visibility: "private" });
		expect(same.ok && same.bracket).toBe(b);
	});

	test("renameBracket", () => {
		const b = sampleBracket();
		const next = okBracket(b, { type: "renameBracket", name: "Final" });
		expect(next.name).toBe("Final");
		expect(next.rounds).toBe(b.rounds);
		const same = run(b, { type: "renameBracket", name: b.name });
		expect(same.ok && same.bracket).toBe(b);
	});

	test("renameRound", () => {
		const b = sampleBracket();
		const next = okBracket(b, {
			type: "renameRound",
			roundId: "r2",
			name: "Semis",
		});
		expect(next.rounds[1]?.name).toBe("Semis");
		expect(next.rounds[1]?.heats).toBe(b.rounds[1]?.heats);
		expect(next.rounds[0]).toBe(b.rounds[0]);
		const same = run(b, { type: "renameRound", roundId: "r2", name: "r2" });
		expect(same.ok && same.bracket).toBe(b);
		expect(errorCode(b, { type: "renameRound", roundId: "x", name: "n" })).toBe(
			"UNKNOWN_ROUND",
		);
	});

	test("renameHeat sets, changes and removes the name", () => {
		const b = sampleBracket();
		const named = okBracket(b, {
			type: "renameHeat",
			heatId: "h1",
			name: "Heat A",
		});
		expect(named.rounds[0]?.heats[0]?.name).toBe("Heat A");
		expect(named.rounds[0]?.heats[1]).toBe(b.rounds[0]?.heats[1]);
		expect(named.rounds[1]).toBe(b.rounds[1]);
		const cleared = okBracket(named, { type: "renameHeat", heatId: "h1" });
		expect(cleared.rounds[0]?.heats[0]).not.toHaveProperty("name");
		const same = run(b, { type: "renameHeat", heatId: "h1" });
		expect(same.ok && same.bracket).toBe(b);
		expect(errorCode(b, { type: "renameHeat", heatId: "x", name: "n" })).toBe(
			"UNKNOWN_HEAT",
		);
	});
});

describe("validated bracket", () => {
	const validated = () => withStatus("validated");

	test("only visibility, renames and the way back to finished are allowed", () => {
		const b = validated();
		const allowed: Action[] = [
			{ type: "setVisibility", visibility: "public" },
			{ type: "renameBracket", name: "n" },
			{ type: "renameRound", roundId: "r1", name: "n" },
			{ type: "renameHeat", heatId: "h1", name: "n" },
			setStatus("finished"),
		];
		for (const action of allowed) expect(errorCode(b, action)).toBe("ok");
	});

	test("validating an already validated bracket is a no-op", () => {
		const b = validated();
		const result = run(b, setStatus("validated"));
		expect(result.ok && result.bracket).toBe(b);
	});

	test("every other action is refused", () => {
		const b = validated();
		const refused: Action[] = [
			{ type: "place", riderId: "seed", heatId: "h3" },
			{
				type: "move",
				riderId: "a",
				fromHeatId: "h1",
				toHeatId: "h1",
				index: 1,
			},
			{ type: "remove", riderId: "a", heatId: "h1" },
			{ type: "setRanks", heatId: "h1", riderIds: ["a", "b", "c", "d"] },
			{ type: "rankByPosition", heatId: "h1" },
			{ type: "clearRanks", heatId: "h1" },
			{ type: "setStatus", heatId: "h1", riderId: "a", status: "DNF" },
			{ type: "setHeatStatus", heatId: "h1", status: "running" },
			{ type: "clearReview", heatId: "h1" },
			{ type: "setMaxPerHeat", roundId: "r1", max: 5 },
			{ type: "reset" },
			setStatus("running"),
			{ type: "addEntry", entry: { riderId: "z", displayName: "z" } },
			{
				type: "addEntries",
				entries: [{ riderId: "z", displayName: "z" }],
			},
			{ type: "updateEntry", riderId: "a", displayName: "A" },
			{ type: "removeEntry", riderId: "a" },
			{
				type: "addRound",
				round: { id: "r9", name: "n", group: "g", maxPerHeat: 4, advancing: 2 },
			},
			{ type: "updateRound", roundId: "r1", advancing: 3, confirm: true },
			{ type: "removeRound", roundId: "r3" },
			{ type: "addHeat", roundId: "r1", heat: { id: "h9" } },
			{ type: "removeHeat", heatId: "h4" },
			{ type: "setLinks", links: [], confirm: true },
			{ type: "setRaceFormat", scoring: config() },
		];
		for (const action of refused) {
			expect(errorCode(b, action), action.type).toBe("BRACKET_VALIDATED");
		}
	});
});

describe("finished follows the heats", () => {
	const playAllButLast = (): Bracket => {
		let b = sampleBracket("published");
		for (const heatId of ["h1", "h2", "h3"])
			b = advanceHeat(b, heatId, "judged");
		return b;
	};
	const reopen = (b: Bracket, heatId: string) =>
		okBracket(b, { type: "setHeatStatus", heatId, status: "running" });

	test("judging the last required heat finishes the bracket", () => {
		const before = playAllButLast();
		expect(before.status).toBe("running");
		const after = advanceHeat(before, "h4", "judged");
		expect(after.status).toBe("finished");
	});

	test("locking the last heat keeps it finished, reopening any heat brings it back to running", () => {
		const finished = advanceHeat(playAllButLast(), "h4", "locked");
		expect(finished.status).toBe("finished");
		const unlocked = okBracket(finished, {
			type: "setHeatStatus",
			heatId: "h4",
			status: "judged",
		});
		expect(unlocked.status).toBe("finished");
		const reopened = reopen(unlocked, "h4");
		expect(reopened.status).toBe("running");
		expect(advanceHeat(reopened, "h4", "judged").status).toBe("finished");
	});

	test("an optional round is not required", () => {
		const b = bracket(
			[
				round("r1", [heat("a", ["x", "y"])]),
				round("small", [heat("o")], { optional: true }),
			],
			{ status: "published" },
		);
		expect(advanceHeat(b, "a", "judged").status).toBe("finished");
	});

	test("a bracket without any required heat does not finish", () => {
		const emptyRounds = okBracket(bracket([], { status: "published" }), {
			type: "setBracketStatus",
			status: "running",
		});
		expect(emptyRounds.status).toBe("running");
	});

	test("a reset gives a finished bracket back to running", () => {
		const finished = advanceHeat(playAllButLast(), "h4", "judged");
		const next = okBracket(finished, {
			type: "reset",
			keepRounds: 1,
			confirm: true,
		});
		expect(next.status).toBe("running");
	});

	test("validating freezes a finished bracket and unvalidating gives it back finished", () => {
		const finished = advanceHeat(playAllButLast(), "h4", "judged");
		const frozen = okBracket(finished, setStatus("validated"));
		expect(frozen.status).toBe("validated");
		expect(okBracket(frozen, setStatus("finished")).status).toBe("finished");
	});

	test("the manual change is refused with an automatic reason", () => {
		const result = run(playAllButLast(), setStatus("finished"));
		expect(!result.ok && result.error).toMatchObject({
			code: "INVALID_STATUS_TRANSITION",
			details: { reason: "AUTOMATIC" },
		});
		const back = run(withStatus("finished"), setStatus("running"));
		expect(!back.ok && back.error.details).toMatchObject({
			reason: "AUTOMATIC",
		});
	});
});
