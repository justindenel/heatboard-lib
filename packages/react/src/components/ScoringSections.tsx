import { useId, type ReactNode } from "react";
import { localiseScoring, type ScoringMethod } from "@heatboard/core";
import { useHeatboardConfig } from "../config";
import { describeScoring } from "../describeScoring";
import { Field, SelectField, parseNumber, parseOptionalNumber } from "./fields";
import { figureCounts, setDistinctFamilies } from "./figureEdits";
import { ChevronRightIcon, PlusIcon, TrashIcon } from "./icons";
import { RaceFormatSection } from "./RaceFormatSection";
import { useRaceFormatEditor } from "./raceFormatContext";
import {
	BLANK,
	issueAt,
	issueSection,
	issuesUnder,
	without,
	withScoring,
	type MethodChoice,
} from "./raceFormatDraft";
import { ScoringDetails, ScoringTemplates } from "./ScoringDetails";
import { cx, partProps, useBoardSettings } from "./settings";

const METHODS: readonly MethodChoice[] = [
	"manual",
	"placings",
	"points",
	"rideMeans",
];

/** The scoring part of the race format: scoring, judging mode, details and examples. `leading` sits above, in the same container. */
export function ScoringSections(props: { leading?: ReactNode }) {
	const settings = useBoardSettings();
	const root = partProps(settings, "scoringEditor", "hb-scoring");
	return (
		<div className={root.className} style={root.style}>
			{props.leading}
			<ScoringSection />
			<JudgingModeSection />
			<ScoringDetails />
			<ScoringTemplates />
		</div>
	);
}

function ScoringSection() {
	const editor = useRaceFormatEditor();
	const settings = useBoardSettings();
	const { labels } = settings;
	const { locale } = useHeatboardConfig();
	const { scoring, draft, issues } = editor;
	const button = partProps(settings, "button", "hb-button");
	const inner = (cls: string) => cx(!settings.unstyled && cls);
	const errors = issues.filter((i) => issueSection(i) === "categories");

	const starting = (method: ScoringMethod) => ({
		...localiseScoring(
			Object.values(editor.presets)[0] ?? { ...BLANK, method },
			locale,
		),
		method,
	});
	const changeMethod = (choice: MethodChoice) =>
		editor.edit(
			withScoring(
				draft,
				choice === "manual"
					? null
					: scoring
						? { ...scoring, method: choice }
						: starting(choice),
			),
		);

	return (
		<RaceFormatSection
			title={labels.scoringEditor}
			changed={editor.changed.scoring}
			errors={errors.length}
		>
			<SelectField
				label={labels.scoringMethod}
				className={inner("hb-scoring__method")}
				value={scoring?.method ?? "manual"}
				onChange={(value) => changeMethod(value as MethodChoice)}
			>
				{METHODS.map((method) => (
					<option key={method} value={method}>
						{labels.scoringMethods[method]}
					</option>
				))}
			</SelectField>
			{scoring && (
				<div className={inner("hb-scoring__categories")}>
					{issueAt(issues, "categories") && (
						<p className={inner("hb-scoring__error")} role="alert">
							{labels.scoringProblems.noCategory}
						</p>
					)}
					{scoring.categories.length > 0 && (
						<div className={inner("hb-scoring__cathead")} aria-hidden="true">
							<span>{labels.scoringColumns.category}</span>
							<span>{labels.scoringColumns.counted}</span>
							<span>{labels.scoringColumns.coefficient}</span>
						</div>
					)}
					<ul className={inner("hb-scoring__catlist")}>
						{scoring.categories.map((category, index) => (
							<CategoryCard key={index} index={index} />
						))}
					</ul>
					<div>
						<button
							type="button"
							className={cx(
								button.className,
								!settings.unstyled && "hb-scoring__add",
							)}
							style={button.style}
							onClick={() =>
								editor.patchScoring((c) => ({
									...c,
									categories: [...c.categories, { type: "", counted: 1 }],
								}))
							}
						>
							<PlusIcon />
							{labels.scoringAddCategory}
						</button>
					</div>
				</div>
			)}
			<div className={inner("hb-scoring__plain")}>
				<b>{labels.scoringPlain}</b>
				{describeScoring(scoring, labels)}
			</div>
		</RaceFormatSection>
	);
}

