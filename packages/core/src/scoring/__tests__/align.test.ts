import { describe, expect, it } from "vitest";
import { alignRides } from "../align";
import { scoringPresets } from "../presets";
import type { Ride, Score, ScoringConfig } from "../model";
import { scoringProblem } from "../validate";

const base = Date.parse("2030-01-01T10:00:00.000Z");
const iso = (sec: number) => new Date(base + sec * 1000).toISOString();

interface N {
	judge: string;
	type: "Jump" | "Wave";
	sec: number;
	value: number;
	figure?: string;
	rider?: string;
}

function build(notes: N[]): { rides: Ride[]; scores: Score[] } {
	const rides: Ride[] = [];
	const scores: Score[] = [];
	notes.forEach((n, i) => {
		const id = `${n.judge}-${i}`;
		rides.push({
			id,
			riderId: n.rider ?? "r1",
			type: n.type,
			at: iso(n.sec),
			...(n.figure === undefined ? {} : { figure: n.figure }),
		});
		scores.push({
			rideId: id,
			judgeId: n.judge,
			value: n.value,
			at: iso(n.sec),
		});
	});
	return { rides, scores };
}

const config = scoringPresets.windsurfWave;

function groupsOf(notes: N[], cfg: ScoringConfig = config) {
	const { rides, scores } = build(notes);
	return alignRides(cfg, rides, scores)[0]?.groups ?? [];
}

const summary = (groups: ReturnType<typeof groupsOf>) =>
	groups.map((g) => `${g.type}:${g.judges}/${g.of}`);

