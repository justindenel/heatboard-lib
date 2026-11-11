import { describe, expect, it } from "vitest";
import {
	scoringPresets,
	type ScoringCategory,
	type ScoringConfig,
} from "@heatboard/core";
import {
	addFamily,
	addFigure,
	addVariant,
	figureCounts,
	groupsOf,
	moveFamily,
	moveFigureSpot,
	removeFamily,
	removeFigure,
	removeVariant,
	renameFamily,
	setDistinctFamilies,
	stepFigure,
	toggleFigureVariant,
	updateFigure,
	updateVariant,
} from "../components/figureEdits";

const category: ScoringCategory = {
	type: "Jump",
	counted: 2,
	distinctFamilies: true,
	families: [
		{ id: "a", name: "A" },
		{ id: "b", name: "B" },
		{ id: "c", name: "C" },
	],
	figures: [
		{ code: "A1", family: "a" },
		{ code: "A2", family: "a" },
		{ code: "B1", family: "b" },
		{ code: "C1", family: "c" },
	],
};

const codes = (c: ScoringCategory, family: string) =>
	groupsOf(c)
		.find((g) => g.family.id === family)
		?.figures.map((ref) => ref.figure.code);

describe("groupsOf", () => {
	it("lists the figures family by family, in the order of the families", () => {
		expect(groupsOf(category).map((g) => g.family.id)).toEqual(["a", "b", "c"]);
		expect(codes(category, "a")).toEqual(["A1", "A2"]);
	});

	it("is empty for a category without families", () => {
		expect(groupsOf({ type: "Wave", counted: 1 })).toEqual([]);
		expect(figureCounts({ type: "Wave", counted: 1 })).toEqual({
			figures: 0,
			families: 0,
		});
	});
});

describe("families", () => {
	it("adds a family with a fresh id and an empty name", () => {
		const { category: next, id } = addFamily(category);
		expect(id).toBe("family-4");
		expect(next.families?.at(-1)).toEqual({ id, name: "" });
		expect(addFamily({ type: "Wave", counted: 1 }).id).toBe("family-1");
	});

	it("renames and reorders a family", () => {
		expect(renameFamily(category, "b", "Back").families?.[1]?.name).toBe(
			"Back",
		);
		expect(moveFamily(category, "c", 0).families?.map((f) => f.id)).toEqual([
			"c",
			"a",
			"b",
		]);
		expect(moveFamily(category, "a", -3)).toBe(category);
		expect(moveFamily(category, "c", 9)).toBe(category);
	});

	it("moves the figures of a removed family into another one", () => {
		const next = removeFamily(category, "a", "c");
		expect(next.families?.map((f) => f.id)).toEqual(["b", "c"]);
		expect(codes(next, "c")).toEqual(["C1", "A1", "A2"]);
		expect(next.distinctFamilies).toBe(true);
	});

	it("drops the figures when no family is given, and the rule below two families", () => {
		const next = removeFamily(category, "a");
		expect(next.figures?.map((f) => f.code)).toEqual(["B1", "C1"]);
		const two = removeFamily(next, "b");
		expect(two.families).toHaveLength(1);
		expect(two).not.toHaveProperty("distinctFamilies");
		const none = removeFamily(removeFamily(two, "c"), "x");
		expect(none).not.toHaveProperty("families");
		expect(none).not.toHaveProperty("figures");
	});

	it("sets and clears the different-families rule", () => {
		expect(setDistinctFamilies(category, false)).not.toHaveProperty(
			"distinctFamilies",
		);
		expect(setDistinctFamilies({ ...category }, true).distinctFamilies).toBe(
			true,
		);
	});
});

