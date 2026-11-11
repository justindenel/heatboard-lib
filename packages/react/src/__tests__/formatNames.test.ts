import { defaultPlan, formatFromPlan } from "@heatboard/core";
import { describe, expect, it } from "vitest";
import { doubleNamesOf, formatNamesOf } from "../formatNames";
import { labels } from "../labels";

describe("formatNamesOf", () => {
	it("names the rounds of a plan in French", () => {
		const plan = defaultPlan({
			riders: 26,
			heats: 7,
			advance: 2,
			repechage: true,
			smallFinal: true,
		});
		const format = formatFromPlan(plan, formatNamesOf(labels.fr));
		expect(format.rounds.map((r) => r.name)).toEqual([
			"Tour 1",
			"Repêchage 1",
			"Tour 2",
			"Tour 3",
			"Demi-finales",
			"Petite finale",
			"Finale",
		]);
	});

	it("names the quarter-finals and semi-finals", () => {
		const plan = defaultPlan({
			riders: 32,
			heats: 8,
			advance: 2,
			repechage: false,
		});
		expect(
			formatFromPlan(plan, formatNamesOf(labels.fr)).rounds.map((r) => r.name),
		).toEqual(["Tour 1", "Quarts", "Demi-finales", "Finale"]);
	});

	it("keeps the English names with the English labels", () => {
		const plan = defaultPlan({
			riders: 26,
			heats: 7,
			advance: 2,
			repechage: true,
			smallFinal: true,
		});
		expect(formatFromPlan(plan, formatNamesOf(labels.en))).toEqual(
			formatFromPlan(plan),
		);
	});
});

describe("doubleNamesOf", () => {
	it("keeps the position placeholder and the final names", () => {
		expect(doubleNamesOf(labels.fr)).toEqual({
			double: "Double {n}",
			doubleFinal: "Finale du double",
			superFinal: "Super finale",
		});
	});
});
