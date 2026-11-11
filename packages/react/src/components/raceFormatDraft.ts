import {
	bracketTemplates,
	validateScoring,
	type Action,
	type Bracket,
	type JudgingMode,
	type RaceFormat,
	type RaceTiming,
	type ScoringConfig,
	type ScoringMethod,
} from "@heatboard/core";

/** Scoring and judging mode being edited; `null` scoring is manual ranking. Timing belongs to the host. */
export interface FormatDraft {
	scoring: ScoringConfig | null;
	mode: JudgingMode;
}

export type MethodChoice = "manual" | ScoringMethod;

/** Where a problem sits (`categories.1.counted`, `scale.max`...) and which message explains it. */
export interface FormatIssue {
	path: string;
	code: string;
}

export interface Template {
	id: string;
	scoring: ScoringConfig | null;
	judgingMode?: JudgingMode;
}

/** One tile per distinct scoring: the templates that judge, then manual ranking. */
export const TEMPLATES: Template[] = [
	...bracketTemplates.filter((t) => t.scoring !== null),
	{ id: "manual", scoring: null },
];

export const BLANK: Omit<ScoringConfig, "method"> = {
	scale: { min: 0, max: 10, step: 1 },
	categories: [{ type: "", counted: 1 }],
	aggregation: "mean",
};

export function without<T extends object>(value: T, key: keyof T): T {
	const copy = { ...value };
	delete copy[key];
	return copy;
}

export function draftOf(bracket: Bracket): FormatDraft {
	return {
		scoring: bracket.scoring ?? null,
		mode: bracket.judgingMode ?? "free",
	};
}

/** Ride means only exist in head-judge mode: choosing them moves the bracket there. */
export function withScoring(
	draft: FormatDraft,
	scoring: ScoringConfig | null,
): FormatDraft {
	if (scoring?.method !== "rideMeans") return { ...draft, scoring };
	return { scoring, mode: "headJudge" };
}

export function sameDraft(a: FormatDraft, b: FormatDraft): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

/** Every problem that stops the draft from being saved, in the order of the panel. */
export function issuesOf(draft: FormatDraft): FormatIssue[] {
	const { scoring } = draft;
	if (!scoring) return [];
	const found: FormatIssue[] = [];
	const add = (path: string, code: string) => found.push({ path, code });
	const { categories } = scoring;

	if (categories.length === 0) add("categories", "noCategory");
	const seenTypes = new Set<string>();
	categories.forEach((category, c) => {
		const path = `categories.${c}`;
		if (category.type.trim() === "") add(`${path}.type`, "categoryType");
		else if (seenTypes.has(category.type)) {
			add(`${path}.type`, "categoryDuplicate");
		}
		seenTypes.add(category.type);
		if (!Number.isInteger(category.counted) || category.counted < 1) {
			add(`${path}.counted`, "categoryCounted");
		}
		if (category.coefficient !== undefined && !(category.coefficient > 0)) {
			add(`${path}.coefficient`, "categoryCoefficient");
		}
		const familyNames = new Set<string>();
		(category.families ?? []).forEach((family, f) => {
			const name = family.name.trim();
			if (name === "") add(`${path}.families.${f}.name`, "familyNameEmpty");
			else if (familyNames.has(name)) {
				add(`${path}.families.${f}.name`, "familyNameDuplicate");
			}
			familyNames.add(name);
		});
		const codes = new Set<string>();
		(category.figures ?? []).forEach((figure, f) => {
			const code = figure.code.trim();
			if (code === "") add(`${path}.figures.${f}.code`, "figureCodeEmpty");
			else if (codes.has(code)) {
				add(`${path}.figures.${f}.code`, "figureCodeDuplicate");
			}
			codes.add(code);
		});
	});

	const variantCodes = new Set<string>();
	(scoring.variants ?? []).forEach((variant, v) => {
		const code = variant.code.trim();
		if (code === "") add(`variants.${v}.code`, "variantCodeEmpty");
		else if (variantCodes.has(code)) {
			add(`variants.${v}.code`, "variantCodeDuplicate");
		}
		variantCodes.add(code);
		if (variant.name.trim() === "")
			add(`variants.${v}.name`, "variantNameEmpty");
	});

	const core = validateScoring(scoring);
	if (core?.field.startsWith("scale.")) add(core.field, core.field);
	else if (core?.field === "alignWindowSec") add(core.field, core.field);
	if (
		scoring.priorityType !== undefined &&
		!categories.some((c) => c.type === scoring.priorityType)
	) {
		add("priorityType", "priorityType");
	}
	if (scoring.method === "rideMeans" && draft.mode !== "headJudge") {
		add("mode", "rideMeansNeedsHeadJudge");
	}
	// Anything the checks above do not know about, such as a figure left in a family that no longer exists.
	if (found.length === 0 && core) add(core.field, "scoringInvalid");
	return found;
}

/** The part of the panel a problem belongs to, to badge the section. */
export function issueSection(
	issue: FormatIssue,
): "categories" | "mode" | "details" {
	if (issue.path === "mode") return "mode";
	return issue.path.startsWith("scale.") ||
		issue.path === "alignWindowSec" ||
		issue.path === "priorityType"
		? "details"
		: "categories";
}

export function issueAt(
	issues: readonly FormatIssue[],
	path: string,
): FormatIssue | undefined {
	return issues.find((issue) => issue.path === path);
}

/** Problems of a category and of its figures and families, for the card and the figures panel. */
export function issuesUnder(
	issues: readonly FormatIssue[],
	prefix: string,
): FormatIssue[] {
	return issues.filter(
		(issue) => issue.path === prefix || issue.path.startsWith(`${prefix}.`),
	);
}

export interface ChangedSections {
	timing: boolean;
	scoring: boolean;
	mode: boolean;
}

export function changedSections(
	bracket: Bracket,
	draft: FormatDraft,
	timing: RaceTiming | undefined,
): ChangedSections {
	const before = draftOf(bracket);
	const current = bracket.timing ?? {};
	return {
		timing:
			timing !== undefined &&
			(timing.heatDurationSec !== current.heatDurationSec ||
				timing.breakSec !== current.breakSec),
		scoring: JSON.stringify(before.scoring) !== JSON.stringify(draft.scoring),
		mode: before.mode !== draft.mode,
	};
}

/** The single action that brings the bracket to the draft; none when nothing changed. */
export function planOf(
	changed: ChangedSections,
	draft: FormatDraft,
	timing: RaceTiming | undefined,
): Action[] {
	if (!changed.timing && !changed.scoring && !changed.mode) return [];
	return [
		{
			type: "setRaceFormat",
			...(changed.timing && timing !== undefined && { timing }),
			...(changed.scoring && { scoring: draft.scoring }),
			...(changed.mode && { judgingMode: draft.mode }),
		},
	];
}

/** The race format once the draft is saved. */
export function formatOf(draft: FormatDraft, timing: RaceTiming): RaceFormat {
	return {
		timing,
		...(draft.scoring && { scoring: draft.scoring }),
		judgingMode: draft.mode,
	};
}

/** Parts of `after` that `before` does not have, to highlight what a save would change. */
export function diffParts(
	before: readonly string[],
	after: readonly string[],
): Array<{ text: string; changed: boolean }> {
	const known = new Set(before);
	return after.map((text) => ({ text, changed: !known.has(text) }));
}
