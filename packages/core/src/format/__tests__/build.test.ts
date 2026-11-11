import { describe, expect, test } from "vitest";
import type { Entry } from "../../model";
import { buildFromFormat } from "../build";
import type { BuiltRound, FormatSettings } from "../model";
import { generateDoubleElimination } from "../double";
import { parseFormat } from "../parse";
import { formatPresets } from "../presets";

function entries(
	count: number,
	extra: (i: number) => Partial<Entry> = () => ({}),
) {
	return Array.from({ length: count }, (_, i): Entry => ({
		riderId: `p${String(i + 1).padStart(2, "0")}`,
		displayName: `Rider ${i + 1}`,
		...extra(i),
	}));
}

function preset(name: string): FormatSettings {
	const found = formatPresets.find((p) => p.name === name);
	if (!found) throw new Error(name);
	return found;
}

function doubleOf(finalMode: "duels" | "heats"): FormatSettings {
	const result = generateDoubleElimination(preset("Single elimination"), {
		finalMode,
	});
	if (!result.ok) throw new Error(result.code);
	return result.format;
}

function spreadOf(f: FormatSettings): FormatSettings {
	return {
		...f,
		rounds: f.rounds.map((r) => ({ ...r, placement: "spread" as const })),
	};
}

function format(json: object): FormatSettings {
	const parsed = parseFormat({
		heatboardFormat: 1,
		name: "T",
		fill: "serpentine",
		...json,
	});
	if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
	return parsed.format;
}

function build(count: number, f: FormatSettings, drawSeed = 1) {
	const result = buildFromFormat(
		{ entries: entries(count), rounds: [] },
		f,
		drawSeed,
	);
	if (!result.ok) throw new Error("build failed");
	return result;
}

function sizes(round: BuiltRound): number[] {
	return round.heats.map((h) => h.slots.length);
}

