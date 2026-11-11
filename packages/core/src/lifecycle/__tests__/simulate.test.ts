import { describe, expect, test } from "vitest";
import { okBracket, sampleBracket } from "../../__tests__/fixtures";
import type { Bracket, Heat } from "../../model";
import { scoringPresets } from "../../scoring/presets";
import { schedule, settleChain } from "../chain";
import { canSimulateRound, simulateRound } from "../simulate";

const NOW = "2026-03-01T10:00:00.000Z";

const heatOf = (b: Bracket, id: string) =>
	b.rounds.flatMap((r) => r.heats).find((h) => h.id === id) as Heat;

const ready = (
	format: Parameters<typeof okBracket>[1] = {
		type: "setRaceFormat",
		scoring: scoringPresets.windsurfWave,
		timing: { heatDurationSec: 600, breakSec: 120 },
	},
): Bracket => okBracket(sampleBracket("published"), format);

const simulated = (b: Bracket, roundId: string, seed = 1) => {
	const result = simulateRound(b, roundId, seed, { now: NOW });
	if (!result.ok) throw new Error(result.error.message);
	return result;
};

describe("simulateRound", () => {
	test("judges every heat of the round and moves the qualifiers on", () => {
		const { bracket, heats } = simulated(ready(), "r1");
		expect(heats.map((h) => h.heatId)).toEqual(["h1", "h2"]);
		for (const id of ["h1", "h2"]) {
			const heat = heatOf(bracket, id);
			expect(heat.status).toBe("judged");
			expect(heat.startedAt).toBe(NOW);
			expect(heat.scoring).toEqual(scoringPresets.windsurfWave);
			expect(heat.slots.every((s) => s.rank !== null)).toBe(true);
		}
		expect(heatOf(bracket, "h3").slots).toHaveLength(4);
		expect(heatOf(bracket, "h3").status).toBe("pending");
		expect(bracket.status).toBe("running");
	});

	test("follows the rounds one after the other", () => {
		const first = simulated(ready(), "r1").bracket;
		expect(canSimulateRound(first, "r3")).toBe(false);
		const second = simulated(first, "r2").bracket;
		expect(heatOf(second, "h3").status).toBe("judged");
		expect(heatOf(second, "h4").slots).toHaveLength(2);
	});

	test("is deterministic for a seed and varies with it", () => {
		const run = (seed: number) => simulated(ready(), "r1", seed);
		expect(run(5)).toEqual(run(5));
		expect(run(6).heats).not.toEqual(run(5).heats);
	});

	test("never lets the automatic chain start another heat afterwards", () => {
		const { bracket } = simulated(ready(), "r1");
		expect(heatOf(bracket, "h1").timing?.heatDurationSec).toBeUndefined();
		const later = new Date(Date.parse(NOW) + 3 * 3600_000).toISOString();
		expect(settleChain(bracket, later)).toBe(bracket);
	});

	test("hands out each judge's own notes in free mode", () => {
		const { heats } = simulated(ready(), "r1");
		const [first] = heats;
		expect(Object.keys(first?.byJudge ?? {})).toEqual([
			"judge1",
			"judge2",
			"judge3",
		]);
		expect(first?.announcedRides).toBeUndefined();
	});

	test("uses the given judges", () => {
		const result = simulateRound(ready(), "r1", 1, {
			now: NOW,
			judgeIds: ["a", "b"],
		});
		expect(result.ok && Object.keys(result.heats[0]?.byJudge ?? {})).toEqual([
			"a",
			"b",
		]);
	});

	test("announces shared rides in head-judge mode with a ride-means scoring", () => {
		const b = ready({
			type: "setRaceFormat",
			scoring: scoringPresets.surf,
			judgingMode: "headJudge",
		});
		const { bracket, heats } = simulated(b, "r1");
		expect(heatOf(bracket, "h1").status).toBe("judged");
		const [first] = heats;
		expect(first?.announcedRides?.length).toBeGreaterThan(0);
		for (const notes of Object.values(first?.byJudge ?? {})) {
			expect(notes.rides).toEqual([]);
			expect(notes.scores.length).toBeGreaterThan(0);
		}
	});

	test("draws the order when the bracket has no scoring", () => {
		const { bracket, heats } = simulated(
			okBracket(sampleBracket("published"), {
				type: "setRaceFormat",
				timing: {},
			}),
			"r1",
		);
		expect(heatOf(bracket, "h1").status).toBe("judged");
		expect(heats).toEqual([]);
	});

	test("refuses a round with no heat ready, and an unknown one", () => {
		const b = ready();
		expect(canSimulateRound(b, "r2")).toBe(false);
		const nothing = simulateRound(b, "r2", 1);
		expect(!nothing.ok && nothing.error.code).toBe("NOTHING_TO_SIMULATE");
		const unknown = simulateRound(b, "nope", 1);
		expect(!unknown.ok && unknown.error.code).toBe("UNKNOWN_ROUND");
	});

	test("refuses on a draft bracket and leaves the input untouched", () => {
		const draft = sampleBracket();
		const before = structuredClone(draft);
		const result = simulateRound(draft, "r1", 1);
		expect(!result.ok && result.error.code).toBe("BRACKET_NOT_PUBLISHED");
		expect(draft).toEqual(before);
	});

	test("refuses while a timed heat runs and keeps the schedule on that heat", () => {
		const running = okBracket(ready(), {
			type: "setHeatStatus",
			heatId: "h1",
			status: "running",
			at: NOW,
		});
		const during = new Date(Date.parse(NOW) + 60_000).toISOString();
		const result = simulateRound(running, "r1", 1, { now: during });
		expect(!result.ok && result.error.code).toBe("SIMULATE_WHILE_RUNNING");
		const view = schedule(running, during);
		expect(view).toMatchObject({ phase: "heat", heatId: "h1" });
		expect(view.next?.heatId).toBe("h2");
	});

	test("refuses while a break counts down", () => {
		const done = simulated(ready(), "r1").bracket;
		const inBreak: Bracket = {
			...done,
			chain: { break: { startedAt: NOW, durationSec: 120 } },
		};
		const during = new Date(Date.parse(NOW) + 30_000).toISOString();
		const result = simulateRound(inBreak, "r2", 1, { now: during });
		expect(!result.ok && result.error.code).toBe("SIMULATE_WHILE_RUNNING");
	});

	test("a finished bracket drops the pause and any break", () => {
		const first = simulated(ready(), "r1").bracket;
		const paused: Bracket = { ...first, chain: { pause: "paused" } };
		const second = simulated(paused, "r2").bracket;
		expect(second.status).toBe("running");
		expect(second.chain).toEqual({ pause: "paused" });
		const finished = simulated(second, "r3").bracket;
		expect(finished.status).toBe("finished");
		expect(finished.chain).toBeUndefined();
		const stale: Bracket = { ...finished, chain: { pause: "paused" } };
		expect(schedule(stale, NOW).phase).toBe("idle");
	});
});
