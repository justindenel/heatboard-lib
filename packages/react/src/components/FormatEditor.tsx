import { useState } from "react";
import {
	buildFromFormat,
	defaultPlan,
	editorFromPlan,
	exportFormat,
	formatFromPlan,
	parseFormat,
	planFromFormat,
	type Action,
	type Bracket,
	type FormatPlan,
	type FormatSettings,
} from "@heatboard/core";
import { useBracketContext } from "../context";
import { formatNamesOf } from "../formatNames";
import { errorMessage } from "../labels";
import { RefusableButton, useAdmin } from "./admin";
import { FormatJson } from "./FormatJson";
import { FormatRoundsEditor, planProblemTexts } from "./FormatRoundsEditor";
import { FormatShape } from "./FormatShape";
import { Heading } from "./Heading";
import {
	cx,
	partProps,
	useBoardSettings,
	type FormatEditorProps,
} from "./settings";

const DEFAULT_RIDERS = 16;
const HEAT_SIZE = 4;
const ADVANCE = 2;

const randomDrawSeed = () => Math.floor(Math.random() * 2 ** 31);

/** The editor works on rows (`plan`), or only shows a format that rows cannot express (`format`). */
type Draft =
	| { kind: "plan"; plan: FormatPlan }
	| { kind: "format"; format: FormatSettings };

/** Same text for equal values whatever the key order, which `parseFormat` does not preserve. */
function canonical(value: unknown): string {
	return JSON.stringify(value, (_, v: unknown) =>
		v && typeof v === "object" && !Array.isArray(v)
			? Object.fromEntries(
					Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)),
				)
			: v,
	);
}

/** Round names depend on the language: only the structure counts. */
function structure(settings: FormatSettings): string {
	return canonical({
		fill: settings.fill,
		rounds: settings.rounds.map((round) => ({ ...round, name: undefined })),
	});
}

function initialDraft(applied: Bracket["format"], entryCount: number): Draft {
	if (!applied) {
		const riders = entryCount >= 2 ? entryCount : DEFAULT_RIDERS;
		return {
			kind: "plan",
			plan: defaultPlan({
				riders,
				heats: Math.max(1, Math.ceil(riders / HEAT_SIZE)),
				advance: ADVANCE,
				repechage: false,
			}),
		};
	}
	const plan = planFromFormat(
		applied.settings,
		applied.editor,
		entryCount > 0 ? entryCount : undefined,
	);
	return plan
		? { kind: "plan", plan }
		: { kind: "format", format: applied.settings };
}

/**
 * Editor of the bracket's rounds, one row per round (see `FormatRoundsEditor`),
 * with a live `FormatShape` and a zoom on how the qualifiers are placed. Edits
 * stay in a local draft; "Apply" sends `applyFormat` with the editor state, which
 * the core refuses once a heat has started. A format the rows cannot express is
 * shown read-only, whole, with the JSON export still available.
 */
