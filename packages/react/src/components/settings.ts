import {
	createContext,
	useContext,
	useMemo,
	type ComponentType,
	type CSSProperties,
	type ReactNode,
} from "react";
import type {
	Action,
	BracketError,
	Entry,
	Heat,
	HeatData,
	HeatSlot,
	HeatStatus,
	RideResult,
	Round,
	ScoringConfig,
	ViewerHeatResult,
} from "@heatboard/core";
import { useHeatboardConfig } from "../config";
import type { Labels } from "../labels";
import { defaultActionId, type ServerError } from "../useBracket";

export type BoardPart =
	| "board"
	| "frame"
	| "main"
	| "header"
	| "title"
	| "status"
	| "visibilityBadge"
	| "rounds"
	| "addRoundItem"
	| "roundItem"
	| "round"
	| "roundHeader"
	| "roundTitle"
	| "roundMeta"
	| "roundToggle"
	| "roundSummary"
	| "heats"
	| "heatItem"
	| "heat"
	| "heatHeader"
	| "heatTitle"
	| "heatTitleButton"
	| "heatRound"
	| "heatReview"
	| "heatFormat"
	| "heatFormatDrift"
	| "participants"
	| "participant"
	| "participantName"
	| "emptySlot"
	| "resultBadge"
	| "heatStatusBadge"
	| "lycraStripe"
	| "draggable"
	| "dragOverlay"
	| "boardError"
	| "boardErrorMessage"
	| "boardErrorDismiss"
	| "entryPool"
	| "entryPoolTitle"
	| "entryPoolHeader"
	| "entryPoolCount"
	| "entryPoolBody"
	| "entryPoolEmpty"
	| "entryPoolList"
	| "entryPoolZone"
	| "entryPoolChip"
	| "entryPoolItem"
	| "entryPoolMenu"
	| "actions"
	| "iconButton"
	| "inspector"
	| "inspectorHeader"
	| "inspectorTitle"
	| "inspectorBody"
	| "inspectorSection"
	| "inspectorSectionTitle"
	| "inspectorRiders"
	| "inspectorRider"
	| "inspectorJudge"
	| "inspectorJudgeName"
	| "inspectorNote"
	| "inspectorAligned"
	| "inspectorRanWith"
	| "statusMenuButton"
	| "statusMenu"
	| "statusMenuItem"
	| "toolbar"
	| "controls"
	| "button"
	| "switch"
	| "select"
	| "input"
	| "dialog"
	| "dialogTitle"
	| "dialogImpact"
	| "dialogActions"
	| "entryForm"
	| "timer"
	| "racePause"
	| "scoreBadge"
	| "controlsNote"
	| "judge"
	| "judgeHeader"
	| "judgeTitle"
	| "judgeSync"
	| "judgeNotice"
	| "judgeList"
	| "judgeRow"
	| "judgeRowMain"
	| "judgeRowLycra"
	| "judgeRowName"
	| "judgeRowTotal"
	| "judgeChips"
	| "judgeChip"
	| "judgeMenu"
	| "judgeOverlay"
	| "judgeSheet"
	| "judgeSheetHead"
	| "judgeSheetBody"
	| "judgeOption"
	| "judgeToast"
	| "judgeQueue"
	| "judgeQueueTitle"
	| "judgeQueueList"
	| "judgeQueueItem"
	| "judgeQueueActions"
	| "judgeRiders"
	| "headJudge"
	| "headJudgeSection"
	| "headJudgeRiders"
	| "headJudgeRider"
	| "headJudgePicker"
	| "headJudgeRides"
	| "headJudgeRide"
	| "viewerDisplay"
	| "scoringEditor"
	| "formatEditor"
	| "formatShape"
	| "formatPlacement"
	| "formatRows"
	| "penalties";

export type AdminPermission =
	| "heatStatus"
	| "ranking"
	| "riderStatus"
	| "roundSettings"
	| "bracketStatus"
	| "visibility"
	| "viewerDisplay"
	| "scoring"
	| "format"
	| "penalties"
	| "reset"
	| "structure"
	| "entries"
	| "names"
	/** The bracket-level inspector and its trigger, for hosts that lay the bracket settings out themselves. */
	| "bracketPanel";

export type AdminPermissions = Partial<Record<AdminPermission, boolean>>;

export type BoardMode = "viewer" | "admin";

/** What the inspector shows: one heat, one round, or the bracket itself. */
export type BoardSelection =
	| { type: "heat"; heatId: string }
	| { type: "round"; roundId: string }
	| { type: "bracket" };

