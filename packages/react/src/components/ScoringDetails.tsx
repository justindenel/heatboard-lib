import { useId, useState, type ReactNode } from "react";
import {
	localiseScoring,
	type Aggregation,
	type ScoringConfig,
} from "@heatboard/core";
import { Field, SelectField, parseNumber, parseOptionalNumber } from "./fields";
import { useHeatboardConfig } from "../config";
import { ChevronIcon } from "./icons";
import { useRaceFormatEditor } from "./raceFormatContext";
import {
	issueAt,
	issueSection,
	without,
	withScoring,
	type Template,
	TEMPLATES,
} from "./raceFormatDraft";
import { cx, useBoardSettings } from "./settings";

const AGGREGATIONS: readonly Aggregation[] = ["mean", "trimmedMean", "sum"];

/** Block that opens by itself while it holds a problem, so none is ever hidden in a closed block. */
function Disclosure(props: {
	title: string;
	summary: string;
	errors?: number;
	children: ReactNode;
}) {
	const settings = useBoardSettings();
	const { labels } = settings;
	const [open, setOpen] = useState(false);
	const errors = props.errors ?? 0;
	const inner = (cls: string) => cx(!settings.unstyled && cls);
	return (
		<details
			className={inner("hb-disclosure")}
			open={open || errors > 0}
			onToggle={(event) => setOpen(event.currentTarget.open)}
		>
			<summary className={inner("hb-disclosure__summary")}>
				<span className={inner("hb-disclosure__text")}>
					<b>
						{props.title}
						{errors > 0 && (
							<span className={inner("hb-format-tag hb-format-tag--error")}>
								{labels.raceFormatEditor.errors(errors)}
							</span>
						)}
					</b>
					<span>{props.summary}</span>
				</span>
				<span className={inner("hb-disclosure__chevron")}>
					<ChevronIcon up={false} />
				</span>
			</summary>
			<div className={inner("hb-disclosure__body")}>{props.children}</div>
		</details>
	);
}

/** Scale, notes of the judges, tie-break and alignment window; closed, its summary lists the values in force. */
export function ScoringDetails() {
	const editor = useRaceFormatEditor();
	const settings = useBoardSettings();
	const { labels } = settings;
	const { scoring, draft, issues } = editor;
	const scaleId = useId();
	if (!scoring) return null;
	const inner = (cls: string) => cx(!settings.unstyled && cls);
	const words = labels.scoringDetailsSummary;
	const problems = issues.filter((i) => issueSection(i) === "details");
	const free = draft.mode === "free";
	const scaleProblems = problems.filter((i) => i.path.startsWith("scale."));
	const message = (code: string) =>
		labels.scoringProblems[code] ?? labels.errorGeneric;
	const summary = [
		words.scale(scoring.scale.min, scoring.scale.max, scoring.scale.step),
		words.aggregation(scoring.aggregation),
		words.tieBreak(scoring.priorityType),
		...(free ? [words.window(scoring.alignWindowSec ?? 30)] : []),
	].join(" · ");

	return (
		<Disclosure
			title={labels.scoringDetails}
			summary={summary}
			errors={problems.length}
		>
			<div
				className={inner("hb-scoring__field")}
				role="group"
				aria-labelledby={scaleId}
			>
				<span id={scaleId} className={inner("hb-scoring__legend")}>
					{labels.scoringScaleWords.label}
				</span>
				<div className={inner("hb-scoring__inline")}>
					{labels.scoringScaleWords.from}
					<Field
						label={labels.scoringScale.min}
						hideLabel="always"
						type="number"
						value={String(scoring.scale.min)}
						parse={parseNumber}
						invalid={issueAt(issues, "scale.min") !== undefined}
						onCommit={(min) =>
							editor.patchScoring((c) => ({ ...c, scale: { ...c.scale, min } }))
						}
					/>
					{labels.scoringScaleWords.to}
					<Field
						label={labels.scoringScale.max}
						hideLabel="always"
						type="number"
						value={String(scoring.scale.max)}
						parse={parseNumber}
						invalid={issueAt(issues, "scale.max") !== undefined}
						onCommit={(max) =>
							editor.patchScoring((c) => ({ ...c, scale: { ...c.scale, max } }))
						}
					/>
					{labels.scoringScaleWords.by}
					<SelectField
						label={labels.scoringScale.step}
						hideLabel="always"
						value={String(scoring.scale.step)}
						invalid={issueAt(issues, "scale.step") !== undefined}
						onChange={(step) =>
							editor.patchScoring((c) => ({
								...c,
								scale: { ...c.scale, step: Number(step) },
							}))
						}
					>
						<option value="0.5">0.5</option>
						<option value="1">1</option>
					</SelectField>
				</div>
				{scaleProblems.map((issue) => (
					<span key={issue.path} className={inner("hb-scoring__error")}>
						{message(issue.code)}
					</span>
				))}
			</div>
			<SelectField
				label={labels.scoringAggregation}
				value={scoring.aggregation}
				hint={labels.scoringAggregationHint}
				onChange={(aggregation) =>
					editor.patchScoring((c) => ({
						...c,
						aggregation: aggregation as Aggregation,
					}))
				}
			>
				{AGGREGATIONS.map((aggregation) => (
					<option key={aggregation} value={aggregation}>
						{labels.scoringAggregations[aggregation]}
					</option>
				))}
			</SelectField>
			{scoring.method === "placings" && (
				<label className={inner("hb-scoring__check")}>
					<input
						type="checkbox"
						checked={scoring.trimPlacings === true}
						onChange={(event) =>
							editor.patchScoring((c) =>
								event.target.checked
									? { ...c, trimPlacings: true }
									: without(c, "trimPlacings"),
							)
						}
					/>
					<span>{labels.scoringTrimPlacings}</span>
				</label>
			)}
			<SelectField
				label={labels.scoringPriorityType}
				value={scoring.priorityType ?? ""}
				error={issueAt(issues, "priorityType") && message("priorityType")}
				onChange={(value) =>
					editor.patchScoring((c) =>
						value === ""
							? without(c, "priorityType")
							: { ...c, priorityType: value },
					)
				}
			>
				<option value="">{labels.scoringNoPriority}</option>
				{scoring.categories
					.filter((c) => c.type !== "")
					.map((c) => (
						<option key={c.type} value={c.type}>
							{labels.scoringPriorityOption(c.type)}
						</option>
					))}
			</SelectField>
			{free ? (
				<Field
					label={labels.scoringAlignWindow}
					type="number"
					placeholder="30"
					suffix={<span>s</span>}
					value={
						scoring.alignWindowSec === undefined
							? ""
							: String(scoring.alignWindowSec)
					}
					parse={parseOptionalNumber}
					error={issueAt(issues, "alignWindowSec") && message("alignWindowSec")}
					hint={labels.scoringAlignWindowHint}
					onCommit={(value) =>
						editor.patchScoring((c) =>
							value === null
								? without(c, "alignWindowSec")
								: { ...c, alignWindowSec: value },
						)
					}
				/>
			) : (
				<p className={inner("hb-scoring__hint")}>
					{labels.scoringAlignWindowHidden}
				</p>
			)}
		</Disclosure>
	);
}

