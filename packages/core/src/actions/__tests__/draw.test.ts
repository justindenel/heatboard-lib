import { describe, expect, test } from "vitest";
import {
	advanceHeat,
	bracket,
	errorCode,
	heat,
	okBracket,
	round,
} from "../../__tests__/fixtures";
import type { Bracket, Entry } from "../../model";

function build(
	entries: Entry[],
	heatCount: number,
	maxPerHeat = 4,
	extra: { r2?: boolean } = {},
): Bracket {
	return bracket(
		[
			round(
				"r1",
				Array.from({ length: heatCount }, (_, i) => heat(`h${i + 1}`)),
				{ maxPerHeat },
			),
			round("r2", [heat("f1", extra.r2 ? ["x"] : [])]),
		],
		{ status: "published", entries },
	);
}

const riders = (n: number, seeded = 0): Entry[] =>
	Array.from({ length: n }, (_, i) => ({
		riderId: `r${i + 1}`,
		displayName: `r${i + 1}`,
		...(i < seeded ? { seed: i + 1 } : {}),
	}));

const heatsOf = (b: Bracket, roundIndex = 0) =>
	(b.rounds[roundIndex]?.heats ?? []).map((h) => h.slots.map((s) => s.riderId));

const draw = (b: Bracket, drawSeed: number) =>
	okBracket(b, { type: "drawRound", roundId: "r1", drawSeed });

