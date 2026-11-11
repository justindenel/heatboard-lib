import {
	Fragment,
	useEffect,
	useId,
	useRef,
	useState,
	type ReactNode,
} from "react";
import {
	canHaveRepechage,
	formatFromPlan,
	planFlow,
	planFromFormat,
	planProblems,
	planRoundName,
	type FormatFill,
	type FormatNames,
	type FormatPlan,
	type FormatSettings,
	type PlanProblem,
} from "@heatboard/core";
import { formatNamesOf } from "../formatNames";
import type { Labels } from "../labels";
import { IconButton } from "./admin";
import { FormatJson } from "./FormatJson";
import { FormatPlacementChoice, FormatPlacementZoom } from "./FormatPlacement";
import {
	addRound,
	modifiedCount,
	removeRound,
	resetFollowing,
	withFill,
	withFirstRound,
	withRepechage,
	withRepechageValues,
	withRiders,
	withRound,
	withSeedSlots,
	withSmallFinal,
} from "./formatPlanEdits";
import { MoreIcon } from "./icons";
import { Field, SelectField, parseNumber } from "./fields";
import { cx, partProps, useBoardSettings } from "./settings";
import { useThemeProps } from "../theme";

const FILLS = ["serpentine", "draw"] as const;

function parseInteger(text: string, min: number): number | undefined {
	const value = parseNumber(text);
	return value !== undefined && Number.isInteger(value) && value >= min
		? value
		: undefined;
}

/** What a plan edit reports to its host: the new plan and the round that was changed, if any. */
export type FormatPlanChange = (
	plan: FormatPlan,
	changedRound: number | null,
) => void;

export interface PlanProblemText {
	text: string;
	severity: PlanProblem["severity"];
}

/** Display text of the problems of a plan, in the language of `labels`. */
export function planProblemTexts(
	plan: FormatPlan,
	labels: Labels,
): PlanProblemText[] {
	const names = formatNamesOf(labels);
	const where = (problem: PlanProblem) => {
		if (problem.target === "repechage") {
			return labels.formatRepechageName(problem.round + 1);
		}
		if (problem.target === "smallFinal") return names.smallFinal;
		return planRoundName(plan, problem.round, names);
	};
	return planProblems(plan).map((problem) => ({
		severity: problem.severity,
		text: labels.formatRows.problems[problem.code](where(problem)),
	}));
}

function Stepper(props: {
	value: number;
	field: string;
	min?: number;
	onChange: (value: number) => void;
}) {
	const settings = useBoardSettings();
	const { labels } = settings;
	const button = partProps(
		settings,
		"button",
		"hb-button",
		"hb-format-rows__step",
	);
	const min = props.min ?? 1;
	return (
		<span className={cx(!settings.unstyled && "hb-format-rows__stepper")}>
			<button
				type="button"
				className={button.className}
				style={button.style}
				aria-label={labels.formatRows.less(props.field)}
				disabled={props.value <= min}
				onClick={() => props.onChange(props.value - 1)}
			>
				−
			</button>
			<output aria-label={props.field}>{props.value}</output>
			<button
				type="button"
				className={button.className}
				style={button.style}
				aria-label={labels.formatRows.more(props.field)}
				onClick={() => props.onChange(props.value + 1)}
			>
				+
			</button>
		</span>
	);
}

/**
 * Round-1 inputs: rider count, heats, qualifiers per heat and the repechage
 * after round 1. Everything after round 1 follows from them until edited.
 */
