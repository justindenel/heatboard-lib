import { describe, expect, test } from "vitest";
import { balancedSizes, branchBlocks, dealAcross } from "../fill";

describe("branchBlocks", () => {
	const shape = (s: number, t: number) =>
		branchBlocks(s, t).map((b) => [b.source.length, b.target.length]);

	test("8 heats into 4: four blocks of 2 into 1", () => {
		expect(shape(8, 4)).toEqual([
			[2, 1],
			[2, 1],
			[2, 1],
			[2, 1],
		]);
		expect(branchBlocks(8, 4)[1]).toEqual({ source: [2, 3], target: [1] });
	});

	test("2 into 2: one block", () => {
		expect(branchBlocks(2, 2)).toEqual([{ source: [0, 1], target: [0, 1] }]);
	});

	test("4 into 4: two blocks of 2 into 2", () => {
		expect(branchBlocks(4, 4)).toEqual([
			{ source: [0, 1], target: [0, 1] },
			{ source: [2, 3], target: [2, 3] },
		]);
	});

	test("3 into 1 and 3 into 2: a single block", () => {
		expect(shape(3, 1)).toEqual([[3, 1]]);
		expect(shape(3, 2)).toEqual([[3, 2]]);
	});

	test("6 into 3: three blocks of 2 into 1", () => {
		expect(shape(6, 3)).toEqual([
			[2, 1],
			[2, 1],
			[2, 1],
		]);
	});
});

describe("balancedSizes", () => {
	test("gives the extra riders to the first heats", () => {
		expect(balancedSizes(10, 4)).toEqual([3, 3, 2, 2]);
		expect(balancedSizes(8, 4)).toEqual([2, 2, 2, 2]);
		expect(balancedSizes(2, 4)).toEqual([1, 1, 0, 0]);
	});
});

describe("dealAcross", () => {
	test("deals in serpentine order when there is no source", () => {
		const { heatOf, rematches } = dealAcross(
			[0, 1, 2, 3, 4, 5],
			[2, 2, 2],
			() => undefined,
		);
		expect(heatOf).toEqual([0, 1, 2, 2, 1, 0]);
		expect(rematches).toEqual([]);
	});

	test("16 riders from 4 heats into 2 heats: nobody meets a heat mate", () => {
		const tickets = [1, 2].flatMap((rank) =>
			[1, 2, 3, 4].map((heat) => ({ rank, heat: `h${heat}` })),
		);
		const { heatOf, rematches } = dealAcross(tickets, [4, 4], (t) => t.heat);
		expect(rematches).toEqual([]);
		for (const target of [0, 1]) {
			const sources = tickets
				.filter((_, k) => heatOf[k] === target)
				.map((t) => t.heat);
			expect(new Set(sources).size).toBe(sources.length);
			expect(sources).toHaveLength(4);
		}
	});

	test("reports a rematch when every heat already has a rider from the source", () => {
		const tickets = ["a", "a", "a"];
		const { heatOf, rematches } = dealAcross(tickets, [2, 1], (t) => t);
		expect(heatOf).toEqual([0, 1, 0]);
		expect(rematches).toEqual([2]);
	});

	test("a single target heat makes every second rider of a source a rematch", () => {
		const { rematches } = dealAcross(["a", "a", "b", "b"], [4], (t) => t);
		expect(rematches).toEqual([1, 3]);
	});

	test("keeps restricted items in their heats, crossing inside a block", () => {
		const items = [
			{ s: "a", heats: [0, 1] },
			{ s: "b", heats: [0, 1] },
			{ s: "a", heats: [0, 1] },
			{ s: "b", heats: [0, 1] },
			{ s: "c", heats: [2] },
			{ s: "d", heats: [2] },
		];
		const { heatOf, rematches } = dealAcross(
			items,
			[2, 2, 2],
			(i) => i.s,
			(i) => i.heats,
		);
		expect(heatOf).toEqual([0, 1, 1, 0, 2, 2]);
		expect(rematches).toEqual([]);
	});

	test("falls back to any heat with room when the allowed heats are full", () => {
		const { heatOf } = dealAcross(
			[0, 1, 2],
			[1, 2],
			() => undefined,
			() => [0],
		);
		expect(heatOf).toEqual([0, 1, 1]);
	});

	test("respects heat sizes", () => {
		const { heatOf } = dealAcross([0, 1, 2, 3, 4], [3, 2], () => undefined);
		expect(heatOf.filter((h) => h === 0)).toHaveLength(3);
		expect(heatOf.filter((h) => h === 1)).toHaveLength(2);
	});
});
