import { describe, expect, test } from "vitest";
import type { Bracket, ViewerDisplay } from "../model";
import type { Ride, Score, ScoringConfig } from "../scoring/model";
import { viewerHeatResult } from "../viewer";
import { bracket, heat, round } from "./fixtures";

const AT = "2026-11-09T10:00:00.000Z";
const AT_LATER = "2026-11-09T10:00:05.000Z";

const points: ScoringConfig = {
	method: "points",
	scale: { min: 0, max: 10, step: 0.5 },
	categories: [
		{
			type: "wave",
			counted: 1,
			families: [{ id: "f", name: "F" }],
			figures: [{ code: "B", family: "f" }],
		},
		{ type: "jump", counted: 1 },
	],
	aggregation: "mean",
};

const ride = (id: string, riderId: string, type = "wave", at = AT): Ride => ({
	id,
	riderId,
	type,
	at,
});
const score = (
	rideId: string,
	judgeId: string,
	value: number | null,
	at = AT,
): Score => ({ rideId, judgeId, value, at });

function setup(
	scoring: ScoringConfig | undefined,
	extra: Partial<Bracket> = {},
	status: "pending" | "running" = "running",
): Bracket {
	const base = bracket([
		round("r1", [heat("h1", ["a", "b"], { status }), heat("h2", ["c"])]),
	]);
	return { ...base, ...(scoring && { scoring }), ...extra };
}

const freeNotes = {
	rides: [
		ride("r1", "a"),
		ride("r2", "a", "jump", AT_LATER),
		ride("r3", "b"),
		ride("r4", "b", "jump", AT_LATER),
	],
	scores: [
		score("r1", "j1", 7),
		score("r2", "j1", 6),
		score("r3", "j2", 5),
		score("r4", "j2", 8),
	],
};

const none: ViewerDisplay = {
	typeSubtotals: false,
	rides: false,
	judgePlaces: false,
	judges: false,
};

