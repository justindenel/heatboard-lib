import { describe, expect, test } from "vitest";
import {
	defaultOpenRoundId,
	findHeat,
	getQualified,
	getRiderPath,
	hasRunningHeat,
	heatClock,
	numberedHeats,
	pickLiveHeat,
	pickNextHeat,
	roundProgress,
	roundState,
} from "../queries";
import { bracket, heat, round } from "./fixtures";

const fixture = () =>
	bracket([
		round("r1", [
			heat("h1", [
				{ id: "a", rank: 2 },
				{ id: "b", rank: 1 },
				{ id: "c", rank: 3 },
				{ id: "d", status: "DNF" },
			]),
		]),
		round("r2", [heat("h2", [{ id: "b", rank: 1 }]), heat("h3", ["z"])]),
	]);

test("findHeat returns positions or undefined", () => {
	const b = fixture();
	const found = findHeat(b, "h3");
	expect(found?.roundIndex).toBe(1);
	expect(found?.heatIndex).toBe(1);
	expect(found?.heat).toBe(b.rounds[1]?.heats[1]);
	expect(found?.round).toBe(b.rounds[1]);
	expect(findHeat(b, "nope")).toBeUndefined();
});

test("getQualified keeps ranks within advancing, sorted, without statuses", () => {
	const b = fixture();
	expect(getQualified(b, "h1")).toEqual(["b", "a"]);
	expect(getQualified(b, "h3")).toEqual([]);
	expect(getQualified(b, "nope")).toEqual([]);
});

test("getRiderPath lists each slot in round order", () => {
	const b = fixture();
	expect(getRiderPath(b, "b")).toEqual([
		{ roundId: "r1", heatId: "h1", rank: 1 },
		{ roundId: "r2", heatId: "h2", rank: 1 },
	]);
	expect(getRiderPath(b, "d")).toEqual([
		{ roundId: "r1", heatId: "h1", rank: null, status: "DNF" },
	]);
	expect(getRiderPath(b, "nobody")).toEqual([]);
});

describe("heatClock", () => {
	const START = "2026-03-01T10:00:00.000Z";
	const clockBracket = (startedAt?: string, heatDurationSec?: number) => ({
		...bracket([
			round("r1", [
				heat("h1", ["a"], {
					status: startedAt ? "running" : "pending",
					...(startedAt ? { startedAt } : {}),
				}),
			]),
		]),
		...(heatDurationSec === undefined ? {} : { timing: { heatDurationSec } }),
	});
	const at = (seconds: number) =>
		new Date(Date.parse(START) + seconds * 1000).toISOString();

	test("elapsed and remaining from the start", () => {
		expect(heatClock(clockBracket(START, 600), "h1", at(90))).toEqual({
			startedAt: START,
			durationSec: 600,
			elapsedSec: 90,
			remainingSec: 510,
		});
	});

	test("floors partial seconds", () => {
		const now = new Date(Date.parse(START) + 90_999).toISOString();
		const clock = heatClock(clockBracket(START, 600), "h1", now);
		expect(clock.elapsedSec).toBe(90);
		expect(clock.remainingSec).toBe(510);
	});

	test("remaining stops at 0 once the duration is over", () => {
		expect(
			heatClock(clockBracket(START, 600), "h1", at(600)).remainingSec,
		).toBe(0);
		const late = heatClock(clockBracket(START, 600), "h1", at(5000));
		expect(late.remainingSec).toBe(0);
		expect(late.elapsedSec).toBe(5000);
	});

	test("a clock reading before the start does not go negative", () => {
		const clock = heatClock(clockBracket(START, 600), "h1", at(-30));
		expect(clock.elapsedSec).toBe(0);
		expect(clock.remainingSec).toBe(600);
	});

	test("no duration means no remaining time", () => {
		expect(heatClock(clockBracket(START), "h1", at(10))).toEqual({
			startedAt: START,
			elapsedSec: 10,
		});
	});

	test("a running heat reads the duration of its snapshot, not the bracket's", () => {
		const b = clockBracket(START, 600);
		const snapshot = bracket([
			round("r1", [
				heat("h1", ["a"], {
					status: "running",
					startedAt: START,
					timing: { heatDurationSec: 300 },
				}),
			]),
		]);
		expect(
			heatClock({ ...b, timing: { heatDurationSec: 900 } }, "h1", at(10)),
		).toEqual({
			startedAt: START,
			durationSec: 900,
			elapsedSec: 10,
			remainingSec: 890,
		});
		expect(
			heatClock({ ...snapshot, timing: { heatDurationSec: 900 } }, "h1", at(10))
				.durationSec,
		).toBe(300);
	});

	test("not started means no elapsed nor remaining time", () => {
		expect(heatClock(clockBracket(undefined, 600), "h1", at(10))).toEqual({
			durationSec: 600,
		});
		expect(heatClock(clockBracket(), "h1", at(10))).toEqual({});
	});

	test("unknown heat or unreadable now gives what is known", () => {
		expect(heatClock(clockBracket(START, 600), "nope", at(10))).toEqual({});
		expect(heatClock(clockBracket(START, 600), "h1", "garbage")).toEqual({
			startedAt: START,
			durationSec: 600,
		});
	});
});

