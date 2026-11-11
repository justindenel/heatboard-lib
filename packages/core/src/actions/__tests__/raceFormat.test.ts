import { describe, expect, test } from "vitest";
import type { Bracket, Heat } from "../../model";
import { heatClock, raceFormatDrift, raceFormatOf } from "../../queries";
import { config, halfStepScale } from "../../scoring/__tests__/helpers";
import {
	advanceHeat,
	errorCode,
	okBracket,
	sampleBracket,
} from "../../__tests__/fixtures";

const best = config({
	scale: halfStepScale,
	categories: [{ type: "wave", counted: 1 }],
});
const sum = config({
	scale: halfStepScale,
	categories: [{ type: "wave", counted: 2 }],
});

const FIRST = { heatDurationSec: 600, breakSec: 60 };
const SECOND = { heatDurationSec: 300 };
const START = "2026-03-01T10:00:00.000Z";
const NOW = "2026-03-01T10:01:00.000Z";

const published = (): Bracket =>
	okBracket(
		{ ...sampleBracket("published"), scoring: best },
		{ type: "setRaceFormat", timing: FIRST },
	);
const start = (b: Bracket, heatId: string) =>
	okBracket(b, {
		type: "setHeatStatus",
		heatId,
		status: "running",
		at: START,
	});
const change = (b: Bracket) =>
	okBracket(b, {
		type: "setRaceFormat",
		timing: SECOND,
		scoring: sum,
		judgingMode: "headJudge",
	});
const heatOf = (b: Bracket, id: string) =>
	b.rounds.flatMap((r) => r.heats).find((h) => h.id === id) as Heat;

describe("race format snapshot", () => {
	test("starting a heat snapshots race, scoring and judging mode", () => {
		const b = start(published(), "h1");
		expect(heatOf(b, "h1")).toMatchObject({
			timing: FIRST,
			scoring: best,
			judgingMode: "free",
		});
		expect(heatOf(b, "h2").timing).toBeUndefined();
		expect(heatOf(b, "h2").judgingMode).toBeUndefined();
	});

	test("a change during a running heat touches neither its clock, scoring nor judging mode", () => {
		const running = start(published(), "h1");
		const changed = change(running);
		expect(changed.timing).toEqual(SECOND);
		expect(heatOf(changed, "h1")).toEqual(heatOf(running, "h1"));
		expect(heatClock(changed, "h1", NOW)).toEqual({
			startedAt: START,
			durationSec: 600,
			elapsedSec: 60,
			remainingSec: 540,
		});
		expect(raceFormatOf(changed, heatOf(changed, "h1"))).toEqual({
			timing: FIRST,
			scoring: best,
			judgingMode: "free",
		});
	});

	test("the next heat takes the new format", () => {
		const b = start(change(start(published(), "h1")), "h2");
		expect(heatOf(b, "h2")).toMatchObject({
			timing: SECOND,
			scoring: sum,
			judgingMode: "headJudge",
		});
		expect(heatOf(b, "h1").timing).toEqual(FIRST);
	});

	test("a heat stopped then restarted takes the format in force at the restart", () => {
		let b = start(published(), "h1");
		b = okBracket(b, {
			type: "setHeatStatus",
			heatId: "h1",
			status: "pending",
		});
		expect(heatOf(b, "h1").timing).toBeUndefined();
		expect(heatOf(b, "h1").judgingMode).toBeUndefined();
		b = start(change(b), "h1");
		expect(heatOf(b, "h1")).toMatchObject({
			timing: SECOND,
			scoring: sum,
			judgingMode: "headJudge",
		});
	});

	test("reopening a judged heat keeps its snapshot", () => {
		let b = advanceHeat(published(), "h1", "judged");
		const judged = heatOf(b, "h1");
		b = change(b);
		expect(heatOf(b, "h1")).toEqual(judged);
		b = okBracket(b, {
			type: "setHeatStatus",
			heatId: "h1",
			status: "running",
		});
		expect(heatOf(b, "h1")).toMatchObject({
			timing: FIRST,
			scoring: best,
			judgingMode: "free",
		});
	});

	test("a heat ranked without a snapshot gets the format in force at ranking", () => {
		let b = start(published(), "h1");
		b = okBracket(b, { type: "rankByPosition", heatId: "h1" });
		const legacy = { ...heatOf(b, "h1") };
		delete legacy.timing;
		delete legacy.judgingMode;
		delete legacy.scoring;
		b = {
			...b,
			timing: SECOND,
			judgingMode: "headJudge",
			rounds: b.rounds.map((r) => ({
				...r,
				heats: r.heats.map((h) => (h.id === "h1" ? legacy : h)),
			})),
		};
		b = okBracket(b, { type: "setHeatStatus", heatId: "h1", status: "judged" });
		expect(heatOf(b, "h1")).toMatchObject({
			timing: SECOND,
			judgingMode: "headJudge",
			scoring: best,
		});
	});

	test("reset clears the snapshots", () => {
		const b = okBracket(start(published(), "h1"), {
			type: "reset",
			keepRounds: 0,
			confirm: true,
		});
		expect(heatOf(b, "h1").timing).toBeUndefined();
		expect(heatOf(b, "h1").judgingMode).toBeUndefined();
	});
});