describe("viewerHeatResult", () => {
	test("no result without scoring, for an unknown heat or a pending heat", () => {
		expect(viewerHeatResult(setup(undefined), "h1", freeNotes)).toBeUndefined();
		expect(viewerHeatResult(setup(points), "nope", freeNotes)).toBeUndefined();
		expect(
			viewerHeatResult(setup(points, {}, "pending"), "h1", freeNotes),
		).toBeUndefined();
	});

	test("the heat's penalties count, riders with a status are left out", () => {
		const b = setup(points);
		const h = b.rounds[0]!.heats[0]!;
		h.penalties = [{ riderId: "a", type: "wave", kind: "zeroBest" }];
		h.slots.push({ riderId: "z", rank: null, status: "DNS" });
		const result = viewerHeatResult(b, "h1", freeNotes, none);
		expect(result?.riders.map((r) => r.riderId).sort()).toEqual(["a", "b"]);
		const ada = result?.riders.find((r) => r.riderId === "a");
		expect(ada?.interferences).toBe(1);
		expect(ada?.total).toBe(3);
	});

	test("with nothing shown only ranking and totals remain, without judge ids", () => {
		const result = viewerHeatResult(setup(points), "h1", freeNotes, none);
		expect(result?.mode).toBe("free");
		expect(result).not.toHaveProperty("judgeIds");
		for (const rider of result?.riders ?? []) {
			expect(Object.keys(rider).sort()).toEqual([
				"dsqSuggested",
				"interferences",
				"missingScores",
				"rank",
				"riderId",
				"tied",
				"total",
			]);
		}
		expect(JSON.stringify(result)).not.toContain("j1");
	});

	test("typeSubtotals gives byType", () => {
		const result = viewerHeatResult(setup(points), "h1", freeNotes, {
			...none,
			typeSubtotals: true,
		});
		expect(result?.riders[0]?.byType).toBeDefined();
	});

	test("free mode with rides gives aligned moves without ids, judges or counted flag", () => {
		const notes = {
			rides: [
				ride("r1", "a", "wave", AT),
				ride("r2", "a", "wave", AT_LATER),
				ride("r3", "a", "jump", "2026-11-09T10:05:00.000Z"),
			],
			scores: [
				score("r1", "j1", 7),
				{ ...score("r2", "j2", 6), at: AT_LATER },
				score("r3", "j1", 4),
			],
		};
		const result = viewerHeatResult(setup(points), "h1", notes, {
			...none,
			rides: true,
		});
		const moves = result?.riders.find((r) => r.riderId === "a")?.moves;
		expect(moves?.map((m) => [m.type, m.value, m.judges, m.of])).toEqual([
			["wave", 6.5, 2, 2],
			["jump", 4, 1, 2],
		]);
		expect(moves?.every((m) => !m.counted)).toBe(true);
		const raw = JSON.stringify(result);
		for (const hidden of ["j1", "j2", "r1", "r3", "judgeRides"]) {
			expect(raw).not.toContain(hidden);
		}
	});

	test("head-judge mode gives one move per ride with the ride mean and its counted flag", () => {
		const notes = {
			rides: [
				ride("r1", "a"),
				ride("r2", "b"),
				ride("r3", "b", "wave", AT_LATER),
			],
			scores: [
				score("r1", "j1", 7),
				score("r1", "j2", 6),
				score("r2", "j1", 4),
				score("r2", "j2", null),
			],
		};
		const result = viewerHeatResult(
			setup(points, { judgingMode: "headJudge" }),
			"h1",
			notes,
			{ ...none, rides: true },
		);
		expect(result?.mode).toBe("headJudge");
		const a = result?.riders.find((r) => r.riderId === "a");
		expect(a?.moves).toEqual([
			{
				type: "wave",
				at: AT,
				value: 6.5,
				counted: true,
				judges: 2,
				answers: 2,
				of: 2,
				figureAgreement: true,
			},
		]);
		// The ride nobody answered is not a move yet.
		const bMoves = result?.riders.find((r) => r.riderId === "b")?.moves;
		expect(bMoves).toHaveLength(1);
		// "Not seen" is an answer without a note.
		expect(bMoves?.[0]).toMatchObject({ judges: 1, answers: 2, of: 2 });
		expect(JSON.stringify(result)).not.toContain("j1");
	});

	test("the bracket judging mode is followed", () => {
		const b = setup(points);
		b.judgingMode = "headJudge";
		expect(viewerHeatResult(b, "h1", freeNotes, none)?.mode).toBe("headJudge");
	});

	test("judges adds judge rides and the judge order, with or without rides", () => {
		const withRides = viewerHeatResult(setup(points), "h1", freeNotes, {
			...none,
			rides: true,
			judges: true,
		});
		expect(withRides?.judgeIds).toEqual(["j1", "j2"]);
		const ada = withRides?.riders.find((r) => r.riderId === "a");
		expect(ada?.judgeRides?.[0]).toMatchObject({
			rideId: "r1",
			judgeId: "j1",
			scores: [{ judgeId: "j1", value: 7 }],
		});

		const alone = viewerHeatResult(setup(points), "h1", freeNotes, {
			...none,
			judges: true,
		});
		expect(alone?.judgeIds).toEqual(["j1", "j2"]);
		const aloneAda = alone?.riders.find((r) => r.riderId === "a");
		expect(aloneAda?.moves).toBeUndefined();
		expect(aloneAda?.judgeRides?.[0]).toMatchObject({
			judgeId: "j1",
			scores: [{ judgeId: "j1", value: 7 }],
		});
	});

	test("placings: places are anonymous, keyed by judge only with judges", () => {
		const placings = { ...points, method: "placings" as const };
		const anonymous = viewerHeatResult(setup(placings), "h1", freeNotes, {
			...none,
			judgePlaces: true,
		});
		for (const rider of anonymous?.riders ?? []) {
			expect(rider.placingsSum).toBeTypeOf("number");
			expect(rider.places).toHaveLength(2);
			expect(rider.placesByJudge).toBeUndefined();
		}
		expect(JSON.stringify(anonymous)).not.toContain("j1");

		const off = viewerHeatResult(setup(placings), "h1", freeNotes, none);
		expect(off?.riders[0]?.placingsSum).toBeTypeOf("number");
		expect(off?.riders[0]?.places).toBeUndefined();

		const named = viewerHeatResult(setup(placings), "h1", freeNotes, {
			...none,
			judgePlaces: true,
			judges: true,
		});
		expect(Object.keys(named?.riders[0]?.placesByJudge ?? {}).sort()).toEqual([
			"j1",
			"j2",
		]);
		expect(named?.judgeIds).toEqual(["j1", "j2"]);
	});

	test('"all" shows everything, the bracket settings are the default', () => {
		const b = setup(points, { viewerDisplay: { rides: false } });
		const all = viewerHeatResult(b, "h1", freeNotes, "all");
		expect(all?.riders[0]?.moves).toBeDefined();
		expect(all?.riders[0]?.judgeRides).toBeDefined();
		const byDefault = viewerHeatResult(b, "h1", freeNotes);
		expect(byDefault?.riders[0]?.moves).toBeUndefined();
		expect(byDefault).not.toHaveProperty("judgeIds");
	});

	test("rideMeans always works on shared rides", () => {
		const b = setup(
			{ ...points, method: "rideMeans" },
			{ judgingMode: "headJudge" },
		);
		const result = viewerHeatResult(b, "h1", {
			rides: [ride("r1", "a")],
			scores: [score("r1", "j1", 7)],
		});
		expect(result?.method).toBe("rideMeans");
		expect(result?.mode).toBe("headJudge");
		expect(result?.riders[0]?.moves).toHaveLength(1);
	});
});