function CategoryCard(props: { index: number }) {
	const { index } = props;
	const editor = useRaceFormatEditor();
	const settings = useBoardSettings();
	const { labels } = settings;
	const messageId = useId();
	const category = editor.scoring?.categories[index];
	if (!category || !editor.scoring) return null;
	const inner = (cls: string) => cx(!settings.unstyled && cls);
	const iconButton = partProps(settings, "button", "hb-button hb-icon-button");
	const path = `categories.${index}`;
	const own = ["type", "counted", "coefficient"].flatMap((field) => {
		const issue = issueAt(editor.issues, `${path}.${field}`);
		return issue ? [issue] : [];
	});
	const invalid = (field: string) =>
		issueAt(editor.issues, `${path}.${field}`) !== undefined;
	const figureProblems =
		issuesUnder(editor.issues, `${path}.figures`).length +
		issuesUnder(editor.issues, `${path}.families`).length +
		issuesUnder(editor.issues, "variants").length;
	const counts = figureCounts(category);
	const summary =
		counts.figures === 0 && counts.families === 0
			? labels.scoringFiguresNone
			: labels.scoringFiguresSummary(counts.figures, counts.families);
	const { scoring } = editor;

	return (
		<li
			className={inner("hb-scoring__category")}
			data-invalid={own.length > 0 ? "" : undefined}
		>
			<div className={inner("hb-scoring__catrow")}>
				<Field
					className={inner("hb-scoring__catname")}
					label={labels.scoringCategoryType}
					hideLabel="wide"
					value={category.type}
					parse={(text) => text}
					invalid={invalid("type")}
					describedBy={own.length > 0 ? messageId : undefined}
					onCommit={(type) => {
						const renamed = scoring.priorityType === category.type;
						editor.patchScoring((c) => ({
							...c,
							...(renamed && { priorityType: type }),
							categories: c.categories.map((x, i) =>
								i === index ? { ...x, type } : x,
							),
						}));
					}}
				/>
				<Field
					className={inner("hb-scoring__catcounted")}
					label={labels.scoringCategoryCounted}
					hideLabel="wide"
					type="number"
					value={String(category.counted)}
					parse={parseNumber}
					invalid={invalid("counted")}
					describedBy={own.length > 0 ? messageId : undefined}
					onCommit={(counted) =>
						editor.patchCategory(index, (c) => ({ ...c, counted }))
					}
				/>
				<Field
					className={inner("hb-scoring__catcoef")}
					label={labels.scoringCategoryCoefficient}
					hideLabel="wide"
					type="number"
					placeholder="1"
					prefix={<span aria-hidden="true">×</span>}
					value={
						category.coefficient === undefined
							? ""
							: String(category.coefficient)
					}
					parse={parseOptionalNumber}
					invalid={invalid("coefficient")}
					describedBy={own.length > 0 ? messageId : undefined}
					onCommit={(coefficient) =>
						editor.patchCategory(index, (c) =>
							coefficient === null
								? without(c, "coefficient")
								: { ...c, coefficient },
						)
					}
				/>
				<button
					type="button"
					className={cx(
						iconButton.className,
						!settings.unstyled && "hb-scoring__catremove",
					)}
					style={iconButton.style}
					aria-label={labels.scoringRemoveCategory(category.type)}
					onClick={() =>
						editor.patchScoring((c) => ({
							...c,
							categories: c.categories.filter((_, i) => i !== index),
						}))
					}
				>
					<TrashIcon />
				</button>
			</div>
			{own.length > 0 && (
				<div id={messageId} className={inner("hb-scoring__errors")}>
					{own.map((issue) => (
						<p key={issue.path} className={inner("hb-scoring__error")}>
							{labels.scoringProblems[issue.code] ?? labels.errorGeneric}
						</p>
					))}
				</div>
			)}
			{(category.families?.length ?? 0) >= 2 && (
				<label className={inner("hb-scoring__check")}>
					<input
						type="checkbox"
						checked={category.distinctFamilies === true}
						onChange={(event) =>
							editor.patchCategory(index, (c) =>
								setDistinctFamilies(c, event.target.checked),
							)
						}
					/>
					<span>{labels.scoringDistinctFamilies(category.type)}</span>
				</label>
			)}
			<button
				type="button"
				className={inner("hb-scoring__figline")}
				aria-label={`${labels.scoringFiguresOpenAria(category.type)}, ${summary}`}
				onClick={() => editor.openFigures(index)}
			>
				<span>
					<strong>{labels.scoringFigures}</strong> {summary}
					{figureProblems > 0 && (
						<span className={inner("hb-format-tag hb-format-tag--error")}>
							{labels.raceFormatEditor.errors(figureProblems)}
						</span>
					)}
				</span>
				<span className={inner("hb-scoring__figlink")}>
					{counts.figures === 0 && counts.families === 0
						? labels.scoringFiguresAdd
						: labels.scoringFiguresOpen}
					<ChevronRightIcon />
				</span>
			</button>
		</li>
	);
}

function JudgingModeSection() {
	const editor = useRaceFormatEditor();
	const settings = useBoardSettings();
	const { labels } = settings;
	const name = useId();
	const { scoring, draft, issues } = editor;
	if (!scoring) return null;
	const inner = (cls: string) => cx(!settings.unstyled && cls);
	const forced = scoring.method === "rideMeans";
	const modeIssues = issues.filter((i) => issueSection(i) === "mode");
	return (
		<RaceFormatSection
			title={labels.scoringJudgingMode}
			changed={editor.changed.mode}
			errors={modeIssues.length}
		>
			<div
				role="radiogroup"
				aria-label={labels.scoringJudgingMode}
				className={inner("hb-scoring__modes")}
			>
				{(["free", "headJudge"] as const).map((mode) => {
					const disabled = forced && mode === "free";
					return (
						<label
							key={mode}
							className={inner("hb-scoring__mode")}
							data-selected={draft.mode === mode ? "" : undefined}
							data-disabled={disabled ? "" : undefined}
						>
							<input
								type="radio"
								name={name}
								checked={draft.mode === mode}
								disabled={disabled}
								onChange={() => editor.edit({ ...draft, mode })}
							/>
							<span>
								<b>{labels.judgingModes[mode]}</b>
								<small>{labels.scoringJudgingModeHints[mode]}</small>
							</span>
						</label>
					);
				})}
			</div>
			{(forced || modeIssues.length > 0) && (
				<p
					className={inner(
						modeIssues.length > 0 ? "hb-scoring__error" : "hb-scoring__hint",
					)}
				>
					{labels.scoringProblems.rideMeansNeedsHeadJudge}
				</p>
			)}
		</RaceFormatSection>
	);
}