describe("buildFromFormat", () => {
	test("single elimination with 16 riders (spread): ids, sizes, links, no rematch before the final", () => {
		const result = build(16, spreadOf(preset("Single elimination")));
		const { rounds, links, warnings } = result;
		expect(rounds.map((r) => r.id)).toEqual(["r1", "r2", "final"]);
		expect(rounds[0]?.heats.map((h) => h.id)).toEqual([
			"r1-1",
			"r1-2",
			"r1-3",
			"r1-4",
		]);
		expect(result.sizes).toEqual({ r1: [4, 4, 4, 4], r2: [4, 4], final: [4] });
		expect(rounds[0]?.maxPerHeat).toBe(4);
		expect(rounds[0]?.advancing).toBe(2);
		expect(rounds[1]?.maxPerHeat).toBe(4);
		expect(rounds[2]?.maxPerHeat).toBe(4);
		expect(rounds[2]?.advancing).toBe(0);

		const intoR2 = links.filter(
			(l) => l.to !== "eliminated" && l.to.heatId.startsWith("r2-"),
		);
		expect(intoR2).toHaveLength(8);
		for (const target of ["r2-1", "r2-2"]) {
			const sources = intoR2
				.filter((l) => l.to !== "eliminated" && l.to.heatId === target)
				.map((l) => l.from.heatId);
			expect(sources).toHaveLength(4);
			expect(new Set(sources).size).toBe(4);
		}
		expect(links.filter((l) => l.to === "eliminated")).toHaveLength(8 + 4 + 4);
		expect(
			warnings.filter((w) => w.code === "REMATCH" && w.roundId !== "final"),
		).toEqual([]);
	});

	test("every rider of the first round is placed once, seeds are dealt first", () => {
		const list = entries(8, (i) => (i >= 4 ? { seed: 8 - i } : {}));
		const result = buildFromFormat(
			{ entries: list, rounds: [] },
			preset("Single elimination"),
			5,
		);
		if (!result.ok) throw new Error("build failed");
		const placed = result.rounds.flatMap((r) =>
			r.heats.flatMap((h) => h.slots.map((s) => s.riderId)),
		);
		expect([...placed].sort()).toEqual(list.map((e) => e.riderId));
		// seeds 1..4 are p08, p07, p06, p05: one per heat, best seed in heat 1
		const firstOfHeats = result.rounds[0]?.heats.map(
			(h) => h.slots[0]?.riderId,
		);
		expect(firstOfHeats).toEqual(["p08", "p07", "p06", "p05"]);
		expect(
			result.rounds[0]?.heats
				.flatMap((h) => h.slots)
				.every((s) => s.rank === null),
		).toBe(true);
	});

	describe("placement", () => {
		const withPlacement = (placement?: "branch" | "spread") =>
			format({
				rounds: [
					{
						key: "r1",
						name: "Round 1",
						heats: 4,
						outcomes: [{ ranks: [1, 2], to: "r2" }],
					},
					{
						key: "r2",
						name: "Round 2",
						heats: 2,
						...(placement && { placement }),
					},
				],
			});
		const sourcesOfR2Heat = (
			placement: "branch" | "spread" | undefined,
			h: number,
		) =>
			build(16, withPlacement(placement)).links.flatMap((l) =>
				l.to !== "eliminated" && l.to.heatId === `r2-${h}`
					? [`${l.from.heatId}#${l.from.rank}`]
					: [],
			);

		test("branch is the default: r2-1 only gets riders from r1-1 and r1-2", () => {
			for (const placement of [undefined, "branch" as const]) {
				const sources = sourcesOfR2Heat(placement, 1);
				expect(sources).toHaveLength(4);
				expect(sources.sort()).toEqual([
					"r1-1#1",
					"r1-1#2",
					"r1-2#1",
					"r1-2#2",
				]);
			}
		});

		test("spread deals the 1st of heats 1 and 4 into r2-1", () => {
			const sources = sourcesOfR2Heat("spread", 1);
			expect(sources).toContain("r1-1#1");
			expect(sources).toContain("r1-4#1");
		});
	});

	test("no rematch is reported for a round with a single heat", () => {
		const f = format({
			rounds: [
				{
					key: "a",
					name: "A",
					heats: 1,
					outcomes: [{ ranks: [1, 2], to: "b" }],
				},
				{ key: "b", name: "B", heats: 1 },
			],
		});
		const { warnings } = build(4, f);
		expect(warnings).toEqual([]);
	});

	test("warns when there are fewer riders than heats", () => {
		const f = format({ rounds: [{ key: "a", name: "A", heats: 4 }] });
		const { warnings, rounds } = build(2, f);
		expect(warnings).toEqual([
			{ code: "TOO_MANY_HEATS", roundId: "a", riders: 2, heats: 4 },
		]);
		expect(sizes(rounds[0] as BuiltRound)).toEqual([1, 1, 0, 0]);
	});

	test("same seed gives the same result, another seed reshuffles unseeded riders", () => {
		const f = preset("Chained repechage");
		expect(build(13, f, 7)).toEqual(build(13, f, 7));
		expect(build(13, f, 8).rounds).not.toEqual(build(13, f, 7).rounds);
	});

	test("draw mode shuffles tickets deterministically and stays valid", () => {
		const spread = spreadOf(preset("Single elimination"));
		const f = { ...spread, fill: "draw" as const };
		const a = build(16, f, 3);
		expect(a).toEqual(build(16, f, 3));
		expect(a.links).not.toEqual(build(16, spread, 3).links);
		const intoR2 = a.links.filter(
			(l) => l.to !== "eliminated" && l.to.heatId.startsWith("r2-"),
		);
		expect(intoR2).toHaveLength(8);
		expect(
			new Set(intoR2.map((l) => `${l.from.heatId}#${l.from.rank}`)).size,
		).toBe(8);
	});

	test("late-entering seeds join their round first, sizes account for them", () => {
		const list = [
			...entries(8),
			{ riderId: "s1", displayName: "Seed 1", seed: 1, entryRoundId: "r2" },
			{ riderId: "s2", displayName: "Seed 2", seed: 2, entryRoundId: "r2" },
		];
		const result = buildFromFormat(
			{ entries: list, rounds: [] },
			preset("Single elimination"),
			1,
		);
		if (!result.ok) throw new Error("build failed");
		const r2 = result.rounds[1] as BuiltRound;
		expect(result.sizes.r1).toEqual([2, 2, 2, 2]);
		// 2 seeds + 8 qualifiers over 2 heats
		expect(result.sizes.r2).toEqual([5, 5]);
		expect(r2.heats.map((h) => h.slots[0]?.riderId)).toEqual(["s1", "s2"]);
		expect(r2.maxPerHeat).toBe(5);
	});

	test("rider order inside a round follows the priority, ties are drawn from the seed", () => {
		const list: Entry[] = [
			{ riderId: "b", displayName: "b", seed: 2 },
			{ riderId: "a", displayName: "a", seed: 2 },
			{ riderId: "c", displayName: "c", seed: 1 },
			{ riderId: "z", displayName: "z" },
		];
		const f = format({ rounds: [{ key: "a", name: "A", heats: 1 }] });
		const order = (seed: number) => {
			const result = buildFromFormat({ entries: list, rounds: [] }, f, seed);
			if (!result.ok) throw new Error("build failed");
			return result.rounds[0]?.heats[0]?.slots.map((s) => s.riderId);
		};
		expect(order(1)).toEqual(order(1));
		const variants = new Set(
			[1, 17, 400, 12345, 99999, 31337, 2 ** 20].map((s) =>
				(order(s) ?? []).slice(1, 3).join(""),
			),
		);
		expect([...variants].sort()).toEqual(["ab", "ba"]);
		for (const s of [1, 2, 3]) {
			expect(order(s)?.[0]).toBe("c");
			expect(order(s)?.[3]).toBe("z");
		}
	});

	describe("seeds entering a round", () => {
		const twoRounds = (seedSlots?: number) =>
			format({
				rounds: [
					{
						key: "r1",
						name: "R1",
						heats: 2,
						outcomes: [{ ranks: [1, 2], to: "final" }],
					},
					{
						key: "final",
						name: "Final",
						heats: 1,
						...(seedSlots && { seedSlots }),
					},
				],
			});
		const threeRounds = (seedSlots: Record<string, number>) =>
			format({
				rounds: [
					{
						key: "r1",
						name: "R1",
						heats: 4,
						outcomes: [{ ranks: [1, 2], to: "r2" }],
					},
					{
						key: "r2",
						name: "R2",
						heats: 2,
						seedSlots: seedSlots.r2,
						outcomes: [{ ranks: [1, 2], to: "final" }],
					},
					{ key: "final", name: "Final", heats: 1, seedSlots: seedSlots.final },
				],
			});
		const run = (
			list: Entry[],
			f: FormatSettings,
			drawSeed = 1,
			planned = 0,
		) => {
			const result = buildFromFormat(
				{ entries: list, rounds: [] },
				f,
				drawSeed,
				planned,
			);
			if (!result.ok) throw new Error("build failed");
			return result;
		};
		const idsOf = (round: BuiltRound | undefined) =>
			(round?.heats ?? []).map((h) => h.slots.map((s) => s.riderId));

		test("32 riders with 4 seeds entering round 2: round 1 has 28 riders, round 2 gets the qualifiers and the seeds", () => {
			const f = threeRounds({ r2: 4 });
			const result = run(entries(32), f);
			expect(result.sizes.r1).toEqual([7, 7, 7, 7]);
			expect(result.sizes.r2?.reduce((a, b) => a + b, 0)).toBe(8 + 4);
			expect(result.rounds[0]?.heats.flatMap((h) => h.slots)).toHaveLength(28);
			expect(result.rounds[1]?.heats.flatMap((h) => h.slots)).toHaveLength(4);
		});

		test("seeds are taken in priority order within the places of their round", () => {
			const list = entries(12, (i) =>
				i >= 8 ? { seed: 12 - i } : i === 7 ? { seed: 9 } : {},
			);
			// priorities: p12=1 p11=2 p10=3 p09=4 p08=9
			const result = run(list, twoRounds(4));
			expect(idsOf(result.rounds[1])).toEqual([["p12", "p11", "p10", "p09"]]);
			expect(result.rounds[0]?.heats.flatMap((h) => h.slots)).toHaveLength(8);
		});

		test("the best priorities go to the latest round and sit in different heats", () => {
			const list = entries(16, (i) => (i < 4 ? { seed: i + 1 } : {}));
			const result = run(list, threeRounds({ r2: 2, final: 2 }));
			expect(new Set(idsOf(result.rounds[2]).flat())).toEqual(
				new Set(["p01", "p02"]),
			);
			expect(new Set(idsOf(result.rounds[1]).flat())).toEqual(
				new Set(["p03", "p04"]),
			);
			const r2 = idsOf(result.rounds[1]);
			expect(r2.map((heat) => heat.length)).toEqual([1, 1]);
		});

		test("two seeds of a round go to different heats, the best one first", () => {
			const list = entries(10, (i) => (i < 2 ? { seed: 2 - i } : {}));
			const result = run(list, threeRounds({ r2: 2 }));
			expect(idsOf(result.rounds[1])).toEqual([["p02"], ["p01"]]);
		});

		test("ties within a priority are drawn, the same way for the same seed", () => {
			const list = entries(10, (i) => (i < 4 ? { seed: 1 } : {}));
			const chosen = (seed: number) =>
				idsOf(run(list, threeRounds({ r2: 1 }), seed).rounds[1])
					.flat()
					.join();
			expect(chosen(3)).toBe(chosen(3));
			expect(
				new Set([1, 2, 3, 4, 5, 6, 7, 8].map(chosen)).size,
			).toBeGreaterThan(1);
			for (const seed of [1, 2, 3, 4]) {
				expect(["p01", "p02", "p03", "p04"]).toContain(chosen(seed));
			}
		});

		test("a rider without priority comes after every rider that has one", () => {
			const list = entries(10, (i) => (i === 9 ? { seed: 5 } : {}));
			const result = run(list, threeRounds({ r2: 1 }), 9);
			expect(idsOf(result.rounds[1])).toEqual([["p10"], []]);
		});

		test("more seeds requested than priorities set: the next riders fill the places, drawn", () => {
			const list = entries(10, (i) => (i === 0 ? { seed: 1 } : {}));
			const f = threeRounds({ r2: 3 });
			const a = run(list, f, 4);
			const entering = idsOf(a.rounds[1]).flat();
			expect(entering).toHaveLength(3);
			expect(entering).toContain("p01");
			expect(idsOf(run(list, f, 4).rounds[1])).toEqual(idsOf(a.rounds[1]));
			const others = new Set(
				[1, 2, 3, 4, 5, 6].map((s) =>
					idsOf(run(list, f, s).rounds[1])
						.flat()
						.filter((id) => id !== "p01")
						.join(),
				),
			);
			expect(others.size).toBeGreaterThan(1);
		});

		test("riders with an explicit entry round are never taken as seeds", () => {
			const list = [
				...entries(8, (i) => (i === 0 ? { seed: 1 } : {})),
				{ riderId: "late", displayName: "late", seed: 1, entryRoundId: "r2" },
			];
			const result = run(list, threeRounds({ r2: 1 }));
			expect(idsOf(result.rounds[1]).flat().sort()).toEqual(["late", "p01"]);
		});

		test("planned riders keep the rounds sized while seeds are missing", () => {
			const f = threeRounds({ r2: 4 });
			const result = run(entries(2), f, 1, 32);
			expect(result.sizes.r1).toEqual([7, 7, 7, 7]);
			expect(result.sizes.r2?.reduce((a, b) => a + b, 0)).toBe(8 + 4);
		});

		test("the same inputs build the same bracket", () => {
			const list = entries(16, (i) => (i < 2 ? { seed: 1 } : {}));
			expect(run(list, twoRounds(2), 5)).toEqual(run(list, twoRounds(2), 5));
		});
	});

	test("an entry round outside the format is refused", () => {
		const list = [{ riderId: "x", displayName: "x", entryRoundId: "zzz" }];
		expect(
			buildFromFormat(
				{ entries: list, rounds: [] },
				preset("Single elimination"),
				1,
			),
		).toEqual({
			ok: false,
			code: "UNKNOWN_ROUND",
			riderId: "x",
			entryRoundId: "zzz",
		});
	});

	test("advancing follows the outcomes of the same group, else all outcomes, else 0 (no destination)", () => {
		const { rounds } = build(16, doubleOf("duels"));
		const byId = Object.fromEntries(rounds.map((r) => [r.id, r]));
		expect(byId.r1?.advancing).toBe(2);
		expect(byId.r1?.group).toBe("main");
		expect(byId.d1?.group).toBe("double");
		expect(byId.d1?.advancing).toBe(2);
		expect(byId.d7?.advancing).toBe(1);
		const chained = build(16, preset("Chained repechage")).rounds;
		expect(chained[0]?.advancing).toBe(2);
		expect(chained.at(-1)?.advancing).toBe(0);
		const crossGroup = format({
			rounds: [
				{
					key: "a",
					name: "A",
					heats: 2,
					outcomes: [{ ranks: [1, 3], to: "b" }],
				},
				{ key: "b", name: "B", group: "other", heats: 1 },
			],
		});
		expect(build(8, crossGroup).rounds[0]?.advancing).toBe(3);
	});

	test("a final and an optional small final have no qualifiers", () => {
		const withSmallFinal = format({
			rounds: [
				{
					key: "semi",
					name: "Semi",
					heats: 2,
					outcomes: [
						{ ranks: [1, 2], to: "final" },
						{ ranks: [3, 100], to: "small-final" },
					],
				},
				{ key: "small-final", name: "Small final", heats: 1, optional: true },
				{ key: "final", name: "Final", heats: 1 },
			],
		});
		const byId = Object.fromEntries(
			build(8, withSmallFinal).rounds.map((r) => [r.id, r]),
		);
		expect(byId.semi?.advancing).toBe(2);
		expect(byId["small-final"]?.advancing).toBe(0);
		expect(byId.final?.advancing).toBe(0);
	});

	test("advancing caps an open-ended outcome at the largest heat of the round", () => {
		const chained = format({
			rounds: [
				{
					key: "a",
					name: "A",
					heats: 2,
					outcomes: [
						{ ranks: [1, 2], to: "final" },
						{ ranks: [3, 100], to: "rep-a" },
					],
				},
				{
					key: "rep-a",
					name: "Repechage",
					group: "repechage",
					heats: 2,
					outcomes: [
						{ ranks: [1, 2], to: "final" },
						{ ranks: [3, 100], to: "rep-rep-a" },
					],
				},
				{
					key: "rep-rep-a",
					name: "Repechage of the repechage",
					group: "repechage",
					heats: 1,
					outcomes: [{ ranks: [1, 2], to: "final" }],
				},
				{ key: "final", name: "Final", heats: 1 },
			],
		});
		const { rounds, sizes } = build(16, chained);
		const byId = Object.fromEntries(rounds.map((r) => [r.id, r]));
		expect(byId.a?.advancing).toBe(2);
		expect(sizes["rep-a"]).toEqual([6, 6]);
		expect(byId["rep-a"]?.advancing).toBe(6);
		expect(byId["rep-rep-a"]?.advancing).toBe(2);
	});

	test("an optional round is flagged and filled like the others", () => {
		const { rounds, sizes } = build(16, doubleOf("duels"));
		expect(rounds.at(-1)).toMatchObject({ id: "super-final", optional: true });
		expect(sizes["super-final"]).toEqual([2]);
		expect(rounds[0]?.optional).toBeUndefined();
	});
});

