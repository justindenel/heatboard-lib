import {
	buildFromFormat,
	defaultPlan,
	formatFromPlan,
	type FormatPlan,
} from "@heatboard/core";
import { describe, expect, it } from "vitest";
import { heatMixes, roundColumns } from "../components/formatShapeLayout";

function planOf(riders: number, repechage: boolean, smallFinal = false) {
	return defaultPlan({ riders, heats: 7, advance: 2, repechage, smallFinal });
}

function built(plan: FormatPlan) {
	const format = formatFromPlan(plan);
	const entries = Array.from({ length: plan.riders }, (_, i) => ({
		riderId: `p${i + 1}`,
		displayName: `p${i + 1}`,
	}));
	const result = buildFromFormat({ entries, rounds: [] }, format, 0);
	if (!result.ok) throw new Error("build failed");
	return { format, result };
}

describe("heatMixes", () => {
	it("keeps the planned size of every heat", () => {
		const { format, result } = built(planOf(26, true));
		const mixes = heatMixes(format, result.sizes, result.links);
		for (const [key, sizes] of Object.entries(result.sizes)) {
			expect(mixes[key]!.map((m) => m.own + m.foreign)).toEqual(sizes);
		}
	});

	it("counts riders coming from the repechage apart from the main path", () => {
		const { format, result } = built(planOf(26, true));
		const mixes = heatMixes(format, result.sizes, result.links);
		const foreign = Object.values(mixes)
			.flat()
			.reduce((sum, m) => sum + m.foreign, 0);
		const repechageToMain = result.links.filter(
			(l) =>
				l.to !== "eliminated" &&
				l.from.heatId.startsWith("rep") &&
				!l.to.heatId.startsWith("rep"),
		).length;
		expect(foreign).toBe(repechageToMain);
		expect(foreign).toBeGreaterThan(0);
	});

	it("shows no foreign rider without repechage", () => {
		const { format, result } = built(planOf(26, false));
		const mixes = heatMixes(format, result.sizes, result.links);
		expect(
			Object.values(mixes)
				.flat()
				.every((m) => m.foreign === 0),
		).toBe(true);
	});
});

describe("roundColumns", () => {
	it("numbers main rounds in order and aligns the repechage under its source", () => {
		const format = formatFromPlan(planOf(26, true));
		const columns = roundColumns(format);
		const main = format.rounds.filter((r) => (r.group ?? "main") === "main");
		expect(main.map((r) => columns[r.key])).toEqual(main.map((_, i) => i));
		expect(columns["rep-r1"]).toBe(0);
	});

	it("puts the small final right after the final", () => {
		const format = formatFromPlan(planOf(26, false, true));
		const columns = roundColumns(format);
		expect(columns["small-final"]).toBe((columns["final"] ?? 0) + 1);
	});
});
