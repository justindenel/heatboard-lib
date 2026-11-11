import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type ReactNode,
} from "react";
import {
	findHeat,
	type Action,
	type Bracket,
	type BracketError,
	type ScoringConfig,
} from "@heatboard/core";
import { useHeatboardConfig } from "../config";
import { useBracketContext } from "../context";
import { DragPreview, HeatboardDnd, useDndState } from "../dnd";
import { errorMessage } from "../labels";
import {
	useThemeProps,
	type ColorSchemeSetting,
	type HeatboardTheme,
} from "../theme";
import { defaultActionId, type DispatchResult } from "../useBracket";
import { RunContext } from "./admin";
import { AddRoundButton, useStructureEditable } from "./StructureControls";
import { ConfirmDialog } from "./ConfirmDialog";
import { BoardError } from "./BoardError";
import { DragPreviewItem } from "./DragPreviewItem";
import { Heading } from "./Heading";
import { Inspector } from "./Inspector";
import { hasLiveNotes } from "./liveNotes";
import { InspectorContext, targetExists } from "./inspectorContext";
import { InspectorTrigger } from "./InspectorTrigger";
import { RoundColumn } from "./RoundColumn";
import { openPlacesAtStart } from "./slotRoutes";
import {
	SettingsContext,
	NO_PERMISSIONS,
	partProps,
	usePresentation,
	type AdminPermissions,
	type BoardSelection,
	type BoardSettings,
	type PresentationProps,
} from "./settings";

export interface BoardProps<
	TRider = unknown,
> extends PresentationProps<TRider> {
	/** Overrides the theme and the color scheme of the closest `HeatboardProvider`. */
	theme?: HeatboardTheme;
	colorScheme?: ColorSchemeSetting;
	/** Admin controls to show; a missing key means allowed. */
	permissions?: AdminPermissions;
	/** Ids for new rounds, heats and entries; defaults to the strategy of action ids. */
	createId?: () => string;
	/** Shows the status and visibility badges next to the title (default `true`); hosts whose page already shows them can hide them. */
	showHeaderBadges?: boolean;
	/** Admin mode only (default `true`): while the bracket runs, rounds after the next one start folded and each has a toggle. */
	collapseFarRounds?: boolean;
	/** Presets offered by the scoring editor of the bracket panel (default: the core's `scoringPresets`). */
	scoringPresets?: Record<string, ScoringConfig>;
	/** Draw seed given to `applyFormat` and to its preview (default: a random integer). */
	createDrawSeed?: () => number;
	/** Receives the JSON when the user exports the round settings. */
	onExportFormat?: (json: string) => void;
	/** What the inspector shows (`null` for nothing); makes the selection controlled. */
	selection?: BoardSelection | null;
	onSelectionChange?: (selection: BoardSelection | null) => void;
}

interface Confirmation {
	action: Action;
	error: BracketError | undefined;
}

type FallbackTitle = { kind: "board" } | { kind: "round"; roundId: string };

interface Restore {
	opener: HTMLElement | null;
	fallback: FallbackTitle;
}

/** Actions the interface confirms itself, even when the core would apply them. */
const CONFIRMED_IN_UI: ReadonlySet<Action["type"]> = new Set([
	"reset",
	"removeRound",
	"removeHeat",
]);

/** Applying a format redraws round 1, which moves riders placed by hand. */
function replacesPlacements(bracket: Bracket, action: Action): boolean {
	return (
		action.type === "applyFormat" &&
		bracket.rounds.some((r) => r.heats.some((h) => h.slots.length > 0))
	);
}

function isConfirmed(action: Action): boolean {
	return (action as { confirm?: boolean }).confirm === true;
}

/** Title that takes the focus when the element that opened a confirmation is gone. */
function fallbackTitle(bracket: Bracket, action: Action): FallbackTitle {
	if (action.type === "removeHeat") {
		const found = findHeat(bracket, action.heatId);
		if (found) return { kind: "round", roundId: found.round.id };
	}
	return { kind: "board" };
}

/**
 * Renders the bracket of the closest `BracketProvider` as a column per round.
 * In admin mode it brings its own drag and drop context unless placed inside a `HeatboardDnd`.
 */
export function Board<TRider = unknown>(props: BoardProps<TRider>) {
	const insideDnd = useDndState() !== null;
	const presentation = usePresentation(props);
	const content = <BoardContent<TRider> {...props} />;
	if (presentation.mode !== "admin" || insideDnd) return content;
	return (
		<HeatboardDnd
			labels={presentation.labels}
			riders={presentation.riders}
			getRiderLabel={presentation.getRiderLabel}
		>
			{content}
		</HeatboardDnd>
	);
}