export function FormatStartFields(props: {
	plan: FormatPlan;
	onChange: FormatPlanChange;
}) {
	const { plan, onChange } = props;
	const settings = useBoardSettings();
	const { labels } = settings;
	const inner = (cls: string) => cx(!settings.unstyled && cls);
	const first = plan.rounds[0];
	if (!first) return null;
	const rows = labels.formatRows;
	const single = plan.rounds.length === 1;
	return (
		<div className={inner("hb-format-rows__start")}>
			<Field
				label={rows.riders}
				type="number"
				value={String(plan.riders)}
				parse={(text) => parseInteger(text, 0)}
				onCommit={(riders) => onChange(withRiders(plan, riders), null)}
			/>
			<div className={inner("hb-scoring__field")}>
				<span>{rows.heatsInRound1}</span>
				<Stepper
					value={first.heats}
					field={rows.heatsInRound1}
					onChange={(heats) => onChange(withFirstRound(plan, { heats }), 0)}
				/>
			</div>
			<div className={inner("hb-scoring__field")}>
				<span>{rows.advance}</span>
				{single ? (
					<output>–</output>
				) : (
					<Stepper
						value={first.advance}
						field={rows.advance}
						onChange={(advance) =>
							onChange(withFirstRound(plan, { advance }), 0)
						}
					/>
				)}
			</div>
			<label className={inner("hb-scoring__check")}>
				<input
					type="checkbox"
					checked={first.repechage !== undefined}
					disabled={!canHaveRepechage(plan, 0)}
					onChange={(event) =>
						onChange(
							withFirstRound(plan, { repechage: event.target.checked }),
							0,
						)
					}
				/>{" "}
				{rows.repechageAfterFirst}
			</label>
		</div>
	);
}

/** Checkbox for the optional heat of the riders eliminated just before the final. */
export function FormatSmallFinalField(props: {
	plan: FormatPlan;
	onChange: FormatPlanChange;
}) {
	const { plan, onChange } = props;
	const settings = useBoardSettings();
	return (
		<label className={cx(!settings.unstyled && "hb-scoring__check")}>
			<input
				type="checkbox"
				checked={plan.smallFinal && plan.rounds.length >= 2}
				disabled={plan.rounds.length < 2}
				onChange={(event) =>
					onChange(withSmallFinal(plan, event.target.checked), null)
				}
			/>{" "}
			{settings.labels.formatRows.smallFinal}
		</label>
	);
}

/** Blocking errors (alert) and warnings of the plan. */
export function FormatProblems(props: { plan: FormatPlan }) {
	const settings = useBoardSettings();
	const { labels } = settings;
	const problems = planProblemTexts(props.plan, labels);
	if (problems.length === 0) return null;
	const errors = problems.filter((p) => p.severity === "error");
	const warnings = problems.filter((p) => p.severity === "warning");
	return (
		<>
			{errors.length > 0 && (
				<ul
					className={cx(!settings.unstyled && "hb-scoring__problems")}
					role="alert"
				>
					{errors.map((p) => (
						<li key={p.text}>{p.text}</li>
					))}
				</ul>
			)}
			{warnings.length > 0 && (
				<ul
					className={cx(!settings.unstyled && "hb-format__warnings")}
					aria-label={labels.formatRows.problemsTitle}
				>
					{warnings.map((p) => (
						<li key={p.text}>{p.text}</li>
					))}
				</ul>
			)}
		</>
	);
}

function StateBadge(props: { auto: boolean }) {
	const settings = useBoardSettings();
	const { labels } = settings;
	return (
		<span
			className={cx(
				!settings.unstyled && "hb-format-rows__badge",
				!settings.unstyled && !props.auto && "hb-format-rows__badge--modified",
			)}
		>
			{props.auto ? labels.formatRows.auto : labels.formatRows.modified}
		</span>
	);
}

/**
 * The rounds as rows: heats and qualifiers per heat as steppers, the riders per
 * heat computed, the repechage checkbox where one is possible (its heats and
 * qualifiers in a sub-row), an auto / modified badge and a "⋯" menu with
 * "↺ following rounds" and "Remove" (not on round 1 nor on the final). Round 1
 * is read-only here: it is set by `FormatStartFields`. With `collapsible` the
 * rows sit behind an "Adjust the rounds" toggle that summarises them.
 */