describe("presets with 9, 12 and 16 riders", () => {
	const expected: Record<string, Record<number, Record<string, number[]>>> = {
		"Single elimination": {
			9: { r1: [3, 2, 2, 2], r2: [4, 4], final: [4] },
			12: { r1: [3, 3, 3, 3], r2: [4, 4], final: [4] },
			16: { r1: [4, 4, 4, 4], r2: [4, 4], final: [4] },
		},
		"Chained repechage": {
			9: {
				r1: [3, 2, 2, 2],
				"rep-r1": [1, 0],
				r2: [4, 4],
				"rep-r2": [3, 2],
				r3: [4],
				"rep-r3": [6],
				final: [4],
			},
			12: {
				r1: [3, 3, 3, 3],
				"rep-r1": [2, 2],
				r2: [4, 4],
				"rep-r2": [4, 4],
				r3: [4],
				"rep-r3": [6],
				final: [4],
			},
			16: {
				r1: [4, 4, 4, 4],
				"rep-r1": [4, 4],
				r2: [4, 4],
				"rep-r2": [4, 4],
				r3: [4],
				"rep-r3": [6],
				final: [4],
			},
		},
	};

	for (const [name, byCount] of Object.entries(expected)) {
		for (const [count, bySizes] of Object.entries(byCount)) {
			test(`${name}, ${count} riders: heat sizes and no empty heat`, () => {
				const { sizes, warnings } = build(Number(count), preset(name));
				expect(sizes).toEqual(bySizes);
				// 9 riders: heats of 2-3 leave only one rider for the first repechage
				// round, so its second heat is empty (known preset limit).
				const tooMany = warnings.filter((w) => w.code === "TOO_MANY_HEATS");
				const emptyRounds = Object.entries(sizes)
					.filter(([, s]) => s.some((n) => n === 0))
					.map(([id]) => id);
				expect(tooMany.map((w) => w.roundId)).toEqual(emptyRounds);
				expect(emptyRounds).toEqual(
					count === "9" && name !== "Single elimination" ? ["rep-r1"] : [],
				);
			});
		}
	}

	test("presets never report a rematch", () => {
		for (const f of formatPresets) {
			for (const count of [9, 12, 16]) {
				const { warnings } = build(count, f);
				expect(warnings.filter((w) => w.code === "REMATCH")).toEqual([]);
			}
		}
	});
});
