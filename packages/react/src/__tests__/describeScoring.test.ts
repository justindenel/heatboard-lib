import { describe, expect, it } from "vitest";
import {
	localiseScoring,
	scoringPresets,
	type ScoringConfig,
} from "@heatboard/core";
import { describeScoring } from "../describeScoring";
import { labels } from "../labels";

const placingsWave: ScoringConfig = {
	...scoringPresets.windsurfWave,
	method: "placings",
	priorityType: "Wave",
};

describe("describeScoring", () => {
	it("writes the wave windsurf scoring in French", () => {
		expect(
			describeScoring(localiseScoring(placingsWave, "fr"), labels.fr),
		).toBe(
			"Chaque juge note de 0 à 10 par demi-point. " +
				"On garde les 2 meilleures notes de Wave et les 2 meilleures notes de Jump. " +
				"Les 2 Jump comptés doivent être de familles différentes (Avant, Arrière, Combinée, Autre). " +
				"Chaque juge classe les riders sur ses notes ; les places sont additionnées et la plus petite somme gagne. " +
				"En cas d'égalité, la meilleure note de Wave départage, puis la meilleure note isolée.",
		);
	});

	it("keeps the family names as stored when the example is not localised", () => {
		expect(describeScoring(placingsWave, labels.fr)).toContain(
			"(Forward, Backward, Combined, Other)",
		);
	});

	it("writes the same scoring in English", () => {
		expect(describeScoring(placingsWave, labels.en)).toBe(
			"Each judge scores from 0 to 10 in half-point steps. " +
				"We keep the 2 best Wave scores and the 2 best Jump scores. " +
				"The 2 counted Jump rides must be from different families (Forward, Backward, Combined, Other). " +
				"Each judge ranks the riders on their own scores; places are added up and the lowest sum wins. " +
				"Ties: the best Wave score decides, then the best single score.",
		);
	});

	it("describes manual ranking without a scale", () => {
		expect(describeScoring(null, labels.en)).toBe(
			"No judges: the order of each heat is entered by hand.",
		);
	});

	it("follows the method, the aggregation and the options", () => {
		const trimmed: ScoringConfig = {
			method: "placings",
			scale: { min: 0, max: 20, step: 1 },
			categories: [{ type: "Wave", counted: 1, coefficient: 1.5 }],
			aggregation: "mean",
			trimPlacings: true,
		};
		const sentence = describeScoring(trimmed, labels.en);
		expect(sentence).toContain("in whole points");
		expect(sentence).toContain("the best Wave score (x1.5)");
		expect(sentence).toContain("dropped (from 5 judges)");
		expect(sentence).toContain("Ties: the best single score decides.");

		const points = describeScoring(
			{ ...trimmed, method: "points", aggregation: "trimmedMean" },
			labels.fr,
		);
		expect(points).toContain("moyennés sans le plus haut ni le plus bas");

		const means = describeScoring(scoringPresets.surf, labels.fr);
		expect(means).toContain("Le chef-juge annonce chaque passage");
	});

	it("leaves out the families rule when it cannot apply", () => {
		const single: ScoringConfig = {
			...scoringPresets.windsurfWave,
			categories: [
				{
					type: "Jump",
					counted: 1,
					distinctFamilies: true,
					families: [
						{ id: "a", name: "A" },
						{ id: "b", name: "B" },
					],
				},
			],
		};
		expect(describeScoring(single, labels.en)).not.toContain("families");
	});

	it("ignores categories without a name", () => {
		const config: ScoringConfig = {
			...scoringPresets.windsurfFreestyle,
			categories: [{ type: "", counted: 1 }],
		};
		expect(describeScoring(config, labels.en)).not.toContain("We keep");
	});
});