export function FormatRows(props: {
	plan: FormatPlan;
	onChange: FormatPlanChange;
	collapsible?: boolean;
	/** Controls whether the rows are shown (with `collapsible`); the editor keeps its own state otherwise. */
	expanded?: boolean;
	onExpandedChange?: (expanded: boolean) => void;
	/** A new object opens the rows and moves the focus to the row of that round. */
	focus?: { round: number };
}) {
	const { plan, onChange, collapsible, focus } = props;
	const settings = useBoardSettings();
	const { labels } = settings;
	const rows = labels.formatRows;
	const inner = (cls: string) => cx(!settings.unstyled && cls);
	const button = partProps(settings, "button", "hb-button");
	const panelId = useId();
	const rootRef = useRef<HTMLDivElement>(null);
	const handledFocus = useRef<{ round: number } | undefined>(undefined);
	const [ownOpen, setOwnOpen] = useState(() => modifiedCount(plan) > 0);
	const [seenFocus, setSeenFocus] = useState(focus);
	const [menuRound, setMenuRound] = useState<number | null>(null);
	if (focus !== seenFocus) {
		setSeenFocus(focus);
		if (focus) setOwnOpen(true);
	}
	const open = !collapsible || (props.expanded ?? ownOpen);

	useEffect(() => {
		if (!focus || !open || handledFocus.current === focus) return;
		handledFocus.current = focus;
		const row = rootRef.current?.querySelector<HTMLElement>(
			`[data-round-row="${focus.round}"]`,
		);
		(row?.querySelector<HTMLElement>("button") ?? row)?.focus();
	}, [focus, open]);

	useEffect(() => {
		if (menuRound === null) return;
		const close = (event: PointerEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setMenuRound(null);
		};
		document.addEventListener("pointerdown", close, true);
		return () => document.removeEventListener("pointerdown", close, true);
	}, [menuRound]);

	const names: FormatNames = formatNamesOf(labels);
	const flow = planFlow(plan);
	const last = plan.rounds.length - 1;
	const heatsTotal = flow.rounds.reduce(
		(sum, f, i) =>
			sum + (plan.rounds[i]?.heats ?? 0) + (f.repechage?.sizes.length ?? 0),
		0,
	);
	const roundCount =
		plan.rounds.length +
		flow.rounds.filter((f) => f.repechage).length +
		(flow.smallFinal === undefined ? 0 : 1);
	const total = heatsTotal + (flow.smallFinal === undefined ? 0 : 1);

	const toggle = (value: boolean) => {
		setOwnOpen(value);
		props.onExpandedChange?.(value);
	};

	const body = (
		<>
			<div className={inner("hb-format-rows__scroll")}>
				<table className={inner("hb-format-rows__table")}>
					<thead>
						<tr>
							<th scope="col">{rows.columns.round}</th>
							<th scope="col">{rows.columns.heats}</th>
							<th scope="col">{rows.columns.advance}</th>
							<th scope="col">{rows.columns.repechage}</th>
							<th scope="col">{rows.columns.seedSlots}</th>
							<th scope="col">{rows.columns.state}</th>
						</tr>
					</thead>
					<tbody>
						{plan.rounds.map((round, i) => {
							const f = flow.rounds[i];
							if (!f) return null;
							const name = planRoundName(plan, i, names);
							const isFirst = i === 0;
							const isFinal = i === last;
							const repechage = round.repechage;
							const repechageFlow = f.repechage;
							const hasMenu = !isFirst && !isFinal;
							return (
								<Fragment key={i}>
									<tr
										data-round-row={i}
										tabIndex={-1}
										className={cx(
											!settings.unstyled && "hb-format-rows__row",
											!settings.unstyled &&
												isFinal &&
												"hb-format-rows__row--final",
											!settings.unstyled &&
												isFirst &&
												"hb-format-rows__row--first",
										)}
									>
										<th scope="row" className={inner("hb-format-rows__name")}>
											<b>{name}</b>
											<small>
												{rows.incoming(
													f.incoming,
													f.fromRepechage,
													f.seedSlots,
												)}
											</small>
										</th>
										<td>
											{isFirst || isFinal ? (
												<span className={inner("hb-format-rows__value")}>
													{round.heats}
												</span>
											) : (
												<Stepper
													value={round.heats}
													field={`${name} · ${rows.columns.heats}`}
													onChange={(heats) =>
														onChange(withRound(plan, i, { heats }), i)
													}
												/>
											)}
										</td>
										<td>
											{isFinal ? (
												<span className={inner("hb-format-rows__dash")}>–</span>
											) : isFirst ? (
												<span className={inner("hb-format-rows__value")}>
													{round.advance}
												</span>
											) : (
												<Stepper
													value={round.advance}
													field={`${name} · ${rows.columns.advance}`}
													onChange={(advance) =>
														onChange(withRound(plan, i, { advance }), i)
													}
												/>
											)}
										</td>
										<td>
											{canHaveRepechage(plan, i) ? (
												<input
													type="checkbox"
													aria-label={`${name} · ${rows.columns.repechage}`}
													checked={repechage !== undefined}
													disabled={isFirst}
													onChange={(event) =>
														onChange(
															withRepechage(plan, i, event.target.checked),
															i,
														)
													}
												/>
											) : (
												<span className={inner("hb-format-rows__dash")}>–</span>
											)}
										</td>
										<td>
											{isFirst ? (
												<span className={inner("hb-format-rows__dash")}>–</span>
											) : (
												<Stepper
													value={f.seedSlots}
													min={0}
													field={`${name} · ${rows.columns.seedSlots}`}
													onChange={(seedSlots) =>
														onChange(withSeedSlots(plan, i, seedSlots), i)
													}
												/>
											)}
										</td>
										<td className={inner("hb-format-rows__state")}>
											{isFirst ? (
												<small>{rows.setAbove}</small>
											) : (
												<StateBadge auto={round.auto} />
											)}
											{hasMenu && (
												<span className={inner("hb-format-rows__menu-root")}>
													<IconButton
														label={rows.menu(name)}
														aria={{
															"aria-expanded": menuRound === i,
															"aria-controls":
																menuRound === i ? `${panelId}-${i}` : undefined,
														}}
														onPress={() =>
															setMenuRound((value) => (value === i ? null : i))
														}
													>
														<MoreIcon />
													</IconButton>
													{menuRound === i && (
														<div
															id={`${panelId}-${i}`}
															role="group"
															aria-label={rows.menu(name)}
															className={inner("hb-format-rows__menu")}
														>
															<button
																type="button"
																className={button.className}
																style={button.style}
																onClick={() => {
																	setMenuRound(null);
																	onChange(resetFollowing(plan, i), i);
																}}
															>
																{rows.resetFollowing}
															</button>
															<button
																type="button"
																className={button.className}
																style={button.style}
																onClick={() => {
																	setMenuRound(null);
																	onChange(removeRound(plan, i), i);
																}}
															>
																{rows.remove}
															</button>
														</div>
													)}
												</span>
											)}
										</td>
									</tr>
									{repechage && repechageFlow && (
										<tr
											data-round-row={i}
											className={inner(
												"hb-format-rows__row hb-format-rows__row--repechage",
											)}
										>
											<th scope="row" className={inner("hb-format-rows__name")}>
												<b>{labels.formatRepechageName(i + 1)}</b>
												<small>
													{rows.incoming(repechageFlow.incoming, 0)}
												</small>
											</th>
											<td>
												<Stepper
													value={repechage.heats}
													field={`${labels.formatRepechageName(i + 1)} · ${rows.columns.heats}`}
													onChange={(heats) =>
														onChange(withRepechageValues(plan, i, { heats }), i)
													}
												/>
											</td>
											<td>
												<Stepper
													value={repechage.advance}
													field={`${labels.formatRepechageName(i + 1)} · ${rows.columns.advance}`}
													onChange={(advance) =>
														onChange(
															withRepechageValues(plan, i, { advance }),
															i,
														)
													}
												/>
											</td>
											<td className={inner("hb-format-rows__goes")}>
												{rows.repechageGoesTo(
													planRoundName(plan, i + 1, names),
												)}
											</td>
											<td />
											<td>
												<StateBadge auto={repechage.auto} />
											</td>
										</tr>
									)}
								</Fragment>
							);
						})}
					</tbody>
				</table>
			</div>
			<div className={inner("hb-scoring__actions")}>
				<button
					type="button"
					className={button.className}
					style={button.style}
					disabled={plan.rounds.length < 2}
					onClick={() => {
						const next = addRound(plan);
						if (next) onChange(next, plan.rounds.length - 1);
					}}
				>
					{rows.addRound}
				</button>
			</div>
		</>
	);

	return (
		<div ref={rootRef} className={inner("hb-format-rows")}>
			{collapsible && (
				<button
					type="button"
					className={cx(
						button.className,
						!settings.unstyled && "hb-format-rows__toggle",
					)}
					style={button.style}
					aria-expanded={open}
					onClick={() => toggle(!open)}
				>
					<span>{rows.adjust}</span>
					<span className={inner("hb-format-rows__summary")}>
						{rows.summary(roundCount, total, modifiedCount(plan))}
					</span>
				</button>
			)}
			{open && body}
		</div>
	);
}

