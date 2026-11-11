import { describe, expect, test } from "vitest";
import { applyAction } from "../actions";
import { buildFromFormat } from "../format/build";
import { formatFromPlan, planProblems } from "../format/plan";
import { parseFormat } from "../format/parse";
import { scoringProblem } from "../scoring/validate";
import {
	bracketTemplates,
	templatePlan,
	type BracketTemplate,
} from "../templates";
import { bracket } from "./fixtures";

describe("bracketTemplates", () => {
	test("lists the six templates", () => {
		expect(bracketTemplates.map((t) => t.id)).toEqual([
			"windsurfWave",
			"windsurfFreestyle",
			"surf",
			"kiteFreestyle",
			"slalom",
			"custom",
		]);
	});

	test.each(bracketTemplates.map((t) => [t.id, t] as const))(
		"%s has a valid scoring and a format that builds",
		(_id, template) => {
			if (template.scoring) {
				expect(scoringProblem(template.scoring)).toBeUndefined();
			}
			const plan = templatePlan(template, 16);
			expect(planProblems(plan)).toEqual([]);
			const format = formatFromPlan(plan);
			expect(parseFormat(format).ok).toBe(true);
			const entries = Array.from({ length: 16 }, (_, i) => ({
				riderId: `r${i}`,
				displayName: `R${i}`,
			}));
			const built = buildFromFormat({ entries, rounds: [] }, format, 1);
			expect(built.ok && built.warnings).toEqual([]);
		},
	);

	test("only windsurf wave has a repechage after round 1", () => {
		expect(
			bracketTemplates.filter((t) => t.format.repechage).map((t) => t.id),
		).toEqual(["windsurfWave"]);
		const wave = bracketTemplates.find(
			(t) => t.id === "windsurfWave",
		) as BracketTemplate;
		expect(templatePlan(wave, 16).rounds[0]?.repechage).toBeDefined();
	});

	test.each(bracketTemplates.map((t) => [t.id, t] as const))(
		"%s scoring and judging mode are accepted by the actions",
		(_id, template) => {
			let b = bracket([]);
			if (template.judgingMode) {
				const mode = applyAction(b, {
					type: "setRaceFormat",
					judgingMode: template.judgingMode,
				});
				expect(mode.ok).toBe(true);
				if (mode.ok) b = mode.bracket;
			}
			const result = applyAction(b, {
				type: "setRaceFormat",
				scoring: template.scoring,
			});
			expect(result.ok).toBe(true);
		},
	);

	test.each(bracketTemplates.map((t) => [t.id, t] as const))(
		"%s race defaults are accepted by setRaceFormat",
		(_id, template) => {
			if (!template.timing) return;
			const result = applyAction(bracket([]), {
				type: "setRaceFormat",
				timing: template.timing,
			});
			expect(result.ok && result.bracket.timing).toEqual(template.timing);
		},
	);

	test("race defaults of the examples", () => {
		const timing = Object.fromEntries(
			bracketTemplates.map((t) => [t.id, t.timing]),
		);
		expect(timing).toEqual({
			windsurfWave: { heatDurationSec: 600, breakSec: 120 },
			windsurfFreestyle: { heatDurationSec: 480, breakSec: 120 },
			surf: { heatDurationSec: 1200, breakSec: 180 },
			kiteFreestyle: { heatDurationSec: 480, breakSec: 120 },
			slalom: { breakSec: 300 },
			custom: undefined,
		});
	});

	test("only the head-judge scoring sets a judging mode", () => {
		expect(
			bracketTemplates.filter((t) => t.judgingMode).map((t) => t.id),
		).toEqual(["surf"]);
	});
});