export interface RoundColumnProps {
	round: Round;
	roundIndex: number;
}

export interface HeatCardProps {
	round: Round;
	heat: Heat;
	heatIndex: number;
}

/** Rendered inside an `li` provided by `HeatCard`: do not render an `li`. */
export interface ParticipantRowProps {
	round: Round;
	heat: Heat;
	slot: HeatSlot;
	index: number;
	/** Undefined when the slot references a rider missing from the entries. */
	entry: Entry | undefined;
	qualified: boolean;
	/** The rider joined this round directly as a seed (see `seedSlots` in the format). */
	seedEntry?: boolean;
	rider?: unknown;
	/** Aggregated total of the rider, set when the host provides the heat data. */
	total?: number;
	/** Where the rider goes next, set on the riders of a judged heat of an admin board; exposed as the row tooltip. */
	destination?: { text: string; kind: "advance" | "repechage" | "eliminated" };
}

/** Rendered inside an `li` provided by `HeatCard`: do not render an `li`. */
export interface EmptySlotProps {
	round: Round;
	heat: Heat;
	index: number;
	/** Where the rider of this place will come from, when the links say so (e.g. "1st · Round 1 H5"). */
	origin?: string;
}

export interface ResultBadgeProps {
	slot: HeatSlot;
	qualified?: boolean;
}

export interface ScoreBadgeProps {
	total: number;
	/** The figure is the place in the heat (placings method), not a total. */
	places?: boolean;
}

/** Remaining or elapsed time of a running heat; renders nothing otherwise. */
export interface HeatTimerProps {
	heatId: string;
}

export interface JudgeRowProps {
	riderId: string;
	name: ReactNode;
	/** Plain-text name, for accessible names. */
	label: string;
	/** Lycra color of the rider. */
	color: string | undefined;
	/** Rank among the riders on this judge's notes; undefined while the judge has no note for the rider. */
	rank: number | undefined;
	total: number;
	/** Notes of the rider in the order they were given. */
	notes: RideResult[];
	disabled: boolean;
	/** Categories in display order: the notes show on one line per category. */
	categories?: string[];
	/** False when the judge cannot add a note for this rider (head-judge mode); the row is then informative only. */
	canAdd?: boolean;
	/** Note whose Edit/Delete menu is open. */
	menuNoteId: string | null;
	onOpen: (opener: HTMLElement) => void;
	onNoteMenu: (noteId: string | null) => void;
	onEditNote: (noteId: string, opener: HTMLElement | null) => void;
	onDeleteNote: (noteId: string) => void;
}

/** A variant a figure accepts; `suffix` is appended to the figure code, e.g. `F` + `1H`. */
export interface JudgeVariant {
	code: string;
	name: string;
	suffix: string;
}

export interface JudgeFigure {
	code: string;
	name: string | undefined;
	variants: JudgeVariant[];
}

/** The figures of one family, in the organiser's order. */
export interface JudgeFigureGroup {
	id: string;
	name: string;
	/** Position of the family among those of the category, for its colour. */
	index: number;
	figures: JudgeFigure[];
}

export interface JudgeCategory {
	type: string;
	/** Codes of every figure, flat. */
	figures: string[];
	groups: JudgeFigureGroup[];
}

export interface JudgeSheetProps {
	name: ReactNode;
	label: string;
	color: string | undefined;
	total: number;
	categories: JudgeCategory[];
	category: string;
	onCategory: (type: string) => void;
	/** Figure selected for the next note. */
	figure: string | undefined;
	onFigure: (figure: string | undefined) => void;
	/** Variant of the selected figure; none by default. */
	variant: string | undefined;
	onVariant: (variant: string | undefined) => void;
	/** Every value of the scale, in order. */
	values: number[];
	/** Value of the note being edited, when editing. */
	currentValue: number | undefined;
	editing: boolean;
	onPick: (value: number) => void;
	onClose: () => void;
}

/** One announced ride waiting in the judge's queue. */
export interface JudgeQueueItemProps {
	name: ReactNode;
	/** Plain-text name, for accessible names. */
	label: string;
	color: string | undefined;
	type: string;
	figure: string | undefined;
	/** Time in the heat, e.g. `3:25`; empty when the heat has no start time. */
	time: string;
	/** Every value of the scale, in order. */
	values: number[];
	/** Selected value, not sent yet. */
	draft: number | undefined;
	onSelect: (value: number) => void;
	onConfirm: () => void;
	onUnseen: () => void;
}

/** Every value of the scale as a grid of toggle buttons. */
export interface ScorePickerProps {
	values: number[];
	selected: number | undefined;
	onSelect: (value: number) => void;
}