describe("alignRides", () => {
	it("groups the same sequence noted by every judge", () => {
		const groups = groupsOf([
			{ judge: "a", type: "Jump", sec: 10, value: 7 },
			{ judge: "a", type: "Wave", sec: 40, value: 6 },
			{ judge: "b", type: "Jump", sec: 12, value: 8 },
			{ judge: "b", type: "Wave", sec: 43, value: 5 },
		]);
		expect(summary(groups)).toEqual(["Jump:2/2", "Wave:2/2"]);
		expect(groups.map((g) => g.mean)).toEqual([7.5, 5.5]);
		expect(groups.every((g) => g.complete)).toBe(true);
		expect(groups[0]?.at).toBe(iso(11));
	});

	it("(a) marks a wave missed by one judge as 2/3", () => {
		const groups = groupsOf([
			{ judge: "a", type: "Jump", sec: 10, value: 7 },
			{ judge: "a", type: "Wave", sec: 40, value: 6 },
			{ judge: "a", type: "Jump", sec: 70, value: 8 },
			{ judge: "b", type: "Jump", sec: 11, value: 7 },
			{ judge: "b", type: "Wave", sec: 41, value: 6 },
			{ judge: "b", type: "Jump", sec: 71, value: 8 },
			{ judge: "c", type: "Jump", sec: 12, value: 7 },
			{ judge: "c", type: "Jump", sec: 72, value: 8 },
		]);
		expect(summary(groups)).toEqual(["Jump:3/3", "Wave:2/3", "Jump:3/3"]);
		expect(groups[1]?.complete).toBe(false);
	});

	it("(b) matches the remaining wave to the closest one in time", () => {
		const groups = groupsOf([
			{ judge: "a", type: "Jump", sec: 10, value: 7 },
			{ judge: "a", type: "Wave", sec: 40, value: 6 },
			{ judge: "a", type: "Wave", sec: 60, value: 5 },
			{ judge: "a", type: "Jump", sec: 90, value: 8 },
			{ judge: "b", type: "Jump", sec: 10, value: 7 },
			{ judge: "b", type: "Wave", sec: 40, value: 6 },
			{ judge: "b", type: "Wave", sec: 60, value: 5 },
			{ judge: "b", type: "Jump", sec: 90, value: 8 },
			{ judge: "c", type: "Jump", sec: 10, value: 7 },
			{ judge: "c", type: "Wave", sec: 61, value: 5 },
			{ judge: "c", type: "Jump", sec: 90, value: 8 },
		]);
		expect(summary(groups)).toEqual([
			"Jump:3/3",
			"Wave:2/3",
			"Wave:3/3",
			"Jump:3/3",
		]);
		expect(groups[2]?.notes.map((n) => n.judgeId).sort()).toEqual([
			"a",
			"b",
			"c",
		]);
	});

	it("(c) does not merge a small jump into the next jump", () => {
		const groups = groupsOf([
			{ judge: "a", type: "Jump", sec: 94, value: 3 },
			{ judge: "a", type: "Jump", sec: 100, value: 8 },
			{ judge: "b", type: "Jump", sec: 101, value: 8 },
			{ judge: "c", type: "Jump", sec: 102, value: 8 },
		]);
		expect(summary(groups)).toEqual(["Jump:1/3", "Jump:3/3"]);
		expect(groups[0]?.mean).toBe(3);
		expect(groups[1]?.mean).toBe(8);
	});

	it("(d) inserts in order a move the reference judge missed", () => {
		const groups = groupsOf([
			{ judge: "a", type: "Jump", sec: 10, value: 7 },
			{ judge: "a", type: "Jump", sec: 100, value: 7 },
			{ judge: "a", type: "Jump", sec: 150, value: 7 },
			{ judge: "b", type: "Jump", sec: 11, value: 7 },
			{ judge: "b", type: "Wave", sec: 50, value: 6 },
			{ judge: "b", type: "Jump", sec: 100, value: 7 },
		]);
		expect(summary(groups)).toEqual([
			"Jump:2/2",
			"Wave:1/2",
			"Jump:2/2",
			"Jump:1/2",
		]);
	});

	it("(e) does not merge notes further apart than the window", () => {
		const notes: N[] = [
			{ judge: "a", type: "Wave", sec: 10, value: 6 },
			{ judge: "b", type: "Wave", sec: 50, value: 6 },
		];
		expect(summary(groupsOf(notes))).toEqual(["Wave:1/2", "Wave:1/2"]);
		expect(summary(groupsOf(notes, { ...config, alignWindowSec: 45 }))).toEqual(
			["Wave:2/2"],
		);
	});

	it("(f) takes the majority figure and flags a disagreement", () => {
		const groups = groupsOf([
			{ judge: "a", type: "Jump", sec: 10, value: 7, figure: "B" },
			{ judge: "b", type: "Jump", sec: 11, value: 7, figure: "B" },
			{ judge: "c", type: "Jump", sec: 12, value: 7, figure: "F" },
			{ judge: "a", type: "Jump", sec: 100, value: 7, figure: "B" },
			{ judge: "b", type: "Jump", sec: 101, value: 7, figure: "F" },
			{ judge: "a", type: "Wave", sec: 200, value: 6 },
			{ judge: "b", type: "Wave", sec: 201, value: 6 },
			{ judge: "a", type: "Jump", sec: 300, value: 7, figure: "F" },
			{ judge: "b", type: "Jump", sec: 301, value: 7 },
		]);
		expect(groups[0]).toMatchObject({
			figure: "B",
			figureAgreement: false,
		});
		expect(groups[1]?.figure).toBeUndefined();
		expect(groups[1]?.figureAgreement).toBe(false);
		expect(groups[2]).toMatchObject({ figureAgreement: true });
		expect(groups[2]?.figure).toBeUndefined();
		expect(groups[3]).toMatchObject({ figure: "F", figureAgreement: true });
	});

	it("(g) is deterministic whatever the input order", () => {
		const notes: N[] = [
			{ judge: "a", type: "Jump", sec: 10, value: 7 },
			{ judge: "a", type: "Wave", sec: 40, value: 6 },
			{ judge: "b", type: "Jump", sec: 20, value: 8 },
			{ judge: "b", type: "Wave", sec: 50, value: 5 },
			{ judge: "c", type: "Jump", sec: 15, value: 6 },
		];
		const first = build(notes);
		const second = {
			rides: [...first.rides].reverse(),
			scores: [...first.scores].reverse(),
		};
		const a = alignRides(config, first.rides, first.scores);
		expect(alignRides(config, first.rides, first.scores)).toEqual(a);
		expect(alignRides(config, second.rides, second.scores)).toEqual(a);
	});

	it("keeps riders apart and follows the riderIds option", () => {
		const { rides, scores } = build([
			{ judge: "a", type: "Wave", sec: 10, value: 6, rider: "r1" },
			{ judge: "b", type: "Wave", sec: 11, value: 6, rider: "r2" },
		]);
		const all = alignRides(config, rides, scores);
		expect(all.map((r) => r.riderId)).toEqual(["r1", "r2"]);
		expect(all.map((r) => r.groups.map((g) => g.of))).toEqual([[2], [2]]);
		const only = alignRides(config, rides, scores, { riderIds: ["r2"] });
		expect(only.map((r) => r.riderId)).toEqual(["r2"]);
	});

	it("ignores rides without a valid score", () => {
		const { rides, scores } = build([
			{ judge: "a", type: "Wave", sec: 10, value: 6 },
			{ judge: "b", type: "Wave", sec: 11, value: 6.25 },
		]);
		const groups = alignRides(config, rides, scores)[0]?.groups ?? [];
		expect(summary(groups)).toEqual(["Wave:1/1"]);
	});
});

describe("alignWindowSec validation", () => {
	it("accepts a positive integer or nothing", () => {
		expect(scoringProblem(config)).toBeUndefined();
		expect(scoringProblem({ ...config, alignWindowSec: 45 })).toBeUndefined();
	});

	it("rejects zero, negatives and fractions", () => {
		for (const alignWindowSec of [0, -3, 1.5, Number.NaN]) {
			expect(scoringProblem({ ...config, alignWindowSec })?.field).toBe(
				"alignWindowSec",
			);
		}
	});
});
