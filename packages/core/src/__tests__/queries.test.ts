import { describe, expect, test } from "vitest";
import { formatPresets } from "../format/presets";
import type { Bracket } from "../model";
import {
	advancementOf,
	awaitedRiders,
	defaultOpenRoundId,
	findHeat,
	getQualified,
	getRiderPath,
	hasRunningHeat,
	hasStarted,
	heatClock,
	numberedHeats,
	pickLiveHeat,
	pickNextHeat,
	roundProgress,
	roundState,
} from "../queries";
import { bracket, heat, link, okBracket, round } from "./fixtures";

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

describe("advancement queries", () => {
	test("advancementOf defaults to auto and follows the stored value", () => {
		const b = bracket([round("r1", [heat("h1")])]);
		expect(advancementOf(b)).toBe("auto");
		expect(advancementOf({ ...b, advancement: "manual" })).toBe("manual");
	});

	test("hasStarted is true as soon as one heat has left pending", () => {
		const pending = bracket([round("r1", [heat("h1"), heat("h2")])]);
		expect(hasStarted(pending)).toBe(false);
		expect(hasStarted(bracket([round("r1", [])]))).toBe(false);
		const started = bracket([
			round("r1", [heat("h1"), heat("h2", ["a"], { status: "running" })]),
		]);
		expect(hasStarted(started)).toBe(true);
	});
});

describe("awaitedRiders", () => {
	const two = (sources: ReturnType<typeof heat>[], target = heat("t")) =>
		bracket([round("r1", sources), round("r2", [target])], {
			links: [
				link("s1", 1, "t"),
				link("s1", 2, "t"),
				link("s2", 1, "t"),
				link("s2", 2, "t"),
				link("s2", 4, "t"),
			],
		});

	test("counts the ranks an unjudged source can still deliver", () => {
		const b = two([
			heat("s1", ["a", "b", "c", "d"]),
			heat("s2", ["e", "f", "g"]),
		]);
		expect(awaitedRiders(b, "t")).toBe(4);
	});

	test("an unjudged source counts only its riders without status", () => {
		const b = two([
			heat("s1", ["a", "b"]),
			heat("s2", ["e", { id: "f", status: "DNS" }]),
		]);
		expect(awaitedRiders(b, "t")).toBe(3);
	});

	test("a judged source delivers the rider holding the rank, unless it has a status", () => {
		const judged = { status: "judged" as const };
		const b = two([
			heat(
				"s1",
				[
					{ id: "a", rank: 1 },
					{ id: "b", rank: 2, status: "DSQ" },
					{ id: "c", rank: 3 },
				],
				judged,
			),
			heat(
				"s2",
				[
					{ id: "e", rank: 1 },
					{ id: "f", rank: 2 },
				],
				{ status: "locked" },
			),
		]);
		expect(awaitedRiders(b, "t")).toBe(3);
	});

	test("a heat without incoming link awaits nobody, nor does an unknown heat", () => {
		const b = two([heat("s1", ["a", "b"]), heat("s2", ["e"])]);
		expect(awaitedRiders(b, "s1")).toBe(0);
		expect(awaitedRiders(b, "nope")).toBe(0);
	});

	test("riders who entered the round directly are in neither term", () => {
		const b = two(
			[heat("s1", ["a", "b"]), heat("s2", ["e", "f"])],
			heat("t", ["x"]),
		);
		expect(awaitedRiders(b, "t")).toBe(4);
	});

	test("riders already arrived are deducted, never below zero", () => {
		const sources = [heat("s1", ["a", "b"]), heat("s2", ["e", "f"])];
		expect(awaitedRiders(two(sources, heat("t", ["a", "x"])), "t")).toBe(3);
		expect(
			awaitedRiders(two(sources, heat("t", ["a", "b", "e", "f", "a2"])), "t"),
		).toBe(0);
		const crowded = two(sources, heat("t", ["a", "b", "e"]));
		expect(awaitedRiders(crowded, "t")).toBe(1);
	});

	test("riders from a heat that does not feed the target are deducted from no feeder", () => {
		const b = bracket(
			[
				round("r1", [
					heat("s1", ["a", "b"]),
					heat("s2", ["e", "f"]),
					heat("other", ["x", "y"]),
				]),
				round("r2", [heat("t", ["x", "y", "a"])]),
			],
			{
				links: [
					link("s1", 1, "t"),
					link("s1", 2, "t"),
					link("s2", 1, "t"),
					link("s2", 2, "t"),
				],
			},
		);
		expect(awaitedRiders(b, "t")).toBe(3);
	});

	test("a feeder is credited at most for the links it delivers", () => {
		const b = bracket(
			[
				round("r1", [heat("s1", ["a", "b", "c"])]),
				round("r2", [heat("t", ["a", "b", "c"])]),
			],
			{ links: [link("s1", 1, "t"), link("s1", 2, "t")] },
		);
		expect(awaitedRiders(b, "t")).toBe(0);
	});

	describe("on a generated bracket", () => {
		const generated = (name: string, riders: number): Bracket => {
			const format = formatPresets.find((p) => p.name === name);
			if (!format) throw new Error(`Unknown preset ${name}`);
			const entries = Array.from({ length: riders }, (_, i) => ({
				riderId: `p${i + 1}`,
				displayName: `Rider ${i + 1}`,
			}));
			return okBracket(bracket([], { entries, status: "published" }), {
				type: "applyFormat",
				format,
				drawSeed: 1,
			});
		};
		const judge = (b: Bracket, heatId: string): Bracket => {
			let current = okBracket(b, {
				type: "setHeatStatus",
				heatId,
				status: "running",
			});
			current = okBracket(current, { type: "rankByPosition", heatId });
			return okBracket(current, {
				type: "setHeatStatus",
				heatId,
				status: "judged",
			});
		};

		test.each([
			["Single elimination", 16],
			["Single elimination", 14],
			["Chained repechage", 16],
			["Chained repechage", 13],
		])(
			"%s with %i riders: never more than a heat holds, nothing awaited once the first round is judged",
			(name, riders) => {
				const b = generated(name, riders);
				for (const r of b.rounds) {
					for (const h of r.heats) {
						expect(h.slots.length + awaitedRiders(b, h.id)).toBeLessThanOrEqual(
							r.maxPerHeat,
						);
					}
				}
				const judged = b.rounds[0]!.heats.reduce(
					(current, h) => (h.slots.length > 0 ? judge(current, h.id) : current),
					b,
				);
				for (const h of judged.rounds[1]!.heats) {
					expect(awaitedRiders(judged, h.id)).toBe(0);
				}
			},
		);
	});
});
