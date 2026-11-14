import { describe, expect, test } from "vitest";
import type { Action } from "..";
import { placeAllPlan } from "../placement";
import { defaultPlan, editorFromPlan, formatFromPlan } from "../../format/plan";
import { formatPresets } from "../../format/presets";
import type { FormatPlan } from "../../format/plan";
import type { FormatSettings } from "../../format/model";
import type { Bracket, Entry } from "../../model";
import { awaitedRiders } from "../../queries";
import { validateBracket } from "../../validate";
import {
	advanceHeat,
	bracket,
	errorCode,
	heat,
	okBracket,
	round,
	run,
} from "../../__tests__/fixtures";

const entries = (count: number, seeded = 0): Entry[] =>
	Array.from({ length: count }, (_, i) => ({
		riderId: `p${String(i + 1).padStart(2, "0")}`,
		displayName: `Rider ${i + 1}`,
		...(i < seeded ? { seed: i + 1 } : {}),
	}));

const planOf = (riders: number, seedSlots = 0): FormatPlan => {
	const plan = defaultPlan({
		riders,
		heats: Math.ceil(riders / 4),
		advance: 2,
		repechage: false,
	});
	return seedSlots === 0
		? plan
		: {
				...plan,
				rounds: plan.rounds.map((r, i) => (i === 1 ? { ...r, seedSlots } : r)),
			};
};

const formatted = (plan: FormatPlan, riders: Entry[]): Bracket =>
	okBracket(bracket([], { entries: riders, status: "published" }), {
		type: "applyFormat",
		format: formatFromPlan(plan),
		editor: editorFromPlan(plan),
		drawSeed: 1,
	});

const ridersOf = (b: Bracket, roundIndex: number) =>
	(b.rounds[roundIndex]?.heats ?? []).map((h) => h.slots.map((s) => s.riderId));

const allPlaced = (b: Bracket) =>
	new Set(
		b.rounds.flatMap((r) =>
			r.heats.flatMap((h) => h.slots.map((s) => s.riderId)),
		),
	);

const startedAuto = (b: Bracket): Bracket =>
	advanceHeat(b, b.rounds[0]?.heats[0]?.id as string, "running");

describe("direct entries limited by seedSlots", () => {
	const settings: FormatSettings = {
		heatboardFormat: 1,
		name: "test",
		fill: "serpentine",
		rounds: [
			{ key: "r1", name: "r1", heats: 2 },
			{ key: "r2", name: "r2", heats: 2, seedSlots: 2 },
			{ key: "final", name: "final", heats: 1 },
		],
	};
	const build = (withFormat = true, direct = ["s1"]): Bracket => ({
		...bracket(
			[
				round("r1", [heat("h1", ["a", "b"]), heat("h2", ["c"])]),
				round("r2", [heat("f1", direct), heat("f2")]),
				round("final", [heat("g1")]),
			],
			{
				status: "published",
				entries: ["a", "b", "c", "s1", "s2", "s3"].map((riderId) => ({
					riderId,
					displayName: riderId,
				})),
			},
		),
		...(withFormat && { format: { settings, drawSeed: 1 } }),
	});
	const place = (riderId: string, heatId: string): Action => ({
		type: "place",
		riderId,
		heatId,
	});

	test("accepts a direct entry below the limit and refuses the one beyond it", () => {
		const b = okBracket(build(), place("s2", "f2"));
		const result = run(b, place("s3", "f1"));
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("SEED_SLOTS_FULL");
		expect(result.error.details).toEqual({ roundId: "r2", seedSlots: 2 });
	});

	test("a round without seedSlots takes no direct entry, the first round is free", () => {
		expect(errorCode(build(), place("s2", "g1"))).toBe("SEED_SLOTS_FULL");
		expect(errorCode(build(), place("s2", "h2"))).toBe("ok");
	});

	test("no limit in manual advancement nor without a format", () => {
		const full = okBracket(build(), place("s2", "f2"));
		expect(
			errorCode({ ...full, advancement: "manual" }, place("s3", "f1")),
		).toBe("ok");
		const noFormat = okBracket(build(false), place("s2", "f2"));
		expect(errorCode(noFormat, place("s3", "f1"))).toBe("ok");
	});

	test("a round the format does not know has no limit", () => {
		const b = build();
		const other: Bracket = {
			...b,
			rounds: [...b.rounds, round("extra", [heat("x1")])],
		};
		expect(errorCode(other, place("s2", "x1"))).toBe("ok");
	});

	test("changing heat inside the round does not count the rider twice", () => {
		const b = okBracket(build(), place("s2", "f2"));
		const moved = okBracket(b, {
			type: "move",
			riderId: "s1",
			fromHeatId: "f1",
			toHeatId: "f2",
		});
		expect(ridersOf(moved, 1)).toEqual([[], ["s2", "s1"]]);
	});

	test("moving a first-round rider to a later round before the start", () => {
		const move: Action = {
			type: "move",
			riderId: "a",
			fromHeatId: "h1",
			toHeatId: "f2",
		};
		expect(errorCode(build(), move)).toBe("ok");
		const full = okBracket(build(), place("s2", "f1"));
		expect(errorCode(full, move)).toBe("SEED_SLOTS_FULL");
		expect(errorCode(full, { ...move, toHeatId: "g1" })).toBe(
			"SEED_SLOTS_FULL",
		);
	});

	test("a rider coming from an earlier round is not a direct entry", () => {
		const full = okBracket(build(), place("s2", "f1"));
		const judged: Bracket = {
			...full,
			rounds: full.rounds.map((r) =>
				r.id === "r1"
					? {
							...r,
							heats: r.heats.map((h) =>
								h.id === "h1"
									? {
											...h,
											status: "judged" as const,
											slots: h.slots.map((s, i) => ({ ...s, rank: i + 1 })),
										}
									: h,
							),
						}
					: r,
			),
		};
		expect(
			errorCode(judged, {
				type: "advance",
				riderId: "a",
				fromHeatId: "h1",
				toHeatId: "f2",
			}),
		).toBe("ok");
	});
});