/**
 * Placement: the way the qualifiers are placed at the first passage where it
 * matters (two compared diagrams), how round 1 is filled (by seed or drawn), and
 * the detailed diagram of that passage behind a toggle. Meant to sit under the preview.
 */
export function FormatPlacementSection(props: {
	plan: FormatPlan;
	onChange: FormatPlanChange;
}) {
	const { plan, onChange } = props;
	const settings = useBoardSettings();
	const rows = settings.labels.formatRows;
	const inner = (cls: string) => cx(!settings.unstyled && cls);
	const button = partProps(settings, "button", "hb-button");
	const [detail, setDetail] = useState(false);
	const valid = planProblems(plan).every((p) => p.severity !== "error");
	// Rendered outside the editor (under the preview), so it must carry the lib variables itself.
	const themeProps = useThemeProps();

	return (
		<div
			className={cx(
				!settings.unstyled && "hb-format-placement",
				inner("hb-format-rows__placement"),
			)}
			{...themeProps}
		>
			<FormatPlacementChoice
				plan={plan}
				scope="focus"
				everyRound
				onChange={(next) => onChange(next, null)}
				heading={
					<>
						<p className={inner("hb-format__subtitle")}>{rows.placement}</p>
						<p className={inner("hb-format__preview")}>{rows.placementHelp}</p>
					</>
				}
			/>
			<SelectField
				label={rows.fill}
				value={plan.fill}
				onChange={(fill) => onChange(withFill(plan, fill as FormatFill), null)}
			>
				{FILLS.map((fill) => (
					<option key={fill} value={fill}>
						{rows.fillOptions[fill]}
					</option>
				))}
			</SelectField>
			<p className={inner("hb-format__preview")}>{rows.fillHelp[plan.fill]}</p>
			{valid && (
				<>
					<div>
						<button
							type="button"
							className={button.className}
							style={button.style}
							aria-expanded={detail}
							onClick={() => setDetail((value) => !value)}
						>
							{detail ? rows.hidePlacementDetail : rows.showPlacementDetail}
						</button>
					</div>
					{detail && <FormatPlacementZoom plan={plan} />}
				</>
			)}
		</div>
	);
}

