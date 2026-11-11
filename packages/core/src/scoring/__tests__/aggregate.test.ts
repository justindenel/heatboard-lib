import { describe, expect, it } from "vitest";
import {
	aggregateNotes,
	compareTieBreak,
	retain,
	type ValuedRide,
} from "../aggregate";
import { config } from "./helpers";

const valued = (rideId: string, type: string, value: number): ValuedRide => ({
	rideId,
	type,
	value,
});

describe("aggregateNotes", () => {
	it("is 0 when a ride has no notes, whatever the aggregation", () => {
		expect(aggregateNotes("mean", [])).toBe(0);
		expect(aggregateNotes("trimmedMean", [])).toBe(0);
		expect(aggregateNotes("sum", [])).toBe(0);
	});
});

describe("compareTieBreak with a priority type", () => {
	const cfg = config({
		categories: [
			{ type: "wave", counted: 1 },
			{ type: "jump", counted: 1 },
		],
		priorityType: "jump",
	});
	const withJump = retain(
		cfg,
		[valued("w", "wave", 500), valued("j", "jump", 300)],
		[],
	);
	const withoutJump = retain(cfg, [valued("w", "wave", 500)], []);

	it("favours the rider who has a kept ride of that type", () => {
		expect(compareTieBreak(cfg, withJump, withoutJump)).toBe(1);
		expect(compareTieBreak(cfg, withoutJump, withJump)).toBe(-1);
	});

	it("compares the best priority rides when both have one", () => {
		const better = retain(
			cfg,
			[valued("w", "wave", 500), valued("j", "jump", 400)],
			[],
		);
		expect(compareTieBreak(cfg, better, withJump)).toBe(100);
		expect(compareTieBreak(cfg, withJump, better)).toBe(-100);
	});

	it("falls back to the kept values when neither has the priority type", () => {
		const other = retain(cfg, [valued("w", "wave", 400)], []);
		expect(compareTieBreak(cfg, withoutJump, other)).toBe(100);
		expect(compareTieBreak(cfg, withoutJump, withoutJump)).toBe(0);
	});

	it("falls back to the kept values when the priority rides are equal", () => {
		const lowerWave = retain(
			cfg,
			[valued("w", "wave", 400), valued("j", "jump", 300)],
			[],
		);
		expect(compareTieBreak(cfg, withJump, lowerWave)).toBe(100);
	});
});