function BoardContent<TRider>(props: BoardProps<TRider>) {
	const { bracket, error, clearError, dispatch, canApply } =
		useBracketContext();
	const config = useHeatboardConfig();
	const dnd = useDndState();

	const {
		permissions,
		createId,
		collapseFarRounds,
		scoringPresets,
		createDrawSeed,
		onExportFormat,
	} = props;
	const showHeaderBadges = props.showHeaderBadges !== false;
	const themeProps = useThemeProps(props.theme, props.colorScheme);
	const presentation = usePresentation(props);
	const settings = useMemo(
		(): BoardSettings => ({
			...presentation,
			permissions: permissions ?? NO_PERMISSIONS,
			collapseFarRounds:
				presentation.mode === "admin" && collapseFarRounds !== false,
			createId: createId ?? defaultActionId,
			scoringPresets,
			createDrawSeed,
			onExportFormat,
		}),
		[
			presentation,
			permissions,
			createId,
			collapseFarRounds,
			scoringPresets,
			createDrawSeed,
			onExportFormat,
		],
	);
	const register = dnd?.registerAdminBoard;
	const admin = settings.mode === "admin";
	useEffect(() => (admin ? register?.() : undefined), [admin, register]);
	const Column = settings.components.RoundColumn ?? RoundColumn;
	const ErrorBanner = settings.components.BoardError ?? BoardError;
	const shownError = error ?? dnd?.error ?? null;
	const overlay = partProps(settings, "dragOverlay", "hb-drag-overlay");

	const AddRound = settings.components.AddRoundButton ?? AddRoundButton;
	const Dialog = settings.components.ConfirmDialog ?? ConfirmDialog;
	const InspectorPanel = settings.components.Inspector ?? Inspector;

	const rootRef = useRef<HTMLDivElement>(null);
	const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
	const restore = useRef<Restore | null>(null);

	const { selection: controlledSelection, onSelectionChange } = props;
	const [ownSelection, setOwnSelection] = useState<BoardSelection | null>(null);
	const selection =
		controlledSelection !== undefined ? controlledSelection : ownSelection;
	const select = useCallback(
		(next: BoardSelection | null) => {
			if (controlledSelection === undefined) setOwnSelection(next);
			onSelectionChange?.(next);
		},
		[controlledSelection, onSelectionChange],
	);
	const viewable = (target: BoardSelection) => {
		if (admin) return true;
		if (target.type !== "heat") return false;
		const found = findHeat(bracket, target.heatId);
		return found !== undefined && hasLiveNotes(bracket, found.heat, settings);
	};
	const active =
		selection !== null &&
		targetExists(bracket, selection) &&
		viewable(selection)
			? selection
			: null;
	const inspectorId = useId();
	const inspectorOpener = useRef<HTMLElement | null>(null);
	const inspectorApi = useMemo(
		() => ({
			selection: active,
			panelId: inspectorId,
			open: (target: BoardSelection, opener: HTMLElement | null) => {
				inspectorOpener.current = opener;
				select(target);
			},
			close: () => select(null),
		}),
		[active, select, inspectorId],
	);
	const stale =
		(admin || selection?.type === "heat") &&
		selection !== null &&
		active === null;
	if (stale && controlledSelection === undefined) setOwnSelection(null);
	useEffect(() => {
		if (stale && controlledSelection !== undefined) onSelectionChange?.(null);
	}, [stale, controlledSelection, onSelectionChange]);

	const inspectorOpen = active !== null;
	const wasOpen = useRef(false);
	useEffect(() => {
		const closed = wasOpen.current && !inspectorOpen;
		wasOpen.current = inspectorOpen;
		if (!closed) return;
		const opener = inspectorOpener.current;
		inspectorOpener.current = null;
		if (restore.current !== null) return;
		const target =
			opener?.isConnected === true
				? opener
				: rootRef.current?.querySelector<HTMLElement>(
						'[data-hb-title="board"]',
					);
		target?.focus();
	}, [inspectorOpen]);

	const run = useCallback(
		(action: Action): DispatchResult => {
			const opener = document.activeElement as HTMLElement | null;
			const open = (error?: BracketError) => {
				restore.current = { opener, fallback: fallbackTitle(bracket, action) };
				setConfirmation({ action, error });
			};
			if (
				(CONFIRMED_IN_UI.has(action.type) ||
					replacesPlacements(bracket, action) ||
					openPlacesAtStart(bracket, action) > 0) &&
				!isConfirmed(action)
			) {
				const probe = canApply(action);
				if (probe.ok) {
					open();
					return probe;
				}
				if (probe.error.code === "DESTRUCTIVE_CHANGE") {
					open(probe.error);
					return probe;
				}
			}
			const result = dispatch(action);
			if (!result.ok && result.error.code === "DESTRUCTIVE_CHANGE") {
				clearError();
				open(result.error);
			}
			return result;
		},
		[bracket, canApply, dispatch, clearError],
	);

	const registerRunner = dnd?.registerRunner;
	useEffect(
		() => (admin ? registerRunner?.(run) : undefined),
		[admin, registerRunner, run],
	);

	useEffect(() => {
		if (confirmation !== null || restore.current === null) return;
		const { opener, fallback } = restore.current;
		restore.current = null;
		const target =
			opener && opener !== document.body && opener.isConnected
				? opener
				: rootRef.current?.querySelector<HTMLElement>(
						fallback.kind === "round"
							? `[data-round-id="${CSS.escape(fallback.roundId)}"] [data-hb-title]`
							: '[data-hb-title="board"]',
					);
		target?.focus();
	}, [confirmation]);

	const root = partProps(settings, "board", "hb-board");
	const frame = partProps(settings, "frame", "hb-board__frame");
	const main = partProps(settings, "main", "hb-board__main");
	const header = partProps(settings, "header", "hb-board__header");
	const title = partProps(settings, "title", "hb-board__title");
	const status = partProps(settings, "status", "hb-board__status", "hb-badge");
	const visibility = partProps(
		settings,
		"visibilityBadge",
		"hb-board__visibility",
		"hb-badge",
	);
	const rounds = partProps(settings, "rounds", "hb-board__rounds");
	const item = partProps(settings, "roundItem", "hb-board__round");
	const addItem = partProps(settings, "addRoundItem", "hb-board__add-round");

	return (
		<SettingsContext.Provider value={settings}>
			<RunContext.Provider value={run}>
				<InspectorContext.Provider value={inspectorApi}>
					<div
						ref={rootRef}
						className={root.className}
						{...themeProps}
						style={{ ...themeProps.style, ...root.style }}
						lang={config.locale}
						role="region"
						aria-label={bracket.name}
					>
						<div className={frame.className} style={frame.style}>
							<div className={main.className} style={main.style}>
								<header className={header.className} style={header.style}>
									<Heading
										depth={0}
										className={title.className}
										style={title.style}
										tabIndex={-1}
										data-hb-title="board"
									>
										{bracket.name}
									</Heading>
									{showHeaderBadges && (
										<span className={status.className} style={status.style}>
											{settings.labels.bracketStatus[bracket.status]}
										</span>
									)}
									{showHeaderBadges && admin && (
										<span
											className={visibility.className}
											style={visibility.style}
										>
											{settings.labels.visibility[bracket.visibility]}
										</span>
									)}
									<InspectorTrigger target={{ type: "bracket" }} />
								</header>
								{shownError && (
									<ErrorBanner
										error={shownError}
										message={errorMessage(settings.labels, shownError)}
										onDismiss={() => {
											clearError();
											dnd?.dismissError();
										}}
									/>
								)}
								<ol className={rounds.className} style={rounds.style}>
									{bracket.rounds.map((round, roundIndex) => (
										<li
											key={round.id}
											className={item.className}
											style={item.style}
										>
											<Column round={round} roundIndex={roundIndex} />
										</li>
									))}
									<AddRoundItem
										className={addItem.className}
										style={addItem.style}
									>
										<AddRound />
									</AddRoundItem>
								</ol>
							</div>
							{active && (
								<InspectorPanel target={active} onClose={() => select(null)} />
							)}
						</div>
						{confirmation && (
							<Dialog
								action={confirmation.action}
								error={confirmation.error}
								onCancel={() => setConfirmation(null)}
								onConfirm={() => {
									dispatch({ ...confirmation.action, confirm: true } as Action);
									setConfirmation(null);
								}}
							/>
						)}
						{settings.mode === "admin" && dnd && (
							<DragPreview
								className={overlay.className}
								style={overlay.style}
								render={(source) => <DragPreviewItem source={source} />}
							/>
						)}
					</div>
				</InspectorContext.Provider>
			</RunContext.Provider>
		</SettingsContext.Provider>
	);
}

function AddRoundItem(props: {
	className: string | undefined;
	style: CSSProperties | undefined;
	children: ReactNode;
}) {
	const editable = useStructureEditable();
	if (!editable) return null;
	return (
		<li className={props.className} style={props.style}>
			{props.children}
		</li>
	);
}