describe("figures", () => {
	it("adds a figure at the end of its family", () => {
		const next = addFigure(category, "a");
		expect(codes(next, "a")).toEqual(["A1", "A2", ""]);
		expect(next.figures?.at(2)?.family).toBe("a");
	});

	it("updates the code and the name, an empty name meaning none", () => {
		const named = updateFigure(category, 0, { code: "X", name: "Ex" });
		expect(named.figures?.[0]).toEqual({ code: "X", name: "Ex", family: "a" });
		expect(updateFigure(named, 0, { name: "" }).figures?.[0]).toEqual({
			code: "X",
			family: "a",
		});
	});

	it("removes a figure and keeps the families", () => {
		const next = removeFigure(category, 2);
		expect(next.figures?.map((f) => f.code)).toEqual(["A1", "A2", "C1"]);
		expect(next.families).toHaveLength(3);
	});

	it("toggles an accepted variant", () => {
		const on = toggleFigureVariant(category, 0, "1H");
		expect(on.figures?.[0]?.variants).toEqual(["1H"]);
		const off = toggleFigureVariant(on, 0, "1H");
		expect(off.figures?.[0]).not.toHaveProperty("variants");
	});
});

describe("moving a figure", () => {
	it("moves it inside its family", () => {
		const next = moveFigureSpot(category, 0, { familyId: "a", position: 1 });
		expect(codes(next, "a")).toEqual(["A2", "A1"]);
	});

	it("moves it to another family, which changes its family", () => {
		const next = moveFigureSpot(category, 0, { familyId: "c", position: 0 });
		expect(codes(next, "c")).toEqual(["A1", "C1"]);
		expect(codes(next, "a")).toEqual(["A2"]);
		expect(next.figures?.find((f) => f.code === "A1")?.family).toBe("c");
	});

	it("ignores an unknown family or figure", () => {
		expect(moveFigureSpot(category, 0, { familyId: "z", position: 0 })).toBe(
			category,
		);
		expect(moveFigureSpot(category, 9, { familyId: "a", position: 0 })).toBe(
			category,
		);
	});

	it("steps through the family, then into the neighbouring one", () => {
		const down = stepFigure(category, 1, 1);
		expect(down?.spot).toEqual({ familyId: "b", position: 0 });
		expect(codes(down!.category, "b")).toEqual(["A2", "B1"]);

		const up = stepFigure(category, 2, -1);
		expect(up?.spot).toEqual({ familyId: "a", position: 2 });
		expect(codes(up!.category, "a")).toEqual(["A1", "A2", "B1"]);

		const inside = stepFigure(category, 1, -1);
		expect(inside?.spot).toEqual({ familyId: "a", position: 0 });
	});

	it("stops at the first and the last figure", () => {
		expect(stepFigure(category, 0, -1)).toBeUndefined();
		expect(stepFigure(category, 3, 1)).toBeUndefined();
	});

	it("steps over an empty family", () => {
		const withEmpty = addFamily(category, "Empty").category;
		const moved = stepFigure(withEmpty, 3, 1);
		expect(moved?.spot).toEqual({ familyId: "family-4", position: 0 });
	});
});

describe("variants shared by the figures", () => {
	const scoring: ScoringConfig = {
		...scoringPresets.windsurfWave,
	};

	it("adds an empty variant to fill in", () => {
		expect(addVariant(scoring).variants?.at(-1)).toEqual({
			code: "",
			name: "",
			suffix: "",
		});
	});

	it("renames a code everywhere it is accepted, keeping code and suffix together", () => {
		const next = updateVariant(scoring, 0, { code: "OH" });
		expect(next.variants?.[0]).toMatchObject({ code: "OH", suffix: "OH" });
		const jump = next.categories.find((c) => c.type === "Jump");
		expect(jump?.figures?.find((f) => f.code === "F")?.variants).toContain(
			"OH",
		);
		expect(jump?.figures?.find((f) => f.code === "F")?.variants).not.toContain(
			"1H",
		);
	});

	it("renames a variant without touching the figures", () => {
		const next = updateVariant(scoring, 0, { name: "One hand" });
		expect(next.variants?.[0]?.name).toBe("One hand");
		expect(next.categories).toBe(scoring.categories);
	});

	it("removes a variant from the list and from every figure", () => {
		const next = removeVariant(scoring, 0);
		expect(next.variants?.map((v) => v.code)).not.toContain("1H");
		const jump = next.categories.find((c) => c.type === "Jump");
		expect(jump?.figures?.some((f) => f.variants?.includes("1H"))).toBe(false);
		expect(jump?.figures?.find((f) => f.code === "DF")).not.toHaveProperty(
			"variants",
		);
	});
});
