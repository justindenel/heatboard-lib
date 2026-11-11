import { describe, expect, it } from "vitest";
import { localiseScoring, scoringPresets } from "../presets";
import { scoringProblem } from "../validate";
import { computeHeatResult } from "../compute";
import { ride, score } from "./helpers";

describe("scoringPresets.windsurfWave", () => {
	const preset = scoringPresets.windsurfWave;
	const jump = preset.categories.find((c) => c.type === "Jump");

	it("has a valid config", () => {
		expect(scoringProblem(preset)).toBeUndefined();
	});

	it("has no family and no figure for waves", () => {
		expect(preset.categories[0]).toEqual({ type: "Wave", counted: 2 });
	});

	it("requires distinct families for jumps", () => {
		expect(jump?.distinctFamilies).toBe(true);
		expect(jump?.families?.map((f) => f.id)).toEqual([
			"forward",
			"backward",
			"combined",
			"other",
		]);
	});

	it("defines the figures of each family and their variants", () => {
		const byCode = new Map(jump?.figures?.map((f) => [f.code, f]));
		expect(byCode.size).toBe(23);
		expect(byCode.get("B")).toMatchObject({
			family: "backward",
			variants: ["1H", "1F", "1H1F", "SS", "CF"],
		});
		expect(byCode.get("P")?.variants).toEqual(["1H", "1F", "1H1F"]);
		expect(byCode.get("DF")?.variants).toEqual(["1H"]);
		expect(byCode.get("TT")?.variants).toBeUndefined();
		expect(preset.variants?.map((v) => v.code)).toEqual([
			"1H",
			"1F",
			"1H1F",
			"SS",
			"CF",
		]);
	});

	it("scores a listed figure and flags a figure on a wave", () => {
		const rides = [
			ride("r1", "a", "Jump", { figure: "B" }),
			ride("r2", "a", "Wave", { figure: "B" }),
		];
		const result = computeHeatResult(preset, ["a"], rides, [
			score("r1", "j1", 7.5),
			score("r2", "j1", 6),
		]);
		expect(result.issues.map((i) => [i.code, i.details?.rideId])).toEqual([
			["UNKNOWN_FIGURE", "r2"],
		]);
		expect(result.riders[0]?.total).toBe(13.5);
	});
});

describe("localiseScoring", () => {
	const jump = (config: typeof scoringPresets.windsurfWave) =>
		config.categories.find((c) => c.type === "Jump");

	it("writes family, variant and figure names in the French locale", () => {
		const fr = localiseScoring(scoringPresets.windsurfWave, "fr");
		expect(jump(fr)?.families?.map((f) => f.name)).toEqual([
			"Avant",
			"Arrière",
			"Combinée",
			"Autre",
		]);
		expect(fr.variants?.map((v) => v.name)).toEqual([
			"Une main",
			"Un pied",
			"Une main un pied",
			"Pieds inversés",
			"Fausse panne",
		]);
		expect(jump(fr)?.figures?.find((f) => f.code === "J")?.name).toBe("Saut");
		expect(scoringProblem(fr)).toBeUndefined();
	});

	it("keeps English names and leaves configs without families untouched", () => {
		const en = localiseScoring(scoringPresets.windsurfWave, "en");
		expect(en).toEqual(scoringPresets.windsurfWave);
		expect(localiseScoring(scoringPresets.surf, "fr")).toEqual(
			scoringPresets.surf,
		);
	});
});
