import { describe, expect, it } from "vitest";
import { scoringPresets } from "@heatboard/core";
import { figureText, judgeCategoriesOf } from "../components/judgeCategories";

describe("judgeCategoriesOf", () => {
	const [wave, jump] = judgeCategoriesOf(scoringPresets.windsurfWave);

	it("keeps the categories in order, without figures for a plain one", () => {
		expect(wave).toEqual({ type: "Wave", figures: [], groups: [] });
		expect(jump?.type).toBe("Jump");
		expect(jump?.figures).toHaveLength(23);
	});

	it("groups the figures by family in the organiser's order", () => {
		expect(jump?.groups.map((g) => g.name)).toEqual([
			"Forward",
			"Backward",
			"Combined",
			"Other",
		]);
		expect(jump?.groups.map((g) => g.index)).toEqual([0, 1, 2, 3]);
		expect(jump?.groups[0]?.figures.map((f) => f.code)).toEqual([
			"CR",
			"G",
			"F",
			"FPL",
			"AC",
			"AS",
		]);
	});

	it("resolves the variants a figure accepts", () => {
		const forward = jump?.groups[0]?.figures.find((f) => f.code === "F");
		expect(forward?.variants.map((v) => v.suffix)).toEqual([
			"1H",
			"1F",
			"1H1F",
			"SS",
			"CF",
		]);
		expect(
			jump?.groups[0]?.figures.find((f) => f.code === "CR")?.variants,
		).toEqual([]);
	});

	it("skips a family without figures and a variant that no longer exists", () => {
		const [category] = judgeCategoriesOf({
			...scoringPresets.windsurfWave,
			variants: [],
			categories: [
				{
					type: "Jump",
					counted: 1,
					families: [
						{ id: "a", name: "A" },
						{ id: "b", name: "B" },
					],
					figures: [{ code: "F", family: "b", variants: ["1H"] }],
				},
			],
		});
		expect(category?.groups.map((g) => g.id)).toEqual(["b"]);
		expect(category?.groups[0]?.index).toBe(1);
		expect(category?.groups[0]?.figures[0]?.variants).toEqual([]);
	});

	it("is empty without a scoring", () => {
		expect(judgeCategoriesOf(undefined)).toEqual([]);
	});
});

describe("figureText", () => {
	it("joins the figure and its variant", () => {
		expect(figureText("F", "1H")).toBe("F1H");
		expect(figureText("F", undefined)).toBe("F");
		expect(figureText(undefined, "1H")).toBeUndefined();
	});
});