describe("placeAll", () => {
	const mismatched = () =>
		okBracket(formatted(planOf(24), entries(24)), {
			type: "addEntries",
			entries: entries(26).slice(24),
		});
	const placeAll = (drawSeed = 3): Action => ({ type: "placeAll", drawSeed });

	test("applies the format again for the entered riders when their count differs", () => {
		const b = mismatched();
		expect(placeAllPlan(b)).toBe("rebuild");
		const next = okBracket(b, placeAll(5));
		expect(next.format?.editor?.riders).toBe(26);
		expect(next.format?.drawSeed).toBe(5);
		expect(next.rounds[0]?.heats).toHaveLength(6);
		expect(ridersOf(next, 0).flat()).toHaveLength(26);
		expect(validateBracket(next)).toEqual([]);
	});

	test("deals the first round when the count matches", () => {
		const b = formatted(planOf(24), entries(24));
		expect(placeAllPlan(b)).toBe("draw");
		const next = okBracket(b, placeAll());
		expect(next.format).toBe(b.format);
		expect(ridersOf(next, 0).map((h) => h.length)).toEqual([4, 4, 4, 4, 4, 4]);
		expect(ridersOf(next, 0)).toEqual(
			ridersOf(
				okBracket(b, { type: "drawRound", roundId: "r1", drawSeed: 3 }),
				0,
			),
		);
	});

	test("deals the first round when fewer riders are entered and the format is custom", () => {
		const b = structuredClone(formatted(planOf(24), entries(22)));
		b.format!.settings.rounds[0]!.outcomes = [];
		expect(placeAllPlan(b)).toBe("draw");
		expect(okBracket(b, placeAll()).format).toBe(b.format);
	});

	test("applies the format again when a round takes seeds, even if the count matches", () => {
		const b = formatted(planOf(16, 2), entries(16, 4));
		expect(placeAllPlan(b)).toBe("rebuild");
		const next = okBracket(b, placeAll());
		expect(ridersOf(next, 1).flat().sort()).toEqual(["p01", "p02"]);
		expect(allPlaced(next).size).toBe(16);
	});

	test("is reproducible for a seed", () => {
		const b = mismatched();
		expect(okBracket(b, placeAll(9))).toEqual(okBracket(b, placeAll(9)));
	});

	test("offers nothing without riders, without format or once a heat started", () => {
		const empty = formatted(planOf(24), []);
		expect(placeAllPlan(empty)).toBeUndefined();
		expect(okBracket(empty, placeAll())).toBe(empty);
		const noRound = bracket([], { entries: entries(2) });
		expect(placeAllPlan(noRound)).toBeUndefined();
		expect(errorCode(noRound, placeAll())).toBe("INVALID_ARGUMENT");
		const started = startedAuto(mismatched());
		expect(placeAllPlan(started)).toBeUndefined();
		expect(errorCode(started, placeAll())).toBe("ROUND_STARTED");
	});

	test("a bracket without format is drawn on its first round", () => {
		const b = bracket(
			[round("r1", [heat("h1"), heat("h2")]), round("r2", [heat("h3")])],
			{ entries: entries(6), status: "published" },
		);
		expect(placeAllPlan(b)).toBe("draw");
		const next = okBracket(b, placeAll());
		expect(ridersOf(next, 0).flat()).toHaveLength(6);
		expect(ridersOf(next, 1)).toEqual([[]]);
	});

	describe("draw mode puts everybody back", () => {
		const twoRounds = (): Bracket =>
			bracket(
				[round("r1", [heat("h1"), heat("h2")]), round("r2", [heat("h3")])],
				{
					status: "published",
					entries: [
						...entries(5),
						{ riderId: "late", displayName: "Late", entryRoundId: "r2" },
					],
				},
			);

		test("a rider placed by hand in a later round returns to the first round", () => {
			let b = okBracket(twoRounds(), {
				type: "place",
				riderId: "p01",
				heatId: "h3",
			});
			b = okBracket(b, { type: "place", riderId: "late", heatId: "h3" });
			expect(placeAllPlan(b)).toBe("draw");
			const next = okBracket(b, placeAll());
			expect(ridersOf(next, 0).flat().sort()).toEqual([
				"p01",
				"p02",
				"p03",
				"p04",
				"p05",
			]);
			expect(ridersOf(next, 1)).toEqual([["late"]]);
		});
	});

	test("refuses a draw seed that is not an integer", () => {
		expect(errorCode(mismatched(), { type: "placeAll", drawSeed: 1.5 })).toBe(
			"INVALID_ARGUMENT",
		);
	});
});

