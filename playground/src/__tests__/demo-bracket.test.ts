import {
	canSimulateRound,
	computeHeatResult,
	generateNotes,
	simulateRound,
	validateBracket,
} from "@heatboard/core";
import { describe, expect, it } from "vitest";
import {
	RUNNING_HEAT_ID,
	demoRiders,
	makeBracket,
	makeNewBracket,
	makeRepechageBracket,
	makeRunningBracket,
	runningBracket,
} from "../demo-bracket";

describe("demo bracket", () => {
	it("passes core validation", () => {
		expect(validateBracket(runningBracket)).toEqual([]);
	});

	it("has a running heat that started and can be scored", () => {
		const bracket = makeRunningBracket();
		const heat = bracket.rounds
			.flatMap((r) => r.heats)
			.find((h) => h.id === RUNNING_HEAT_ID);
		expect(heat?.status).toBe("running");
		expect(heat?.startedAt).toBeDefined();
		expect(bracket.scoring).toBeDefined();
		expect(validateBracket(bracket)).toEqual([]);
	});

	it("uses head-judge mode with ride means by default, free mode with points otherwise", () => {
		expect(runningBracket.judgingMode).toBe("headJudge");
		expect(runningBracket.scoring?.method).toBe("rideMeans");
		const free = makeRunningBracket(Date.now(), "free");
		expect(free.judgingMode).toBeUndefined();
		expect(free.scoring?.method).toBe("points");
		expect(validateBracket(free)).toEqual([]);
	});

	it("generated notes produce totals for the running heat", () => {
		const bracket = makeRunningBracket(Date.now(), "free");
		const { scoring } = bracket;
		const heat = bracket.rounds
			.flatMap((r) => r.heats)
			.find((h) => h.id === RUNNING_HEAT_ID);
		if (!scoring || !heat?.startedAt) throw new Error("demo not scored");
		const riderIds = heat.slots.map((s) => s.riderId);
		const notes = generateNotes({
			scoring,
			riderIds,
			judgeIds: ["judge1", "judge2", "judge3"],
			seed: 42,
			startAt: heat.startedAt,
		});
		const rides = Object.values(notes).flatMap((n) => n.rides);
		const scores = Object.values(notes).flatMap((n) => n.scores);
		const result = computeHeatResult(scoring, riderIds, rides, scores);
		expect(result.issues).toEqual([]);
		expect(result.riders).toHaveLength(riderIds.length);
		expect(result.riders.every((r) => r.total > 0)).toBe(true);
	});

	it("has a rider record for every entry", () => {
		for (const entry of runningBracket.entries) {
			expect(demoRiders[entry.riderId]).toBeDefined();
		}
	});

	it("starts a new bracket with seeded riders and no round", () => {
		for (const mode of ["headJudge", "free"] as const) {
			const bracket = makeNewBracket(mode);
			expect(validateBracket(bracket)).toEqual([]);
			expect(bracket.rounds).toEqual([]);
			expect(bracket.entries.filter((e) => e.seed !== undefined)).toHaveLength(
				4,
			);
		}
	});

	it("builds the repechage scenario from a format plan", () => {
		const bracket = makeRepechageBracket();
		expect(validateBracket(bracket)).toEqual([]);
		expect(
			bracket.format?.settings.rounds.some((r) => r.key.startsWith("rep")),
		).toBe(true);
		expect(bracket.rounds.length).toBeGreaterThanOrEqual(3);
		expect(bracket.entries.filter((e) => e.seed !== undefined)).toHaveLength(4);
	});

	it("can simulate the first round of the repechage scenario", () => {
		const bracket = makeRepechageBracket();
		const first = bracket.rounds[0];
		if (!first) throw new Error("no round");
		expect(canSimulateRound(bracket, first.id)).toBe(true);
		const result = simulateRound(bracket, first.id, 1);
		expect(result.ok).toBe(true);
	});

	it("picks the bracket of a scenario", () => {
		expect(makeBracket("new", "free").rounds).toEqual([]);
		expect(makeBracket("running", "free").status).toBe("running");
		expect(makeBracket("repechage", "free").rounds.length).toBeGreaterThan(0);
	});
});
