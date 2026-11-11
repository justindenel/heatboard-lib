import { describe, expect, test } from "vitest";
import type { Bracket, Heat } from "../../model";
import { okBracket, sampleBracket, withRider } from "../../__tests__/fixtures";
import { schedule, settleChain } from "../chain";

const T0 = Date.parse("2026-03-01T10:00:00.000Z");
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();
const RACE = { heatDurationSec: 600, breakSec: 120 };

const heatOf = (b: Bracket, id: string) =>
	b.rounds.flatMap((r) => r.heats).find((h) => h.id === id) as Heat;

const published = (timing: Bracket["timing"] = RACE): Bracket =>
	okBracket(sampleBracket("published"), { type: "setRaceFormat", timing });

const startH1 = (b: Bracket = published()): Bracket =>
	okBracket(b, {
		type: "setHeatStatus",
		heatId: "h1",
		status: "running",
		at: at(0),
	});

describe("settleChain", () => {
	test("does nothing while the heat timer runs", () => {
		const b = startH1();
		expect(settleChain(b, at(5))).toBe(b);
	});

	test("stamps the end of the heat and starts the break when the timer runs out", () => {
		const settled = settleChain(startH1(), at(11));
		expect(heatOf(settled, "h1").endedAt).toBe(at(10));
		expect(settled.chain).toEqual({
			break: { startedAt: at(10), durationSec: 120 },
		});
		expect(heatOf(settled, "h2").status).toBe("pending");
	});

	test("starts the next heat when the break is over, stamped at the planned time", () => {
		const settled = settleChain(startH1(), at(13));
		expect(heatOf(settled, "h2")).toMatchObject({
			status: "running",
			startedAt: at(12),
			timing: RACE,
		});
		expect(settled.chain).toBeUndefined();
	});

	test("the next heat takes the format in force at its start, the break keeps its duration", () => {
		const midBreak = settleChain(startH1(), at(11));
		const changed = okBracket(midBreak, {
			type: "setRaceFormat",
			timing: { heatDurationSec: 300, breakSec: 60 },
		});
		const settled = settleChain(changed, at(12));
		expect(heatOf(settled, "h2")).toMatchObject({
			startedAt: at(12),
			timing: { heatDurationSec: 300, breakSec: 60 },
		});
	});

	test("a late settle chains every heat that happened meanwhile", () => {
		const b = withRider(startH1(), "h3");
		const settled = settleChain(b, at(30));
		expect(heatOf(settled, "h2")).toMatchObject({
			startedAt: at(12),
			endedAt: at(22),
		});
		expect(heatOf(settled, "h3")).toMatchObject({
			status: "running",
			startedAt: at(24),
		});
		expect(settleChain(settled, at(30))).toBe(settled);
	});

	test("a next heat without riders makes the chain wait, then a whole new break starts once they are known", () => {
		const waiting = settleChain(startH1(), at(30));
		expect(heatOf(waiting, "h3").status).toBe("pending");
		expect(waiting.chain).toEqual({ waiting: true });
		expect(settleChain(waiting, at(31))).toBe(waiting);

		const placed = withRider(waiting, "h3");
		const breaking = settleChain(placed, at(40));
		expect(breaking.chain).toEqual({
			break: { startedAt: at(40), durationSec: 120 },
		});
		const started = settleChain(breaking, at(42));
		expect(heatOf(started, "h3")).toMatchObject({
			status: "running",
			startedAt: at(42),
		});
	});

	test("a heat without duration never chains", () => {
		const b = startH1(published({ breakSec: 120 }));
		expect(settleChain(b, at(999))).toBe(b);
	});

	test("a break of zero starts the next heat right at the end", () => {
		const settled = settleChain(
			startH1(published({ heatDurationSec: 600 })),
			at(10),
		);
		expect(heatOf(settled, "h2")).toMatchObject({
			status: "running",
			startedAt: at(10),
		});
	});

	test("never starts a heat of an optional round", () => {
		const base = withRider(published(), "h3");
		const b: Bracket = {
			...base,
			rounds: base.rounds.map((round) =>
				round.id === "r2" ? { ...round, optional: true as const } : round,
			),
		};
		const second = okBracket(b, {
			type: "setHeatStatus",
			heatId: "h2",
			status: "running",
			at: at(0),
		});
		const settled = settleChain(second, at(30));
		expect(heatOf(settled, "h3").status).toBe("pending");
	});

	test("stopping a timed heat by hand stops the chain", () => {
		const stopped = okBracket(startH1(), {
			type: "setHeatStatus",
			heatId: "h1",
			status: "pending",
		});
		expect(stopped.chain).toEqual({ pause: "paused" });
		expect(settleChain(stopped, at(60))).toBe(stopped);
	});
});