describe("placeRest", () => {
	const placeRest = (drawSeed = 3): Action => ({ type: "placeRest", drawSeed });
	const remove = (b: Bracket, riderId: string): Bracket => {
		const heatId = b.rounds
			.flatMap((r) => r.heats)
			.find((h) => h.slots.some((s) => s.riderId === riderId))?.id as string;
		return okBracket(b, { type: "remove", riderId, heatId });
	};
	/** 16 riders, 2 seeds join round 2; p01 and p02 hold the best priorities, then p03 and p04. */
	const seeded = () => formatted(planOf(16, 2), entries(16, 4));
	/** The two seeds (p01, p02) and four first-round riders are taken out of their heats. */
	const withRest = () => {
		let b = seeded();
		for (const id of ["p01", "p02", "p10", "p11", "p13", "p15"])
			b = remove(b, id);
		return b;
	};
	test("moves nobody and keeps the structure", () => {
		const before = withRest();
		const after = okBracket(before, placeRest());
		after.rounds.forEach((r, i) =>
			r.heats.forEach((h, j) => {
				const old = before.rounds[i]?.heats[j]?.slots ?? [];
				expect(h.slots.slice(0, old.length)).toEqual(old);
				old.forEach((slot, k) => expect(h.slots[k]).toBe(slot));
			}),
		);
		expect(after.links).toBe(before.links);
		expect(after.format).toBe(before.format);
		expect(
			after.rounds.map((r) => [r.id, r.maxPerHeat, r.heats.map((h) => h.id)]),
		).toEqual(
			before.rounds.map((r) => [r.id, r.maxPerHeat, r.heats.map((h) => h.id)]),
		);
		expect(allPlaced(after).size).toBe(16);
	});

	test("free direct-entry places go to the best seed priorities", () => {
		const after = okBracket(withRest(), placeRest());
		expect(ridersOf(after, 1).flat().sort()).toEqual(["p01", "p02"]);
		expect(ridersOf(after, 0).flat()).toContain("p10");
		expect(ridersOf(after, 0).flat()).toContain("p11");
	});

	test("only the free places go to the seeds when the round already has one", () => {
		let b = withRest();
		b = okBracket(remove(b, "p03"), {
			type: "place",
			riderId: "p03",
			heatId: "r2-1",
		});
		const after = okBracket(b, placeRest());
		const direct = ridersOf(after, 1).flat().sort();
		expect(direct).toEqual(["p01", "p03"]);
		expect(ridersOf(after, 0).flat()).toContain("p02");
	});

	test("deals the first round over the least filled heats, best priorities first", () => {
		const b = bracket(
			[
				round("r1", [
					heat("h1", ["a", "b", "c"]),
					heat("h2", ["d"]),
					heat("h3", ["e", "f"]),
					heat("h4"),
				]),
				round("r2", [heat("f1")]),
			],
			{
				status: "published",
				entries: [
					..."abcdef"
						.split("")
						.map((riderId) => ({ riderId, displayName: riderId })),
					{ riderId: "x1", displayName: "x1", seed: 1 },
					{ riderId: "x2", displayName: "x2", seed: 2 },
					{ riderId: "x3", displayName: "x3", seed: 3 },
					{ riderId: "x4", displayName: "x4" },
					{ riderId: "x5", displayName: "x5" },
					{ riderId: "x6", displayName: "x6" },
				],
			},
		);
		const after = okBracket(b, placeRest());
		expect(ridersOf(after, 0).map((h) => h.length)).toEqual([3, 3, 3, 3]);
		expect(ridersOf(after, 0)[3]).toContain("x1");
		expect(ridersOf(after, 0)[1]).toContain("x2");
	});

	test("is reproducible for a seed and changes with it", () => {
		const b = withRest();
		expect(okBracket(b, placeRest(4))).toEqual(okBracket(b, placeRest(4)));
		const variants = new Set(
			[1, 2, 3, 4, 5, 6].map((s) =>
				JSON.stringify(ridersOf(okBracket(b, placeRest(s)), 0)),
			),
		);
		expect(variants.size).toBeGreaterThan(1);
	});

	test("fails with HEAT_FULL and changes nothing when there is not enough room", () => {
		const b = okBracket(seeded(), {
			type: "addEntries",
			entries: [
				{ riderId: "x1", displayName: "x1" },
				{ riderId: "x2", displayName: "x2" },
				{ riderId: "x3", displayName: "x3" },
			],
		});
		const result = run(b, placeRest());
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("HEAT_FULL");
		expect(result.error.details).toMatchObject({ roundId: "r1", riders: 3 });
	});

	test("is refused once a heat has started, like drawRound", () => {
		const b = startedAuto(withRest());
		expect(errorCode(b, placeRest())).toBe("ROUND_STARTED");
		expect(
			errorCode(b, { type: "drawRound", roundId: "r1", drawSeed: 1 }),
		).toBe("ROUND_STARTED");
	});

	test("changes nothing when everybody is placed", () => {
		const b = seeded();
		expect(okBracket(b, placeRest())).toBe(b);
	});

	test("a rider whose entry round is later goes to that round", () => {
		const b = okBracket(seeded(), {
			type: "addEntry",
			entry: { riderId: "late", displayName: "late", entryRoundId: "final" },
		});
		const after = okBracket(b, placeRest());
		expect(ridersOf(after, 2).flat()).toEqual(["late"]);
		expect(after.entries.find((e) => e.riderId === "late")?.entryRoundId).toBe(
			"final",
		);
	});

	test("rounds keep room for the riders their heats await", () => {
		const preset = formatPresets.find(
			(p) => p.name === "Single elimination",
		) as FormatSettings;
		const fromPreset = okBracket(
			bracket([], { entries: entries(16), status: "published" }),
			{ type: "applyFormat", format: preset, drawSeed: 1 },
		);
		const partial = ["p01", "p05", "p09", "p13"].reduce(remove, fromPreset);
		for (const candidate of [partial, withRest()]) {
			const after = okBracket(candidate, placeRest(2));
			for (const r of after.rounds) {
				for (const h of r.heats) {
					expect(
						h.slots.length + awaitedRiders(after, h.id),
					).toBeLessThanOrEqual(r.maxPerHeat);
				}
			}
			expect(validateBracket(after)).toEqual([]);
		}
	});
});

describe("lockPlacementOnceStarted with the placement actions", () => {
	const lock = { lockPlacementOnceStarted: true };
	const b = startedAuto(formatted(planOf(24), entries(24)));

	test.each(["placeAll", "placeRest"] as const)(
		"%s is refused in auto",
		(type) => {
			expect(errorCode(b, { type, drawSeed: 1 }, lock)).toBe(
				"PLACEMENT_LOCKED",
			);
		},
	);

	test.each(["placeAll", "placeRest"] as const)(
		"%s is not locked before the start, in manual, or without the option",
		(type) => {
			const action: Action = { type, drawSeed: 1 };
			const fresh = formatted(planOf(24), entries(24));
			expect(errorCode(fresh, action, lock)).not.toBe("PLACEMENT_LOCKED");
			expect(errorCode({ ...b, advancement: "manual" }, action, lock)).not.toBe(
				"PLACEMENT_LOCKED",
			);
			expect(errorCode(b, action)).not.toBe("PLACEMENT_LOCKED");
		},
	);
});