/**
 * "More options": placement of the qualifiers for the other rounds (two compared
 * diagrams), and JSON import / export. A format that does
 * not fit the rows is passed to `onImportUnsupported` when given, else refused.
 */
export function FormatMoreOptions(props: {
	plan: FormatPlan;
	onChange: FormatPlanChange;
	onImportUnsupported?: (format: FormatSettings) => void;
	onExport?: (json: string) => void;
}) {
	const { plan, onChange, onImportUnsupported, onExport } = props;
	const settings = useBoardSettings();
	const { labels } = settings;
	const rows = labels.formatRows;
	const inner = (cls: string) => cx(!settings.unstyled && cls);
	const [open, setOpen] = useState(false);
	const button = partProps(settings, "button", "hb-button");

	const load = (format: FormatSettings): string | undefined => {
		const next = planFromFormat(format, undefined, plan.riders);
		if (next) {
			onChange(next, null);
			return undefined;
		}
		if (onImportUnsupported) {
			onImportUnsupported(format);
			return undefined;
		}
		return rows.importNotRows;
	};

	let content: ReactNode = null;
	if (open) {
		content = (
			<div className={inner("hb-format-rows__more-body")}>
				<FormatPlacementSection plan={plan} onChange={onChange} />
				<FormatJson
					format={formatFromPlan(plan, formatNamesOf(labels))}
					onLoad={load}
					onExport={onExport}
				/>
			</div>
		);
	}

	return (
		<div className={inner("hb-format-rows__more")}>
			<button
				type="button"
				className={button.className}
				style={button.style}
				aria-expanded={open}
				onClick={() => setOpen((value) => !value)}
			>
				{rows.moreOptions}
			</button>
			{content}
		</div>
	);
}