describe("setRaceFormat", () => {
	test("is never refused by heats that are running, judged or locked", () => {
		let b = start(published(), "h1");
		expect(errorCode(b, { type: "setRaceFormat", timing: SECOND })).toBe("ok");
		b = advanceHeat(published(), "h1", "judged");
		expect(
			errorCode(b, { type: "setRaceFormat", judgingMode: "headJudge" }),
		).toBe("ok");
		b = advanceHeat(published(), "h1", "locked");
		expect(
			errorCode(b, { type: "setRaceFormat", timing: SECOND, scoring: sum }),
		).toBe("ok");
		expect(errorCode(b, { type: "setRaceFormat", scoring: null })).toBe("ok");
	});

	test("a same value is a no-op and an empty race clears it", () => {
		const b = published();
		expect(okBracket(b, { type: "setRaceFormat", timing: FIRST })).toBe(b);
		const cleared = okBracket(b, { type: "setRaceFormat", timing: {} });
		expect("timing" in cleared).toBe(false);
	});

	test("refuses invalid timings", () => {
		for (const timing of [
			{ heatDurationSec: 0 },
			{ heatDurationSec: 1.5 },
			{ breakSec: -1 },
		]) {
			expect(errorCode(published(), { type: "setRaceFormat", timing })).toBe(
				"INVALID_ARGUMENT",
			);
		}
	});
});

describe("raceFormatDrift", () => {
	test("is absent for heats that have not started and for a heat in line with the others", () => {
		const b = start(published(), "h1");
		expect(raceFormatDrift(b, "h2")).toBeUndefined();
		expect(raceFormatDrift(b, "h1")).toBeUndefined();
	});

	test("a heat that ran with another format than the one in force is marked current", () => {
		const b = change(start(published(), "h1"));
		expect(raceFormatDrift(b, "h1")).toBe("current");
	});

	test("a heat that differs from the previous started heat is marked previous", () => {
		const b = start(change(start(published(), "h1")), "h2");
		expect(raceFormatDrift(b, "h2")).toBe("previous");
		expect(raceFormatDrift(b, "h1")).toBe("current");
	});

	test("a heat whose snapshot lacks a duration, as a simulated one, is not marked for it", () => {
		const b = okBracket(
			{ ...sampleBracket("published"), scoring: best },
			{ type: "setRaceFormat", timing: FIRST },
		);
		const simulated = {
			...b,
			rounds: b.rounds.map((r) => ({
				...r,
				heats: r.heats.map((h, i) =>
					i === 0
						? { ...h, timing: {}, scoring: best, judgingMode: "free" as const }
						: h,
				),
			})),
		};
		expect(raceFormatDrift(simulated, "h1")).toBeUndefined();
	});
});