/** Grid sheet of one announced ride: tap selects a value, "Confirm" sends it, "Not seen" sends no note. */
export interface JudgeRideSheetProps {
	name: ReactNode;
	label: string;
	color: string | undefined;
	type: string;
	figure: string | undefined;
	/** Every value of the scale, in order. */
	values: number[];
	/** Selected value, not sent yet. */
	draft: number | undefined;
	/** Existing answer when editing: a value, or `null` for "not seen". */
	current: number | null | undefined;
	onSelect: (value: number) => void;
	onConfirm: () => void;
	onUnseen: () => void;
	onClose: () => void;
}

export interface HeatStatusBadgeProps {
	status: HeatStatus;
}

export interface LycraStripeProps {
	color: string | undefined;
}

export interface HeatControlsProps {
	round: Round;
	heat: Heat;
}

/** Start button of a pending heat card. */
export interface HeatActionsProps {
	round: Round;
	heat: Heat;
}

/** Icon row of a round header: the inspector trigger. */
export interface RoundHeaderActionsProps {
	round: Round;
}

export interface InspectorProps {
	target: BoardSelection;
	/** Called on Escape and by the close button; the board restores the focus. */
	onClose: () => void;
}

/** Heat penalties of the inspector: renders nothing unless the heat is running with a scoring. */
export interface HeatPenaltiesProps {
	round: Round;
	heat: Heat;
}

export interface ScoringEditorProps {
	/** Starting points offered in the editor, by name; defaults to the `scoringPresets` of the board, then of the core. */
	presets?: Record<string, ScoringConfig>;
}

export interface FormatEditorProps {
	/** Draw seed behind a preview and an application; defaults to the board's `createDrawSeed`, then a random integer. */
	createDrawSeed?: () => number;
	/** Called with the JSON when the user exports the format; defaults to the board's `onExportFormat`. */
	onExport?: (json: string) => void;
}

export interface RoundControlsProps {
	round: Round;
}

export type BracketToolbarProps = Record<string, never>;

export type AddRoundButtonProps = Record<string, never>;

export interface RoundStructureControlsProps {
	round: Round;
}

export interface HeatStructureControlsProps {
	round: Round;
	heat: Heat;
}

export interface EditableNameProps {
	value: string;
	/** Shown in the field while empty. */
	placeholder?: string;
	/** Heat names may be cleared; other names ignore an empty submission. */
	allowEmpty?: boolean;
	onSubmit: (name: string) => void;
}

export interface EntryFormProps {
	/** Entry round given to new entries; unset for the first round. */
	entryRoundId?: string;
}

export interface ConfirmDialogProps {
	action: Action;
	/** Set when the core asked for the confirmation; unset for confirmations the interface adds itself. */
	error?: BracketError;
	onConfirm: () => void;
	onCancel: () => void;
}

export interface BoardErrorProps {
	error: BracketError | ServerError;
	message: string;
	onDismiss: () => void;
}

/** Rendered inside an `li` provided by `EntryPool`: do not render an `li`. */
export interface EntryPoolItemProps {
	entry: Entry;
	roundId: string;
	rider?: unknown;
}

export interface BoardComponents {
	RoundColumn: ComponentType<RoundColumnProps>;
	HeatCard: ComponentType<HeatCardProps>;
	ParticipantRow: ComponentType<ParticipantRowProps>;
	EmptySlot: ComponentType<EmptySlotProps>;
	ResultBadge: ComponentType<ResultBadgeProps>;
	HeatStatusBadge: ComponentType<HeatStatusBadgeProps>;
	HeatTimer: ComponentType<HeatTimerProps>;
	ScoreBadge: ComponentType<ScoreBadgeProps>;
	JudgeRow: ComponentType<JudgeRowProps>;
	JudgeSheet: ComponentType<JudgeSheetProps>;
	JudgeQueueItem: ComponentType<JudgeQueueItemProps>;
	JudgeRideSheet: ComponentType<JudgeRideSheetProps>;
	ScorePicker: ComponentType<ScorePickerProps>;
	LycraStripe: ComponentType<LycraStripeProps>;
	BoardError: ComponentType<BoardErrorProps>;
	EntryPoolItem: ComponentType<EntryPoolItemProps>;
	HeatActions: ComponentType<HeatActionsProps>;
	RoundHeaderActions: ComponentType<RoundHeaderActionsProps>;
	Inspector: ComponentType<InspectorProps>;
	HeatControls: ComponentType<HeatControlsProps>;
	HeatPenalties: ComponentType<HeatPenaltiesProps>;
	ScoringEditor: ComponentType<ScoringEditorProps>;
	FormatEditor: ComponentType<FormatEditorProps>;
	RoundControls: ComponentType<RoundControlsProps>;
	BracketToolbar: ComponentType<BracketToolbarProps>;
	AddRoundButton: ComponentType<AddRoundButtonProps>;
	RoundStructureControls: ComponentType<RoundStructureControlsProps>;
	HeatStructureControls: ComponentType<HeatStructureControlsProps>;
	EditableName: ComponentType<EditableNameProps>;
	EntryForm: ComponentType<EntryFormProps>;
	ConfirmDialog: ComponentType<ConfirmDialogProps>;
}

