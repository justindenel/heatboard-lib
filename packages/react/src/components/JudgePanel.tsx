import { useEffect, useRef, useState } from "react";
import { findHeat, scoringOf } from "@heatboard/core";
import { useHeatboardConfig } from "../config";
import { useBracketContext } from "../context";
import {
	useThemeProps,
	type ColorSchemeSetting,
	type HeatboardTheme,
} from "../theme";
import type { JudgingController } from "../useJudging";
import { Heading } from "./Heading";
import { heatLabel } from "./heatLabel";
import { HeatStatusBadge } from "./HeatStatusBadge";
import { HeatTimer } from "./HeatTimer";
import { figureText, judgeCategoriesOf } from "./judgeCategories";
import { JudgeQueueItem } from "./JudgeQueueItem";
import { JudgeRideSheet } from "./JudgeRideSheet";
import { JudgeRow } from "./JudgeRow";
import { JudgeSheet } from "./JudgeSheet";
import {
	SettingsContext,
	entryOrStandIn,
	partProps,
	riderLabel,
	usePresentation,
	type PresentationProps,
} from "./settings";

export interface JudgePanelProps<
	TRider = unknown,
> extends PresentationProps<TRider> {
	heatId: string;
	/** State and actions of the judge, from `useJudging`. */
	judging: JudgingController;
	theme?: HeatboardTheme;
	colorScheme?: ColorSchemeSetting;
}

interface SheetTarget {
	riderId: string;
	/** Set when an existing note is being edited. */
	noteId?: string;
}

const TOAST_MS = 8000;

/** Time into the heat as `m:ss`; empty when the heat has no start time. */
function timeInHeat(startedAt: string | undefined, at: string): string {
	if (startedAt === undefined) return "";
	const seconds = Math.floor((Date.parse(at) - Date.parse(startedAt)) / 1000);
	if (!Number.isFinite(seconds)) return "";
	const clamped = Math.max(0, seconds);
	return `${Math.floor(clamped / 60)}:${String(clamped % 60).padStart(2, "0")}`;
}

function scaleValues(scale: { min: number; max: number; step: number }) {
	const count = Math.round((scale.max - scale.min) / scale.step);
	return Array.from(
		{ length: count + 1 },
		(_, i) => Math.round((scale.min + i * scale.step) * 100) / 100,
	);
}

/**
 * Scoring page of one judge on one heat, designed for a phone: a row per rider,
 * a bottom sheet to score, a chip per note to edit or delete it.
 */
