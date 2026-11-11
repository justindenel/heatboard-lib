import type { Heat, ViewerHeatResult } from "@heatboard/core";
import { describe, expect, it } from "vitest";
import { totalsOf } from "../components/heatTotals";
import { viewerSlots } from "../components/viewerOrder";

function heat(status: Heat["status"], slots: Heat["slots"]): Heat {
	return { id: "h", status, slots };
}

function result(
	riders: {
		riderId: string;
		rank: number;
		total: number;
		placingsSum?: number;
	}[],
): ViewerHeatResult {
	return {
		method: "points",
		mode: "free",
		unresolvedTie: false,
		riders: riders.map((r) => ({
			...r,
			tied: false,
			interferences: 0,
			dsqSuggested: false,
			missingScores: false,
		})),
	};
}

const ids = (list: { slot: { riderId: string } }[]) =>
	list.map((e) => e.slot.riderId);

describe("viewerSlots", () => {
	it("keeps the composition of a pending heat", () => {
		const slots = [
			{ riderId: "a", rank: null },
			{ riderId: "b", rank: null },
		];
		expect(ids(viewerSlots(heat("pending", slots), undefined))).toEqual([
			"a",
			"b",
		]);
	});

	it("follows the computed result of a started heat, keeping composition indexes", () => {
		const slots = [
			{ riderId: "a", rank: null },
			{ riderId: "b", rank: null },
			{ riderId: "c", rank: null },
		];
		const ordered = viewerSlots(
			heat("running", slots),
			result([
				{ riderId: "a", rank: 3, total: 1 },
				{ riderId: "b", rank: 1, total: 9 },
				{ riderId: "c", rank: 2, total: 5 },
			]),
		);
		expect(ids(ordered)).toEqual(["b", "c", "a"]);
		expect(ordered.map((e) => e.index)).toEqual([1, 2, 0]);
	});

	it("puts riders with a status after the ranked ones", () => {
		const slots = [
			{ riderId: "a", rank: null, status: "DNS" as const },
			{ riderId: "b", rank: null },
		];
		expect(
			ids(
				viewerSlots(
					heat("judged", slots),
					result([{ riderId: "b", rank: 1, total: 4 }]),
				),
			),
		).toEqual(["b", "a"]);
	});

	it("sorts a judged heat without result by slot rank", () => {
		const slots = [
			{ riderId: "a", rank: 2 },
			{ riderId: "b", rank: 1 },
			{ riderId: "c", rank: null },
		];
		expect(ids(viewerSlots(heat("judged", slots), undefined))).toEqual([
			"b",
			"a",
			"c",
		]);
	});
});

describe("totalsOf", () => {
	it("gives the place in the heat with the placings method, never the sum of places", () => {
		const totals = totalsOf({
			...result([
				{ riderId: "a", rank: 1, total: 12.5, placingsSum: 3 },
				{ riderId: "b", rank: 2, total: 9, placingsSum: 5 },
			]),
			method: "placings",
		});
		expect(totals.get("a")).toBe(1);
		expect(totals.get("b")).toBe(2);
	});

	it("keeps the points total with the other methods", () => {
		const totals = totalsOf(result([{ riderId: "a", rank: 1, total: 12.5 }]));
		expect(totals.get("a")).toBe(12.5);
	});
});