export type HeadingLevel = 2 | 3 | 4 | 5;

export interface BoardSettings {
	mode: BoardMode;
	labels: Labels;
	headingLevel: HeadingLevel;
	lycraColors: string[];
	components: Partial<BoardComponents>;
	classNames: Partial<Record<BoardPart, string>>;
	styles: Partial<Record<BoardPart, CSSProperties>>;
	unstyled: boolean;
	riders: Record<string, unknown> | undefined;
	renderRiderName: ((entry: Entry, rider: unknown) => ReactNode) | undefined;
	getRiderLabel: ((entry: Entry, rider: unknown) => string) | undefined;
	getLycraColor:
		| ((slot: HeatSlot, index: number, heat: Heat) => string | undefined)
		| undefined;
	permissions: AdminPermissions;
	/** Admin boards fold the rounds after the next one while the bracket runs, each with its own toggle. */
	collapseFarRounds: boolean;
	createId: () => string;
	/** Notes of a heat, when the host has them: enables totals and judging from scores. */
	getHeatData: ((heatId: string) => HeatData | undefined) | undefined;
	/** Display result of a heat computed by the host; takes priority over `getHeatData` for display. */
	getHeatResult: ((heatId: string) => ViewerHeatResult | undefined) | undefined;
	/** Display name of a judge in the live notes; defaults to J1, J2... by order of appearance. */
	judgeLabel: ((judgeId: string) => string) | undefined;
	/** Presets offered by the scoring editor of the inspector. */
	scoringPresets: Record<string, ScoringConfig> | undefined;
	createDrawSeed: (() => number) | undefined;
	onExportFormat: ((json: string) => void) | undefined;
}

/** Plain-text name of a rider: `getRiderLabel`, else `displayName`, else the rider id. */
export function riderLabel(settings: BoardSettings, entry: Entry): string {
	return settings.getRiderLabel
		? settings.getRiderLabel(entry, settings.riders?.[entry.riderId])
		: entry.displayName || entry.riderId;
}

/** Entry of a rider id, or a stand-in carrying the id when the entries do not list it. */
export function entryOrStandIn(entries: Entry[], riderId: string): Entry {
	return (
		entries.find((e) => e.riderId === riderId) ?? {
			riderId,
			displayName: riderId,
		}
	);
}

export const NO_PERMISSIONS: AdminPermissions = {};

export const SettingsContext = createContext<BoardSettings | null>(null);

/**
 * Display settings shared by the provider, the board and the standalone components:
 * a value set on a component wins over the one of the enclosing component, then of `BracketProvider`.
 */
export interface PresentationProps<TRider = unknown> {
	/** `viewer` is read-only; `admin` enables drag and drop and the editing controls. */
	mode?: BoardMode;
	/** Level of the board title; rounds and heats go one and two levels deeper (capped at h6). */
	headingLevel?: HeadingLevel;
	/** Shallow override of the labels of the closest `HeatboardProvider`. */
	labels?: Partial<Labels>;
	/** Host rider records, keyed by rider id, handed to `renderRiderName`. */
	riders?: Record<string, TRider>;
	renderRiderName?: (entry: Entry, rider: TRider | undefined) => ReactNode;
	/** Plain-text name of a rider for labels, aria and messages; defaults to `displayName`, then the rider id. */
	getRiderLabel?: (entry: Entry, rider: TRider | undefined) => string;
	lycraColors?: string[];
	getLycraColor?: (
		slot: HeatSlot,
		index: number,
		heat: Heat,
	) => string | undefined;
	/** Define replacement components outside of render: new identities remount the subtree. */
	components?: Partial<BoardComponents>;
	classNames?: Partial<Record<BoardPart, string>>;
	styles?: Partial<Record<BoardPart, CSSProperties>>;
	/** Drops every built-in `hb-` class; only `classNames` and `styles` apply. */
	unstyled?: boolean;
	/**
	 * Notes of a heat, kept by the host. With a scoring, running and judged heats show each rider's total,
	 * and the Judge button of a running heat ranks it from these notes. Pass a new function when the notes change.
	 */
	getHeatData?: (heatId: string) => HeatData | undefined;
	/**
	 * Display result of a heat, computed by the host (typically a public page fed by the server):
	 * takes priority over `getHeatData` for display and is never recomputed, what it lacks is not shown.
	 * The Judge button and the scoring preview keep using `getHeatData`.
	 */
	getHeatResult?: (heatId: string) => ViewerHeatResult | undefined;
	/** Display name of a judge in the live notes of the heat panel (default: J1, J2... by order of appearance). */
	judgeLabel?: (judgeId: string) => string;
}