describe("drawRound", () => {
	test("same seed reproduces the draw, other seeds differ", () => {
		const b = build(riders(16), 4);
		expect(heatsOf(draw(b, 7))).toEqual(heatsOf(draw(b, 7)));
		const variants = new Set(
			[1, 2, 3, 4, 5].map((s) => JSON.stringify(heatsOf(draw(b, s)))),
		);
		expect(variants.size).toBeGreaterThan(1);
	});

	test("seeds are spread across heats", () => {
		const b = build(riders(12, 8), 4, 3);
		const heats = heatsOf(draw(b, 3));
		const heatOf = (id: string) => heats.findIndex((h) => h.includes(id));
		expect([1, 2, 3, 4].map((n) => heatOf(`r${n}`))).toEqual([0, 1, 2, 3]);
		expect([5, 6, 7, 8].map((n) => heatOf(`r${n}`))).toEqual([3, 2, 1, 0]);
	});

	test("seeds are ordered by seed, not by entry order", () => {
		const entries: Entry[] = [
			{ riderId: "b", displayName: "b", seed: 2 },
			{ riderId: "a", displayName: "a", seed: 1 },
		];
		const heats = heatsOf(draw(build(entries, 2), 1));
		expect(heats).toEqual([["a"], ["b"]]);
	});

	test("riders without a priority come after the others, ties are drawn", () => {
		const entries: Entry[] = [
			{ riderId: "x", displayName: "x" },
			{ riderId: "a", displayName: "a", seed: 3 },
			{ riderId: "b", displayName: "b", seed: 3 },
			{ riderId: "c", displayName: "c", seed: 1 },
		];
		const b = build(entries, 4, 1);
		const order = (s: number) => heatsOf(draw(b, s)).flat();
		expect(order(5)).toEqual(order(5));
		const seen = new Set<string>();
		for (const s of [1, 17, 400, 12345, 99999, 31337]) {
			const flat = order(s);
			expect(flat[0]).toBe("c");
			expect(flat[3]).toBe("x");
			seen.add(flat.slice(1, 3).join());
		}
		expect(seen.size).toBe(2);
	});

	test("a rider already placed in a later round is not drawn again", () => {
		const b = build(riders(4), 2, 4, { r2: true });
		const withSeed: Bracket = {
			...b,
			entries: [...b.entries, { riderId: "x", displayName: "x", seed: 1 }],
		};
		expect(heatsOf(draw(withSeed, 1)).flat()).not.toContain("x");
	});

	test("seeds 1 and 2 never share a heat", () => {
		const b = build(riders(10, 2), 3);
		for (let s = 0; s < 20; s++) {
			const heats = heatsOf(draw(b, s));
			expect(heats.some((h) => h.includes("r1") && h.includes("r2"))).toBe(
				false,
			);
		}
	});

	test("heat sizes differ by at most one and respect the maximum", () => {
		const b = build(riders(10, 3), 3);
		const sizes = heatsOf(draw(b, 5)).map((h) => h.length);
		expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
		expect(Math.max(...sizes)).toBeLessThanOrEqual(4);
		expect(sizes.reduce((a, c) => a + c, 0)).toBe(10);
	});

	test("refuses when riders exceed capacity", () => {
		expect(
			errorCode(build(riders(9), 2), {
				type: "drawRound",
				roundId: "r1",
				drawSeed: 1,
			}),
		).toBe("HEAT_FULL");
	});

	test("refuses unknown round and non-integer seed", () => {
		const b = build(riders(4), 2);
		expect(
			errorCode(b, { type: "drawRound", roundId: "zz", drawSeed: 1 }),
		).toBe("UNKNOWN_ROUND");
		expect(
			errorCode(b, { type: "drawRound", roundId: "r1", drawSeed: 1.5 }),
		).toBe("INVALID_ARGUMENT");
	});

	test("refuses once a heat has started, and on a validated bracket", () => {
		const started = advanceHeat(
			{
				...build(riders(4), 2),
				rounds: build(riders(4), 2).rounds.map((r, i) =>
					i === 0
						? {
								...r,
								heats: r.heats.map((h, j) =>
									j === 0
										? { ...h, slots: [{ riderId: "r1", rank: null }] }
										: h,
								),
							}
						: r,
				),
			},
			"h1",
			"running",
		);
		expect(
			errorCode(started, { type: "drawRound", roundId: "r1", drawSeed: 1 }),
		).toBe("ROUND_STARTED");
		expect(
			errorCode(
				{ ...build(riders(4), 2), status: "validated" },
				{ type: "drawRound", roundId: "r1", drawSeed: 1 },
			),
		).toBe("BRACKET_VALIDATED");
	});

	test("late entries are only drawn in their own round", () => {
		const entries: Entry[] = [
			...riders(4),
			{ riderId: "late", displayName: "late", entryRoundId: "r2" },
		];
		const b = build(entries, 2);
		expect(heatsOf(draw(b, 1)).flat()).not.toContain("late");
		const r2 = okBracket(b, { type: "drawRound", roundId: "r2", drawSeed: 1 });
		expect(heatsOf(r2, 1)).toEqual([["late"]]);
		expect(heatsOf(r2, 0)).toEqual(heatsOf(b, 0));
	});

	test("replaces composition and clears order and ranks", () => {
		const b = build(riders(4), 2);
		const dirty: Bracket = {
			...b,
			rounds: b.rounds.map((r, i) =>
				i === 0
					? {
							...r,
							heats: [
								heat("h1", ["r1", { id: "r2", status: "DNS" }], {
									order: ["r1"],
								}),
								heat("h2", ["r3"]),
							],
						}
					: r,
			),
		};
		const next = draw(dirty, 2);
		const heats = next.rounds[0]?.heats ?? [];
		expect(heats.flatMap((h) => h.slots.map((s) => s.riderId)).sort()).toEqual([
			"r1",
			"r2",
			"r3",
			"r4",
		]);
		for (const h of heats) {
			expect(h.order).toBeUndefined();
			for (const s of h.slots) {
				expect(s.rank).toBeNull();
				expect(s.status).toBeUndefined();
			}
		}
	});

	test("leaves other rounds untouched", () => {
		const b = build(riders(4), 2, 4, { r2: true });
		const next = draw(b, 9);
		expect(next.rounds[1]).toBe(b.rounds[1]);
		expect(next.entries).toBe(b.entries);
	});
});