export function FormatEditor(props: FormatEditorProps) {
	const { bracket, canApply } = useBracketContext();
	const settings = useBoardSettings();
	const { run, labels } = useAdmin();
	const createDrawSeed =
		props.createDrawSeed ?? settings.createDrawSeed ?? randomDrawSeed;
	const onExport = props.onExport ?? settings.onExportFormat;

	const entryCount = bracket.entries.length;
	const applied = bracket.format;
	const source = JSON.stringify(applied ?? null);
	const [draft, setDraft] = useState<Draft>(() =>
		initialDraft(applied, entryCount),
	);
	const [drawSeed, setDrawSeed] = useState<number>(
		() => applied?.drawSeed ?? createDrawSeed(),
	);
	const [seen, setSeen] = useState(source);
	const [failure, setFailure] = useState<string | null>(null);
	const [focus, setFocus] = useState<{ round: number } | undefined>(undefined);
	if (seen !== source) {
		setSeen(source);
		setDraft(initialDraft(applied, entryCount));
		if (applied) setDrawSeed(applied.drawSeed);
		setFailure(null);
	}

	const root = partProps(settings, "formatEditor", "hb-scoring", "hb-format");
	const sectionTitle = partProps(
		settings,
		"inspectorSectionTitle",
		"hb-inspector__section-title",
	);
	const button = partProps(settings, "button", "hb-button");
	const inner = (cls: string) => cx(!settings.unstyled && cls);

	const names = formatNamesOf(labels);
	let format: FormatSettings;
	let blocking: string[] = [];
	if (draft.kind === "plan") {
		format = formatFromPlan(draft.plan, names);
		// Keeps the name and round names of the applied format so that an unchanged setup reads as unchanged.
		if (applied && structure(applied.settings) === structure(format)) {
			format = {
				...format,
				name: applied.settings.name,
				rounds: applied.settings.rounds,
			};
			if (applied.settings.description === undefined) delete format.description;
			else format.description = applied.settings.description;
		}
		blocking = planProblemTexts(draft.plan, labels)
			.filter((p) => p.severity === "error")
			.map((p) => p.text);
	} else {
		format = draft.format;
	}

	const parsed = blocking.length === 0 ? parseFormat(format) : undefined;
	const valid = parsed?.ok ? parsed.format : undefined;
	const built = valid ? buildFromFormat(bracket, valid, drawSeed) : undefined;
	const problems: string[] = [
		...(parsed && !parsed.ok
			? parsed.errors.map((issue) =>
					labels.formatProblem(issue.path, issue.message),
				)
			: []),
		...(built && !built.ok
			? [labels.formatEntryRoundMissing(built.entryRoundId)]
			: []),
	];

	const editorState =
		draft.kind === "plan" ? editorFromPlan(draft.plan) : undefined;
	const action: Action | undefined = valid
		? {
				type: "applyFormat",
				format: valid,
				drawSeed,
				...(editorState && { editor: editorState }),
			}
		: undefined;

	const started = bracket.rounds
		.flatMap((r) => r.heats)
		.some((h) => h.status !== "pending");
	const unchanged =
		valid !== undefined &&
		applied !== undefined &&
		applied.drawSeed === drawSeed &&
		exportFormat(valid) === exportFormat(applied.settings) &&
		(editorState === undefined ||
			applied.editor === undefined ||
			canonical(editorState) === canonical(applied.editor));

	let reason: string | undefined;
	if (!valid) reason = blocking[0] ?? problems[0] ?? labels.formatEmpty;
	else if (started) reason = labels.formatLocked;
	else if (problems.length > 0) reason = problems[0];
	else if (unchanged) reason = labels.formatUnchanged;
	else if (action) {
		const probe = canApply(action);
		if (!probe.ok) reason = errorMessage(labels, probe.error);
	}

	const apply = () => {
		if (!action) return;
		const result = run(action);
		if (!result.ok) setFailure(errorMessage(labels, result.error));
	};

	const readOnlyRiders = Math.max(entryCount, applied?.editor?.riders ?? 0);
	const initial = initialDraft(applied, entryCount);
	const dirty = canonical(draft) !== canonical(initial);

	const importIntoRows = (imported: FormatSettings): string | undefined => {
		const plan = planFromFormat(
			imported,
			undefined,
			draft.kind === "plan" ? draft.plan.riders : readOnlyRiders,
		);
		setDraft(
			plan ? { kind: "plan", plan } : { kind: "format", format: imported },
		);
		setFailure(null);
		return undefined;
	};

	return (
		<section
			className={root.className}
			style={root.style}
			aria-label={labels.formatEditor}
		>
			<Heading
				depth={2}
				className={sectionTitle.className}
				style={sectionTitle.style}
			>
				{labels.formatEditor}
			</Heading>
			{draft.kind === "plan" ? (
				<>
					<FormatRoundsEditor
						plan={draft.plan}
						onChange={(plan) => {
							setDraft({ kind: "plan", plan });
							setFailure(null);
						}}
						focus={focus}
						onImportUnsupported={(imported) => importIntoRows(imported)}
						onExport={onExport}
					/>
					<FormatShape
						plan={draft.plan}
						format={format}
						onRoundClick={(round) => setFocus({ round })}
					/>
				</>
			) : (
				<>
					<p className={inner("hb-format__notice")}>
						{labels.formatRows.readOnly}
					</p>
					<FormatShape format={draft.format} riders={readOnlyRiders} />
					<FormatJson
						format={draft.format}
						onLoad={importIntoRows}
						onExport={onExport}
					/>
				</>
			)}
			<div className={inner("hb-scoring__actions")}>
				<button
					type="button"
					className={button.className}
					style={button.style}
					onClick={() => setDrawSeed(createDrawSeed())}
				>
					{labels.formatReshuffle}
				</button>
			</div>
			{problems.length > 0 && (
				<ul className={inner("hb-scoring__problems")} role="alert">
					{problems.map((text) => (
						<li key={text}>{text}</li>
					))}
				</ul>
			)}
			{failure !== null && (
				<p className={inner("hb-scoring__problems")} role="alert">
					{failure}
				</p>
			)}
			<div className={inner("hb-scoring__actions")}>
				<RefusableButton
					reason={reason}
					className={button.className}
					style={button.style}
					onPress={apply}
				>
					{labels.formatApply}
				</RefusableButton>
				<button
					type="button"
					className={button.className}
					style={button.style}
					disabled={!dirty}
					onClick={() => {
						setDraft(initial);
						setFailure(null);
					}}
				>
					{labels.formatDiscard}
				</button>
			</div>
		</section>
	);
}