describe("round and status queries", () => {
	const statuses = (
		...list: Array<"pending" | "running" | "judged" | "locked">
	) => ({
		id: "x",
		heats: list.map((status, i) => ({ ...heat(`h${i}`, ["a"]), status })),
	});

	test("numberedHeats numbers heats across rounds from 1", () => {
		const numbered = numberedHeats(fixture());
		expect(numbered.map((n) => [n.heat.id, n.number, n.roundIndex])).toEqual([
			["h1", 1, 0],
			["h2", 2, 1],
			["h3", 3, 1],
		]);
	});

	test("numberedHeats keeps the shape of the rounds it is given", () => {
		const minimal = { rounds: [{ name: "R", heats: [{ id: "x" }] }] };
		expect(numberedHeats(minimal)[0]?.round.name).toBe("R");
	});

	test("roundState and roundProgress follow the heat statuses", () => {
		expect(roundState({ heats: [] })).toBe("upcoming");
		expect(roundState(statuses("pending", "pending"))).toBe("upcoming");
		expect(roundState(statuses("judged", "pending"))).toBe("live");
		expect(roundState(statuses("judged", "locked"))).toBe("done");
		expect(roundProgress(statuses("judged", "running", "locked"))).toEqual({
			finished: 2,
			total: 3,
		});
	});

	test("hasRunningHeat and defaultOpenRoundId", () => {
		const done = { ...statuses("judged"), id: "done" };
		const live = { ...statuses("running"), id: "live" };
		const todo = { ...statuses("pending"), id: "todo" };
		expect(hasRunningHeat({ rounds: [done, todo] })).toBe(false);
		expect(hasRunningHeat({ rounds: [done, live] })).toBe(true);
		expect(defaultOpenRoundId([done, live, todo])).toBe("live");
		expect(defaultOpenRoundId([done, todo])).toBe("done");
		expect(defaultOpenRoundId([todo])).toBe("todo");
		expect(defaultOpenRoundId([])).toBeUndefined();
	});

	test("pickLiveHeat and pickNextHeat skip what does not match", () => {
		const rounds = [
			{ heats: [{ status: "judged" as const, slots: [1] }] },
			{
				heats: [
					{ status: "pending" as const, slots: [] },
					{ status: "pending" as const, slots: [1] },
					{ status: "running" as const, slots: [1] },
				],
			},
		];
		expect(pickLiveHeat(rounds)?.heatIndex).toBe(2);
		expect(pickNextHeat(rounds)?.heatIndex).toBe(1);
		expect(pickLiveHeat([])).toBeUndefined();
	});
});
