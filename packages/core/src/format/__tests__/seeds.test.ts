import { describe, expect, test } from "vitest";
import { createRandom } from "../../internal/random";
import type { Entry } from "../../model";
import { assignSeedRounds, orderByPriority } from "../seeds";

const entry = (riderId: string, seed?: number): Entry => ({
	riderId,
	displayName: riderId,
	...(seed !== undefined && { seed }),
});

describe("orderByPriority", () => {
	test("1 first, no priority last, ties drawn and reproducible", () => {
		const list = [entry("n1"), entry("b", 2), entry("a", 2), entry("c", 1)];
		const order = (seed: number) =>
			orderByPriority(list, createRandom(seed)).map((e) => e.riderId);
		expect(order(3)).toEqual(order(3));
		for (const seed of [1, 17, 400, 12345]) {
			const ids = order(seed);
			expect(ids[0]).toBe("c");
			expect(ids[3]).toBe("n1");
			expect(ids.slice(1, 3).sort()).toEqual(["a", "b"]);
		}
	});

	test("does not change its input", () => {
		const list = [entry("b", 2), entry("a", 1)];
		orderByPriority(list, createRandom(1));
		expect(list.map((e) => e.riderId)).toEqual(["b", "a"]);
	});
});

describe("assignSeedRounds", () => {
	const list = [entry("a", 1), entry("b", 2), entry("c", 3), entry("d")];

	test("the best priorities enter the latest round", () => {
		const assigned = assignSeedRounds(list, [0, 1, 2], 1);
		expect(Object.fromEntries(assigned)).toEqual({ a: 2, b: 2, c: 1 });
	});

	test("round 1 never takes seeds", () => {
		expect(assignSeedRounds(list, [3, 0], 1).size).toBe(0);
	});

	test("fewer riders than places: everybody is placed, nothing more", () => {
		expect(assignSeedRounds(list.slice(0, 2), [0, 5], 1).size).toBe(2);
	});

	test("riders without a priority fill the remaining places, drawn from the seed", () => {
		const riders = [entry("a", 1), entry("x"), entry("y"), entry("z")];
		const chosen = (seed: number) =>
			[...assignSeedRounds(riders, [0, 2], seed).keys()].sort().join();
		expect(chosen(9)).toBe(chosen(9));
		const seen = new Set<string>();
		for (const seed of [1, 17, 400, 12345, 99999, 31337]) {
			const ids = chosen(seed);
			expect(ids.startsWith("a,")).toBe(true);
			seen.add(ids);
		}
		expect(seen.size).toBeGreaterThan(1);
	});
});