describe("pause and resume", () => {
	test("pausing during a heat lets it run to the end, then the chain stops", () => {
		const requested = okBracket(settleChain(startH1(), at(5)), {
			type: "pauseRace",
			at: at(5),
		});
		expect(requested.chain).toEqual({ pause: "requested" });
		expect(settleChain(requested, at(9))).toBe(requested);

		const paused = settleChain(requested, at(11));
		expect(heatOf(paused, "h1").endedAt).toBe(at(10));
		expect(paused.chain).toEqual({ pause: "paused" });
		const later = settleChain(paused, at(120));
		expect(later).toBe(paused);
		expect(heatOf(later, "h2").status).toBe("pending");
	});

	test("a second press cancels the request and the chain goes on", () => {
		const requested = okBracket(startH1(), { type: "pauseRace", at: at(5) });
		const cancelled = okBracket(requested, { type: "cancelPauseRequest" });
		expect(cancelled.chain).toBeUndefined();
		expect(heatOf(settleChain(cancelled, at(13)), "h2").startedAt).toBe(at(12));
	});

	test("cancelling when nothing was requested changes nothing", () => {
		const b = startH1();
		expect(okBracket(b, { type: "cancelPauseRequest" })).toBe(b);
	});

	test("pausing during the break drops the countdown", () => {
		const breaking = settleChain(startH1(), at(11));
		const paused = okBracket(breaking, { type: "pauseRace", at: at(11) });
		expect(paused.chain).toEqual({ pause: "paused" });
	});

	test("pressing pause twice changes nothing the second time", () => {
		const requested = okBracket(startH1(), { type: "pauseRace", at: at(5) });
		expect(okBracket(requested, { type: "pauseRace", at: at(6) })).toBe(
			requested,
		);
	});

	test("resuming starts with a whole break before the next heat", () => {
		const paused = settleChain(
			okBracket(startH1(), { type: "pauseRace", at: at(5) }),
			at(11),
		);
		const resumed = okBracket(paused, { type: "resumeRace", at: at(60) });
		expect(resumed.chain).toEqual({
			break: { startedAt: at(60), durationSec: 120 },
		});
		expect(heatOf(settleChain(resumed, at(61)), "h2").status).toBe("pending");
		expect(heatOf(settleChain(resumed, at(62)), "h2")).toMatchObject({
			status: "running",
			startedAt: at(62),
		});
	});

	test("resuming a race that is not paused changes nothing", () => {
		const b = startH1();
		expect(okBracket(b, { type: "resumeRace", at: at(5) })).toBe(b);
	});

	test("a reset clears the chain and the end stamps", () => {
		const paused = settleChain(
			okBracket(startH1(), { type: "pauseRace", at: at(5) }),
			at(11),
		);
		const cleared = okBracket(paused, { type: "reset", keepRounds: 0 });
		expect(cleared.chain).toBeUndefined();
		expect(heatOf(cleared, "h1").endedAt).toBeUndefined();
	});

	test("no heat is cancelled by a pause", () => {
		const paused = settleChain(
			okBracket(startH1(), { type: "pauseRace", at: at(5) }),
			at(30),
		);
		expect(heatOf(paused, "h1").status).toBe("running");
	});
});

describe("schedule", () => {
	test("idle before anything started", () => {
		expect(schedule(published(), at(0))).toEqual({
			phase: "idle",
			pauseRequested: false,
			delaySec: 0,
			next: { heatId: "h1", number: 1, ridersKnown: true },
		});
	});

	test("a running heat gives its remaining time and the exact next start", () => {
		expect(schedule(startH1(), at(4))).toEqual({
			phase: "heat",
			pauseRequested: false,
			heatId: "h1",
			number: 1,
			startedAt: at(0),
			endsAt: at(10),
			remainingSec: 360,
			next: { heatId: "h2", number: 2, ridersKnown: true, startsAt: at(12) },
			delaySec: 0,
		});
	});

	test("the exact time is kept to the second", () => {
		const b = okBracket(published(), {
			type: "setHeatStatus",
			heatId: "h1",
			status: "running",
			at: "2026-03-01T10:00:07.000Z",
		});
		expect(schedule(b, at(1)).next?.startsAt).toBe("2026-03-01T10:12:07.000Z");
	});

	test("a pause request leaves no estimate", () => {
		const b = okBracket(startH1(), { type: "pauseRace", at: at(4) });
		const result = schedule(b, at(4));
		expect(result).toMatchObject({ phase: "heat", pauseRequested: true });
		expect(result.next).toEqual({ heatId: "h2", number: 2, ridersKnown: true });
	});

	test("the break gives its countdown and the next start", () => {
		expect(schedule(startH1(), at(11))).toMatchObject({
			phase: "break",
			startedAt: at(10),
			endsAt: at(12),
			remainingSec: 60,
			next: { number: 2, startsAt: at(12) },
			delaySec: 0,
		});
	});

	test("while paused the delay grows and there is no start time", () => {
		const paused = settleChain(
			okBracket(startH1(), { type: "pauseRace", at: at(5) }),
			at(11),
		);
		const result = schedule(paused, at(30));
		expect(result.phase).toBe("paused");
		expect(result.next).toEqual({ heatId: "h2", number: 2, ridersKnown: true });
		expect(result.delaySec).toBe(18 * 60);
	});

	test("after a resume the estimates start from the resume time", () => {
		const paused = settleChain(
			okBracket(startH1(), { type: "pauseRace", at: at(5) }),
			at(11),
		);
		const resumed = okBracket(paused, { type: "resumeRace", at: at(60) });
		const result = schedule(resumed, at(60));
		expect(result.phase).toBe("break");
		expect(result.next?.startsAt).toBe(at(62));
		expect(result.delaySec).toBe(50 * 60);
	});

	test("waiting for the riders of the next heat", () => {
		const result = schedule(startH1(), at(30));
		expect(result.phase).toBe("waiting");
		expect(result.next).toEqual({
			heatId: "h3",
			number: 3,
			ridersKnown: false,
		});
		expect(result.delaySec).toBe(6 * 60);
	});
});