export interface FormatRoundsEditorProps {
	plan: FormatPlan;
	/** Called with the recalculated plan and the index of the round the user changed (null for global options). */
	onChange: FormatPlanChange;
	/** Hides the round-1 inputs, for a host that lays them out itself with `FormatStartFields`. */
	hideStart?: boolean;
	/** Hides the small-final checkbox, for a host that lays it out itself with `FormatSmallFinalField` or its own control. */
	hideSmallFinal?: boolean;
	/** Puts the rows behind an "Adjust the rounds" toggle. */
	collapsible?: boolean;
	expanded?: boolean;
	onExpandedChange?: (expanded: boolean) => void;
	/** A new object opens the rows and focuses the row of that round. */
	focus?: { round: number };
	/** See `FormatMoreOptions`. */
	onImportUnsupported?: (format: FormatSettings) => void;
	onExport?: (json: string) => void;
}

/**
 * Round-by-round editor bound to a `FormatPlan`: round-1 inputs, rows, small
 * final, checks and more options. Every change goes through `refillPlan`, so
 * the auto rounds follow and the modified ones stay. Needs no bracket: the
 * inspector and the "New bracket" dialog both use it.
 */
export function FormatRoundsEditor(props: FormatRoundsEditorProps) {
	const { plan, onChange } = props;
	const settings = useBoardSettings();
	const themeProps = useThemeProps();
	const root = partProps(
		settings,
		"formatRows",
		"hb-scoring",
		"hb-format",
		"hb-format-editor",
	);
	return (
		<div
			className={root.className}
			{...themeProps}
			style={{ ...themeProps.style, ...root.style }}
		>
			{!props.hideStart && (
				<FormatStartFields plan={plan} onChange={onChange} />
			)}
			<FormatRows
				plan={plan}
				onChange={onChange}
				collapsible={props.collapsible}
				expanded={props.expanded}
				onExpandedChange={props.onExpandedChange}
				focus={props.focus}
			/>
			{!props.hideSmallFinal && (
				<FormatSmallFinalField plan={plan} onChange={onChange} />
			)}
			<FormatProblems plan={plan} />
			<FormatMoreOptions
				plan={plan}
				onChange={onChange}
				onImportUnsupported={props.onImportUnsupported}
				onExport={props.onExport}
			/>
		</div>
	);
}
