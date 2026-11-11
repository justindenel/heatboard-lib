import { describe, expect, it } from "vitest";
import {
	scoringPresets,
	type Bracket,
	type ScoringConfig,
} from "@heatboard/core";
import {
	changedSections,
	diffParts,
	draftOf,
	issueSection,
	issuesOf,
	planOf,
	withScoring,
	type FormatDraft,
} from "../components/raceFormatDraft";

const bracket = (overrides: Partial<Bracket> = {}): Bracket => ({
	id: "b",
	name: "B",
	entries: [],
	rounds: [],
	links: [],
	status: "draft",
	visibility: "private",
	...overrides,
});

const draft = (
	scoring: ScoringConfig | null,
	mode: FormatDraft["mode"] = "free",
): FormatDraft => ({ scoring, mode });

const wave = scoringPresets.windsurfWave;
const paths = (d: FormatDraft) => issuesOf(d).map((i) => `${i.path}:${i.code}`);

describe("issuesOf", () => {
	it("finds nothing wrong with the examples nor with manual ranking", () => {
		expect(issuesOf(draft(null))).toEqual([]);
		for (const preset of Object.values(scoringPresets)) {
			expect(
				issuesOf(
					draft(preset, preset.method === "rideMeans" ? "headJudge" : "free"),
				),
			).toEqual([]);
		}
	});

	it("points at each category field", () => {
		const scoring: ScoringConfig = {
			...wave,
			categories: [
				{ type: "", counted: 0 },
				{ type: "Wave", counted: 1, coefficient: 0 },
				{ type: "Wave", counted: 1.5 },
			],
		};
		expect(paths(draft(scoring))).toEqual([
			"categories.0.type:categoryType",
			"categories.0.counted:categoryCounted",
			"categories.1.coefficient:categoryCoefficient",
			"categories.2.type:categoryDuplicate",
			"categories.2.counted:categoryCounted",
		]);
	});

	it("flags a missing category", () => {
		expect(paths(draft({ ...wave, categories: [] }))).toContain(
			"categories:noCategory",
		);
	});

	it("points at empty and repeated figure codes, family names and variants", () => {
		const jump = wave.categories[1]!;
		const scoring: ScoringConfig = {
			...wave,
			categories: [
				{
					...jump,
					families: [
						{ id: "a", name: "A" },
						{ id: "b", name: "A" },
						{ id: "c", name: " " },
					],
					figures: [
						{ code: "X", family: "a" },
						{ code: "X", family: "b" },
						{ code: " ", family: "c" },
					],
				},
			],
			variants: [
				{ code: "1H", name: "One hand", suffix: "1H" },
				{ code: "1H", name: "", suffix: "1H" },
				{ code: "", name: "Nothing", suffix: "" },
			],
		};
		expect(paths(draft(scoring))).toEqual([
			"categories.0.families.1.name:familyNameDuplicate",
			"categories.0.families.2.name:familyNameEmpty",
			"categories.0.figures.1.code:figureCodeDuplicate",
			"categories.0.figures.2.code:figureCodeEmpty",
			"variants.1.code:variantCodeDuplicate",
			"variants.1.name:variantNameEmpty",
			"variants.2.code:variantCodeEmpty",
		]);
	});

	it("reports the scale, the window, the tie-break and the mode", () => {
		const scoring: ScoringConfig = {
			...wave,
			scale: { min: 0, max: 7.3, step: 0.5 },
			alignWindowSec: 0,
			priorityType: "Nope",
			method: "rideMeans",
		};
		expect(paths(draft(scoring, "free"))).toEqual([
			"scale.max:scale.max",
			"priorityType:priorityType",
			"mode:rideMeansNeedsHeadJudge",
		]);
		expect(paths(draft({ ...wave, alignWindowSec: 0 }))).toEqual([
			"alignWindowSec:alignWindowSec",
		]);
	});

	it("falls back on the core check for what it does not know", () => {
		const jump = wave.categories[1]!;
		const orphan: ScoringConfig = {
			...wave,
			categories: [{ ...jump, figures: [{ code: "Z", family: "gone" }] }],
		};
		expect(paths(draft(orphan))).toEqual([
			"categories.0.figures.0.family:scoringInvalid",
		]);
	});

	it("sorts the problems into the parts of the panel", () => {
		const at = (path: string) => issueSection({ path, code: "x" });
		expect(at("mode")).toBe("mode");
		expect(at("scale.max")).toBe("details");
		expect(at("alignWindowSec")).toBe("details");
		expect(at("priorityType")).toBe("details");
		expect(at("categories.0.type")).toBe("categories");
		expect(at("variants.0.code")).toBe("categories");
	});
});

describe("the draft against the bracket", () => {
	it("starts from the scoring and the mode in force", () => {
		expect(draftOf(bracket())).toEqual({ scoring: null, mode: "free" });
		expect(
			draftOf(bracket({ scoring: wave, judgingMode: "headJudge" })),
		).toEqual({ scoring: wave, mode: "headJudge" });
	});

	it("moves to head-judge mode with ride means", () => {
		const next = withScoring(draft(wave), { ...wave, method: "rideMeans" });
		expect(next.mode).toBe("headJudge");
		expect(withScoring(draft(wave, "free"), null).mode).toBe("free");
	});

	it("tells which parts changed, timing included", () => {
		const base = bracket({ scoring: wave, timing: { heatDurationSec: 600 } });
		const same = changedSections(base, draft(wave), { heatDurationSec: 600 });
		expect(same).toEqual({ timing: false, scoring: false, mode: false });
		const changed = changedSections(
			base,
			draft({ ...wave, method: "placings" }, "free"),
			{ heatDurationSec: 720, breakSec: 120 },
		);
		expect(changed).toEqual({ timing: true, scoring: true, mode: false });
		expect(changedSections(base, draft(wave), undefined).timing).toBe(false);
	});

	it("builds one setRaceFormat with only what changed, or nothing", () => {
		const none = { timing: false, scoring: false, mode: false };
		expect(planOf(none, draft(wave), { heatDurationSec: 1 })).toEqual([]);
		expect(
			planOf(
				{ timing: true, scoring: true, mode: true },
				draft(null, "headJudge"),
				{ heatDurationSec: 720 },
			),
		).toEqual([
			{
				type: "setRaceFormat",
				timing: { heatDurationSec: 720 },
				scoring: null,
				judgingMode: "headJudge",
			},
		]);
		expect(
			planOf({ timing: true, scoring: false, mode: false }, draft(wave), {}),
		).toEqual([{ type: "setRaceFormat", timing: {} }]);
	});
});

describe("diffParts", () => {
	it("marks the parts the after line adds", () => {
		expect(
			diffParts(["Heat 10 min", "Points"], ["Heat 12 min", "Points"]),
		).toEqual([
			{ text: "Heat 12 min", changed: true },
			{ text: "Points", changed: false },
		]);
	});
});