export function JudgePanel<TRider = unknown>(props: JudgePanelProps<TRider>) {
	const { heatId, judging } = props;
	const { bracket } = useBracketContext();
	const config = useHeatboardConfig();
	const settings = usePresentation(props);
	const themeProps = useThemeProps(props.theme, props.colorScheme);

	const found = findHeat(bracket, heatId);
	const scoring = found ? scoringOf(bracket, found.heat) : bracket.scoring;
	const categories = judgeCategoriesOf(scoring);
	const values = scoring ? scaleValues(scoring.scale) : [];

	const [target, setTarget] = useState<SheetTarget | null>(null);
	const [chosenCategory, setCategory] = useState<string | undefined>();
	const [figure, setFigure] = useState<string | undefined>();
	const [variant, setVariant] = useState<string | undefined>();
	const [menuNoteId, setMenuNoteId] = useState<string | null>(null);
	const [toast, setToast] = useState<{ riderId: string; value: number } | null>(
		null,
	);
	const [rideTarget, setRideTarget] = useState<string | null>(null);
	const [draft, setDraft] = useState<number | undefined>();
	const [queueDrafts, setQueueDrafts] = useState<Record<string, number>>({});
	const opener = useRef<HTMLElement | null>(null);
	const headMode = judging.mode === "headJudge";

	const category =
		categories.find((c) => c.type === chosenCategory)?.type ??
		categories[0]?.type ??
		"";
	const sheetOpen = target !== null && judging.canEdit;
	const rideSheetRide =
		rideTarget !== null && judging.canEdit
			? judging.notes.rides.find((r) => r.id === rideTarget)
			: undefined;
	const rideSheetOpen = rideSheetRide !== undefined;

	const closeSheet = () => {
		setTarget(null);
		setRideTarget(null);
		opener.current?.focus();
	};
	useEffect(() => {
		if (!sheetOpen && !rideSheetOpen && menuNoteId === null) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			if (sheetOpen || rideSheetOpen) {
				setTarget(null);
				setRideTarget(null);
				opener.current?.focus();
			} else {
				setMenuNoteId(null);
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [sheetOpen, rideSheetOpen, menuNoteId]);
	useEffect(() => {
		if (!toast) return;
		const timer = setTimeout(() => setToast(null), TOAST_MS);
		return () => clearTimeout(timer);
	}, [toast]);

	if (!found) return null;
	const { heat } = found;
	const Row = settings.components.JudgeRow ?? JudgeRow;
	const Sheet = settings.components.JudgeSheet ?? JudgeSheet;
	const QueueItem = settings.components.JudgeQueueItem ?? JudgeQueueItem;
	const RideSheet = settings.components.JudgeRideSheet ?? JudgeRideSheet;
	const Timer = settings.components.HeatTimer ?? HeatTimer;
	const StatusBadge = settings.components.HeatStatusBadge ?? HeatStatusBadge;
	const { labels: text } = settings;

	const root = partProps(settings, "judge", "hb-judge");
	const header = partProps(settings, "judgeHeader", "hb-judge__header");
	const title = partProps(settings, "judgeTitle", "hb-judge__title");
	const sync = partProps(settings, "judgeSync", "hb-judge__sync");
	const notice = partProps(settings, "judgeNotice", "hb-judge__notice");
	const list = partProps(settings, "judgeList", "hb-judge__list");
	const toastProps = partProps(settings, "judgeToast", "hb-judge__toast");
	const queue = partProps(settings, "judgeQueue", "hb-judge-queue");
	const queueTitle = partProps(
		settings,
		"judgeQueueTitle",
		"hb-judge__section-title",
	);
	const queueList = partProps(
		settings,
		"judgeQueueList",
		"hb-judge-queue__list",
	);
	const ridersSection = partProps(settings, "judgeRiders", "hb-judge__riders");
	const button = partProps(settings, "button", "hb-button");

	const heatName = heatLabel(bracket, heat.id, text);
	const nameOf = (riderId: string, index: number) => {
		const entry = entryOrStandIn(bracket.entries, riderId);
		const rider = settings.riders?.[riderId];
		const label = riderLabel(settings, entry);
		return {
			label,
			node: settings.renderRiderName
				? settings.renderRiderName(entry, rider)
				: label,
			color: settings.getLycraColor
				? settings.getLycraColor(heat.slots[index]!, index, heat)
				: settings.lycraColors[index % settings.lycraColors.length],
		};
	};

	const liveDrafts: Record<string, number> = {};
	for (const ride of judging.notes.rides) {
		const value = queueDrafts[ride.id];
		if (value !== undefined) liveDrafts[ride.id] = value;
	}
	const setQueueDraft = (rideId: string, value: number | undefined) => {
		const next = { ...liveDrafts };
		if (value === undefined) delete next[rideId];
		else next[rideId] = value;
		setQueueDrafts(next);
	};

	const openRide = (rideId: string, opening?: HTMLElement | null) => {
		const active = document.activeElement;
		opener.current = opening ?? (active instanceof HTMLElement ? active : null);
		const current = judging.notes.scores.find(
			(s) => s.rideId === rideId,
		)?.value;
		setDraft(typeof current === "number" ? current : undefined);
		setRideTarget(rideId);
	};

	const queueItems = headMode
		? judging.queue.flatMap((ride) => {
				const index = heat.slots.findIndex(
					(s) => s.riderId === ride.riderId && s.status === undefined,
				);
				if (index === -1) return [];
				const who = nameOf(ride.riderId, index);
				return [
					<li key={ride.id}>
						<QueueItem
							name={who.node}
							label={who.label}
							color={who.color}
							type={ride.type}
							figure={figureText(ride.figure, ride.variant)}
							time={timeInHeat(heat.startedAt, ride.at)}
							values={values}
							draft={liveDrafts[ride.id]}
							onSelect={(value) => setQueueDraft(ride.id, value)}
							onConfirm={() => {
								const value = liveDrafts[ride.id];
								if (value === undefined) return;
								judging.scoreRide(ride.id, value);
								setQueueDraft(ride.id, undefined);
							}}
							onUnseen={() => {
								judging.markUnseen(ride.id);
								setQueueDraft(ride.id, undefined);
							}}
						/>
					</li>,
				];
			})
		: [];

	const rows = heat.slots.flatMap((slot, index) => {
		if (slot.status !== undefined) return [];
		const standing = judging.standings[slot.riderId];
		const notes = headMode
			? (standing?.rides ?? [])
					.filter((r) => r.scores.length > 0)
					.map((r) => ({ ...r, counted: false }))
			: (standing?.rides ?? []);
		const who = nameOf(slot.riderId, index);
		const shownNotes = notes.map((n) => ({
			...n,
			...(n.figure !== undefined && {
				figure: figureText(n.figure, n.variant),
			}),
		}));
		return [
			<li key={slot.riderId}>
				<Row
					riderId={slot.riderId}
					name={who.node}
					label={who.label}
					color={who.color}
					rank={standing && notes.length > 0 ? standing.rank : undefined}
					total={standing?.total ?? 0}
					notes={shownNotes}
					disabled={!judging.canEdit}
					categories={categories.map((c) => c.type)}
					canAdd={!headMode}
					menuNoteId={menuNoteId}
					onOpen={(element) => {
						opener.current = element;
						setMenuNoteId(null);
						setFigure(undefined);
						setVariant(undefined);
						setTarget({ riderId: slot.riderId });
					}}
					onNoteMenu={(noteId) => {
						if (!headMode) {
							setMenuNoteId(noteId);
						} else if (noteId !== null) {
							openRide(noteId);
						}
					}}
					onEditNote={(noteId, element) => {
						const note = notes.find((n) => n.rideId === noteId);
						if (!note) return;
						opener.current = element;
						setCategory(note.type);
						setFigure(note.figure);
						setVariant(note.variant);
						setMenuNoteId(null);
						setTarget({ riderId: slot.riderId, noteId });
					}}
					onDeleteNote={(noteId) => {
						judging.deleteNote(noteId);
						setMenuNoteId(null);
					}}
				/>
			</li>,
		];
	});

	const sheetRider = sheetOpen
		? heat.slots.findIndex((s) => s.riderId === target.riderId)
		: -1;
	const sheetWho = sheetOpen ? nameOf(target.riderId, sheetRider) : undefined;
	const editedNote =
		sheetOpen && target.noteId !== undefined
			? judging.standings[target.riderId]?.rides.find(
					(n) => n.rideId === target.noteId,
				)
			: undefined;

	const pick = (value: number) => {
		if (!sheetOpen || !sheetWho) return;
		const chosen = categories.find((c) => c.type === category);
		const fig = chosen?.figures.length ? figure : undefined;
		const accepted = chosen?.groups
			.flatMap((group) => group.figures)
			.find((f) => f.code === fig)
			?.variants.some((v) => v.code === variant);
		const chosenVariant = accepted ? variant : undefined;
		if (target.noteId !== undefined) {
			judging.editNote(target.noteId, {
				value,
				type: category,
				figure: fig ?? null,
				variant: chosenVariant ?? null,
			});
		} else {
			const id = judging.addNote({
				riderId: target.riderId,
				type: category,
				value,
				...(fig !== undefined && { figure: fig }),
				...(chosenVariant !== undefined && { variant: chosenVariant }),
			});
			if (id !== null) setToast({ riderId: target.riderId, value });
		}
		setFigure(undefined);
		setVariant(undefined);
		closeSheet();
	};

	const rideSheetIndex = rideSheetRide
		? heat.slots.findIndex((s) => s.riderId === rideSheetRide.riderId)
		: -1;
	const rideSheetWho =
		rideSheetRide && rideSheetIndex !== -1
			? nameOf(rideSheetRide.riderId, rideSheetIndex)
			: undefined;

	const toastWho = toast
		? nameOf(
				toast.riderId,
				heat.slots.findIndex((s) => s.riderId === toast.riderId),
			).label
		: undefined;

	return (
		<SettingsContext.Provider value={settings}>
			<div
				className={root.className}
				{...themeProps}
				style={{ ...themeProps.style, ...root.style }}
				lang={config.locale}
				role="region"
				aria-label={heatName}
				data-heat-id={heat.id}
			>
				<header className={header.className} style={header.style}>
					<Heading depth={0} className={title.className} style={title.style}>
						{heatName}
					</Heading>
					<StatusBadge status={heat.status} />
					{heat.status === "running" && <Timer heatId={heat.id} />}
					<span
						className={sync.className}
						style={sync.style}
						role="status"
						data-status={judging.status}
						title={
							judging.error instanceof Error ? judging.error.message : undefined
						}
					>
						{text.judgeSync[judging.status]}
					</span>
				</header>
				{judging.disabledReason !== null && (
					<p className={notice.className} style={notice.style} role="status">
						{text.judgeDisabled[judging.disabledReason]}
					</p>
				)}
				{headMode && (
					<section className={queue.className} style={queue.style}>
						<Heading
							depth={1}
							className={queueTitle.className}
							style={queueTitle.style}
						>
							{text.judgeQueue} ({queueItems.length})
						</Heading>
						{queueItems.length === 0 ? (
							<p className={notice.className} style={notice.style}>
								{text.judgeQueueEmpty}
							</p>
						) : (
							<ol className={queueList.className} style={queueList.style}>
								{queueItems}
							</ol>
						)}
					</section>
				)}
				<section
					className={headMode ? ridersSection.className : undefined}
					style={headMode ? ridersSection.style : undefined}
				>
					{headMode && (
						<Heading
							depth={1}
							className={queueTitle.className}
							style={queueTitle.style}
						>
							{text.judgeRiders}
						</Heading>
					)}
					{rows.length === 0 ? (
						<p className={notice.className} style={notice.style}>
							{text.judgeNoRiders}
						</p>
					) : (
						<ol className={list.className} style={list.style}>
							{rows}
						</ol>
					)}
				</section>
				{rideSheetRide && rideSheetWho && (
					<RideSheet
						name={rideSheetWho.node}
						label={rideSheetWho.label}
						color={rideSheetWho.color}
						type={rideSheetRide.type}
						figure={figureText(rideSheetRide.figure, rideSheetRide.variant)}
						values={values}
						draft={draft}
						current={
							judging.notes.scores.find((s) => s.rideId === rideSheetRide.id)
								?.value
						}
						onSelect={setDraft}
						onConfirm={() => {
							if (draft === undefined) return;
							judging.scoreRide(rideSheetRide.id, draft);
							closeSheet();
						}}
						onUnseen={() => {
							judging.markUnseen(rideSheetRide.id);
							closeSheet();
						}}
						onClose={closeSheet}
					/>
				)}
				{sheetOpen && sheetWho && (
					<Sheet
						name={sheetWho.node}
						label={sheetWho.label}
						color={sheetWho.color}
						total={judging.standings[target.riderId]?.total ?? 0}
						categories={categories}
						category={category}
						onCategory={(type) => {
							setCategory(type);
							setFigure(undefined);
							setVariant(undefined);
						}}
						figure={figure}
						onFigure={(code) => {
							setFigure(code);
							setVariant(undefined);
						}}
						variant={variant}
						onVariant={setVariant}
						values={values}
						currentValue={editedNote?.value}
						editing={editedNote !== undefined}
						onPick={pick}
						onClose={closeSheet}
					/>
				)}
				{toast && toastWho !== undefined && (
					<div
						className={toastProps.className}
						style={toastProps.style}
						role="status"
					>
						<span>
							{text.judgeNoteSaved(toastWho, text.formatScore(toast.value))}
						</span>
						<button
							type="button"
							className={button.className}
							style={button.style}
							onClick={() => {
								judging.undoLast();
								setToast(null);
							}}
						>
							{text.judgeUndo}
						</button>
					</div>
				)}
			</div>
		</SettingsContext.Provider>
	);
}