/** Settings set by the closest provider or `Board`, or the global config outside of one. */
export function useBoardSettings(): BoardSettings {
	const fromBoard = useContext(SettingsContext);
	const config = useHeatboardConfig();
	return useMemo(
		(): BoardSettings =>
			fromBoard ?? {
				mode: "viewer",
				labels: config.labels,
				headingLevel: 2,
				lycraColors: config.lycraColors,
				components: {},
				classNames: {},
				styles: {},
				unstyled: false,
				riders: undefined,
				renderRiderName: undefined,
				getRiderLabel: undefined,
				getLycraColor: undefined,
				permissions: NO_PERMISSIONS,
				collapseFarRounds: false,
				createId: defaultActionId,
				getHeatData: undefined,
				getHeatResult: undefined,
				judgeLabel: undefined,
				scoringPresets: undefined,
				createDrawSeed: undefined,
				onExportFormat: undefined,
			},
		[fromBoard, config.labels, config.lycraColors],
	);
}

/** Inherited settings with the presentation props set here on top: maps merge by key, the rest replaces. */
export function usePresentation<TRider>(
	props: PresentationProps<TRider>,
): BoardSettings {
	const inherited = useBoardSettings();
	const {
		mode,
		headingLevel,
		labels,
		riders,
		renderRiderName,
		getRiderLabel,
		lycraColors,
		getLycraColor,
		components,
		classNames,
		styles,
		unstyled,
		getHeatData,
		getHeatResult,
		judgeLabel,
	} = props;
	return useMemo(
		(): BoardSettings => ({
			...inherited,
			mode: mode ?? inherited.mode,
			headingLevel: headingLevel ?? inherited.headingLevel,
			labels: { ...inherited.labels, ...labels },
			lycraColors: lycraColors ?? inherited.lycraColors,
			components: { ...inherited.components, ...components },
			classNames: { ...inherited.classNames, ...classNames },
			styles: { ...inherited.styles, ...styles },
			unstyled: unstyled ?? inherited.unstyled,
			riders: riders ?? inherited.riders,
			renderRiderName:
				(renderRiderName as BoardSettings["renderRiderName"]) ??
				inherited.renderRiderName,
			getRiderLabel:
				(getRiderLabel as BoardSettings["getRiderLabel"]) ??
				inherited.getRiderLabel,
			getLycraColor: getLycraColor ?? inherited.getLycraColor,
			getHeatData: getHeatData ?? inherited.getHeatData,
			getHeatResult: getHeatResult ?? inherited.getHeatResult,
			judgeLabel: judgeLabel ?? inherited.judgeLabel,
		}),
		[
			inherited,
			mode,
			headingLevel,
			labels,
			riders,
			renderRiderName,
			getRiderLabel,
			lycraColors,
			getLycraColor,
			components,
			classNames,
			styles,
			unstyled,
			getHeatData,
			getHeatResult,
			judgeLabel,
		],
	);
}

type ClassValue = string | false | null | undefined;

export function cx(...values: ClassValue[]): string | undefined {
	const joined = values.filter(Boolean).join(" ");
	return joined === "" ? undefined : joined;
}

/** `className` and `style` for one part: built-in classes unless unstyled, then host overrides. */
export function partProps(
	settings: BoardSettings,
	part: BoardPart,
	...base: ClassValue[]
): { className: string | undefined; style: CSSProperties | undefined } {
	return {
		className: cx(
			...(settings.unstyled ? [] : base),
			settings.classNames[part],
		),
		style: settings.styles[part],
	};
}

type HeadingTag = "h2" | "h3" | "h4" | "h5" | "h6";

/** Heading tag `depth` levels below the board title, capped at h6. */
export function headingTag(base: HeadingLevel, depth: number): HeadingTag {
	return `h${Math.min(base + depth, 6)}` as HeadingTag;
}