function templateDescription(
	template: Template,
	labels: ReturnType<typeof useBoardSettings>["labels"],
): string {
	const { scoring } = template;
	if (!scoring) return labels.scoringSentence.manual.split(":")[0] ?? "";
	return [
		labels.scoringMethods[scoring.method],
		scoring.categories
			.map((c) => labels.raceFormat.counted(c.counted, c.type))
			.join(" + "),
		...(template.judgingMode === "headJudge"
			? [labels.judgingModes.headJudge.toLowerCase()]
			: []),
	].join(" · ");
}

function sameScoring(a: ScoringConfig | null, b: ScoringConfig | null) {
	return JSON.stringify(a) === JSON.stringify(b);
}

/** Closed by default and last: examples replace the scoring and the mode being edited, nothing more. */
export function ScoringTemplates() {
	const editor = useRaceFormatEditor();
	const settings = useBoardSettings();
	const { labels } = settings;
	const { locale } = useHeatboardConfig();
	const inner = (cls: string) => cx(!settings.unstyled && cls);
	const imported = (template: Template) =>
		template.scoring && localiseScoring(template.scoring, locale);
	const choose = (template: Template) => {
		const next = withScoring(editor.draft, imported(template));
		editor.edit(
			template.judgingMode ? { ...next, mode: template.judgingMode } : next,
		);
	};
	const nameOf = (id: string) =>
		id === "manual"
			? labels.scoringMethods.manual
			: (labels.bracketTemplates[id]?.name ?? id);
	return (
		<Disclosure
			title={labels.scoringTemplates}
			summary={labels.scoringTemplatesHint}
		>
			<div
				role="group"
				aria-label={labels.scoringTemplates}
				className={inner("hb-scoring__templates")}
			>
				{TEMPLATES.map((template) => (
					<button
						key={template.id}
						type="button"
						className={inner("hb-scoring__template")}
						aria-pressed={sameScoring(editor.scoring, imported(template))}
						onClick={() => choose(template)}
					>
						<b>{nameOf(template.id)}</b>
						<small>{templateDescription(template, labels)}</small>
					</button>
				))}
			</div>
			<p className={inner("hb-scoring__hint")}>{labels.scoringTemplatesNote}</p>
		</Disclosure>
	);
}
