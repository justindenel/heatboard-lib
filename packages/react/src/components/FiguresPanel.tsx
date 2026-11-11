import { useEffect, useRef, useState } from "react";
import {
	DndContext,
	DragOverlay,
	PointerSensor,
	closestCenter,
	pointerWithin,
	useSensor,
	useSensors,
	type Announcements,
	type CollisionDetection,
	type DragEndEvent,
	type DragOverEvent,
	type DragStartEvent,
} from "@dnd-kit/core";
import type { ScoringCategory } from "@heatboard/core";
import {
	addFamily,
	addFigure,
	groupsOf,
	moveFamily,
	moveFigureSpot,
	removeFamily,
	removeFigure,
	renameFamily,
	stepFigure,
	updateFigure,
	type FigureGroup,
	type FigureRef,
} from "./figureEdits";
import { VariantList } from "./FigureVariants";
import {
	FamilyGroup,
	FigureRow,
	familyColor,
	type DropMark,
} from "./FigureRows";
import { GripIcon, PlusIcon, SearchIcon } from "./icons";
import { useRaceFormatEditor } from "./raceFormatContext";
import { issuesUnder } from "./raceFormatDraft";
import { cx, useBoardSettings } from "./settings";

type Pending =
	| { kind: "figure"; familyId: string; position: number }
	| { kind: "family"; id: string }
	| { kind: "code"; familyId: string; position: number };

function sizeOf(groups: FigureGroup[], id: string): number {
	return groups.find((g) => g.family.id === id)?.figures.length ?? 0;
}

interface DragData {
	kind?: string;
	index?: number;
	familyId?: string;
}

const dataOf = (container: { data: { current?: unknown } }): DragData =>
	(container.data.current as DragData | undefined) ?? {};

const collisionDetection: CollisionDetection = (args) => {
	const kind = dataOf(args.active).kind;
	const only = (wanted: string) =>
		args.droppableContainers.filter(
			(container) => dataOf(container).kind === wanted,
		);
	if (kind === "family") {
		const groups = { ...args, droppableContainers: only("group") };
		const within = pointerWithin(groups);
		return within.length > 0 ? within : closestCenter(groups);
	}
	const rows = pointerWithin({ ...args, droppableContainers: only("row") });
	return rows.length > 0
		? rows
		: pointerWithin({ ...args, droppableContainers: only("group") });
};

/**
 * Families and figures of the category whose figures are open: one group per family, figures as
 * rows. Reorder by dragging, with ↑ ↓ on a row or from the keyboard on its handle; every move is announced.
 */
export function FiguresPanel() {
	const editor = useRaceFormatEditor();
	const settings = useBoardSettings();
	const { labels } = settings;
	const words = labels.figuresEditor;
	const inner = (cls: string) => cx(!settings.unstyled && cls);
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
	);
	const [query, setQuery] = useState("");
	const [menu, setMenu] = useState<number | null>(null);
	const [newFamily, setNewFamily] = useState<string | null>(null);
	const [announcement, setAnnouncement] = useState("");
	const [active, setActive] = useState<
		{ kind: "figure"; index: number } | { kind: "family"; id: string } | null
	>(null);
	const [drop, setDrop] = useState<DropMark | null>(null);
	const pending = useRef<Pending | null>(null);
	const root = useRef<HTMLDivElement>(null);

	const index = editor.figuresIndex;
	const { scoring } = editor;
	const category = index === null ? undefined : scoring?.categories[index];

	useEffect(() => {
		const todo = pending.current;
		if (!todo || !root.current) return;
		pending.current = null;
		const rows = [
			...root.current.querySelectorAll<HTMLElement>("[data-family]"),
		];
		const row = (familyId: string, position: number) =>
			rows.find(
				(el) =>
					el.dataset.family === familyId &&
					el.dataset.position === String(position),
			);
		if (todo.kind === "code") {
			row(todo.familyId, todo.position)?.querySelector("input")?.focus();
			return;
		}
		const scope =
			todo.kind === "figure"
				? row(todo.familyId, todo.position)
				: [
						...root.current.querySelectorAll<HTMLElement>("[data-family-key]"),
					].find((el) => el.dataset.familyKey === todo.id);
		const actions =
			todo.kind === "figure" ? ["up", "down"] : ["family-up", "family-down"];
		for (const action of actions) {
			const button = scope?.querySelector<HTMLButtonElement>(
				`[data-action="${action}"]`,
			);
			if (button && !button.disabled) {
				button.focus();
				return;
			}
		}
	});

	if (index === null || !category || !scoring) return null;
	const groups = groupsOf(category);
	const filtering = query.trim() !== "";
	const needle = query.trim().toLowerCase();
	const visible = (ref: FigureRef) =>
		!filtering ||
		ref.figure.code.toLowerCase().includes(needle) ||
		(ref.figure.name ?? "").toLowerCase().includes(needle);
	const anyVisible = groups.some((g) => g.figures.some(visible));
	const issues = editor.issues;
	const edit = (change: (c: ScoringCategory) => ScoringCategory) =>
		editor.patchCategory(index, change);
	const familyName = (id: string) =>
		category.families?.find((f) => f.id === id)?.name ?? "";
	const figureCode = (i: number) => category.figures?.[i]?.code ?? "";

	const moveFigureTo = (
		i: number,
		spot: { familyId: string; position: number },
	) => {
		const next = moveFigureSpot(category, i, spot);
		if (next === category) return;
		edit(() => next);
		setAnnouncement(
			words.movedFigure(
				figureCode(i),
				familyName(spot.familyId),
				spot.position + 1,
			),
		);
		pending.current = { kind: "figure", ...spot };
	};
	const step = (i: number, direction: -1 | 1) => {
		const moved = stepFigure(category, i, direction);
		if (!moved) return;
		edit(() => moved.category);
		setAnnouncement(
			words.movedFigure(
				figureCode(i),
				familyName(moved.spot.familyId),
				moved.spot.position + 1,
			),
		);
		pending.current = { kind: "figure", ...moved.spot };
	};
	const stepFamily = (id: string, direction: -1 | 1) => {
		const from = (category.families ?? []).findIndex((f) => f.id === id);
		if (from === -1) return;
		const next = moveFamily(category, id, from + direction);
		if (next === category) return;
		edit(() => next);
		setAnnouncement(words.movedFamily(familyName(id), from + direction + 1));
		pending.current = { kind: "family", id };
	};

	const sourceOf = (event: { active: { data: { current?: unknown } } }) =>
		event.active.data.current as
			| { kind: "figure"; index: number; familyId: string; position: number }
			| { kind: "family"; familyId: string }
			| undefined;
	const markFor = (event: DragOverEvent): DropMark | null => {
		const source = sourceOf(event);
		const over = event.over?.data.current as
			| { kind: "row"; familyId: string; position: number }
			| { kind: "group"; familyId: string; size: number }
			| undefined;
		if (!source || !over) return null;
		if (source.kind === "family") {
			if (over.kind !== "group") return null;
			const from = groups.findIndex((g) => g.family.id === source.familyId);
			const to = groups.findIndex((g) => g.family.id === over.familyId);
			if (from === -1 || to === -1 || from === to) return null;
			return {
				kind: "family",
				familyId: over.familyId,
				before: from < to ? to + 1 : to,
			};
		}
		const same = source.familyId === over.familyId;
		if (over.kind === "row") {
			if (same && over.position === source.position) return null;
			const down = same && source.position < over.position;
			return {
				kind: "figure",
				familyId: over.familyId,
				before: down ? over.position + 1 : over.position,
			};
		}
		return {
			kind: "figure",
			familyId: over.familyId,
			before: over.size,
		};
	};
	const finalOf = (event: DragEndEvent) => {
		const source = sourceOf(event);
		const over = event.over?.data.current as
			| { kind: "row"; familyId: string; position: number }
			| { kind: "group"; familyId: string; size: number }
			| undefined;
		return { source, over };
	};
	const onDragStart = (event: DragStartEvent) => {
		const source = sourceOf(event);
		if (source?.kind === "figure") {
			setActive({ kind: "figure", index: source.index });
		} else if (source?.kind === "family") {
			setActive({ kind: "family", id: source.familyId });
		}
	};
	const onDragEnd = (event: DragEndEvent) => {
		const { source, over } = finalOf(event);
		setActive(null);
		setDrop(null);
		if (!source || !over) return;
		if (source.kind === "family") {
			if (over.kind !== "group") return;
			const to = groups.findIndex((g) => g.family.id === over.familyId);
			const from = (category.families ?? []).findIndex(
				(f) => f.id === source.familyId,
			);
			if (to === -1 || from === -1 || to === from) return;
			edit((c) => moveFamily(c, source.familyId, to));
			setAnnouncement(words.movedFamily(familyName(source.familyId), to + 1));
			return;
		}
		const same = source.familyId === over.familyId;
		const position =
			over.kind === "row" ? over.position : over.size - (same ? 1 : 0);
		if (same && position === source.position) return;
		moveFigureTo(source.index, { familyId: over.familyId, position });
	};

	const nameOfDragged = (dragged: { data: { current?: unknown } }) => {
		const data = dataOf(dragged);
		return data.kind === "family"
			? familyName(data.familyId ?? "")
			: figureCode(data.index ?? -1);
	};
	const announcements: Announcements = {
		onDragStart: ({ active: a }) => words.dragPickedUp(nameOfDragged(a)),
		onDragOver: () => undefined,
		onDragEnd: () => undefined,
		onDragCancel: ({ active: a }) => words.dragCancelled(nameOfDragged(a)),
	};

	const ghost = (() => {
		if (!active) return null;
		if (active.kind === "family") {
			const at = groups.findIndex((g) => g.family.id === active.id);
			return (
				<div className={inner("hb-figures__ghost")}>
					<GripIcon />
					<span
						className={inner("hb-figures__swatch")}
						style={{ background: familyColor(at) }}
					/>
					{familyName(active.id)}
				</div>
			);
		}
		const figure = category.figures?.[active.index];
		return (
			<div className={inner("hb-figures__ghost")}>
				<GripIcon />
				{figure?.code}
				<span>{figure?.name}</span>
			</div>
		);
	})();

	const renderGroup = (group: FigureGroup, g: number) => {
		if (filtering && !group.figures.some(visible)) return null;
		return (
			<FamilyGroup
				key={group.family.id}
				group={group}
				groupIndex={g}
				groups={groups}
				categoryIndex={index}
				issues={issues}
				filtering={filtering}
				visible={visible}
				drop={drop}
				autoRename={newFamily === group.family.id}
				onRenamed={() => setNewFamily(null)}
				onRename={(id, name) => edit((c) => renameFamily(c, id, name))}
				onMoveFamily={stepFamily}
				onRemoveFamily={(id, into) => edit((c) => removeFamily(c, id, into))}
				onAddFigure={(id) => {
					edit((c) => addFigure(c, id));
					pending.current = {
						kind: "code",
						familyId: id,
						position: sizeOf(groups, id),
					};
				}}
				renderRow={(ref, position, size) => (
					<FigureRow
						key={ref.index}
						category={category}
						scoring={scoring}
						categoryIndex={index}
						groupIndex={g}
						groupSize={size}
						groups={groups.length}
						figureRef={ref}
						familyId={group.family.id}
						position={position}
						issues={issues}
						filtering={filtering}
						menuOpen={menu === ref.index}
						onMenu={setMenu}
						onCategory={edit}
						onStep={step}
						onRemove={(i) => {
							setMenu(null);
							edit((c) => removeFigure(c, i));
						}}
						onUpdate={(i, change) => edit((c) => updateFigure(c, i, change))}
					/>
				)}
			/>
		);
	};

	const total = (category.figures ?? []).length;
	const variantIssues = issuesUnder(issues, "variants");

	return (
		<div ref={root} className={inner("hb-figures")}>
			<p className={inner("hb-figures__hint")}>{words.hint}</p>
			<VariantList
				scoring={scoring}
				issues={variantIssues}
				onChange={editor.patchScoring}
			/>
			<div className={inner("hb-figures__tools")}>
				<label className={inner("hb-figures__search")}>
					<SearchIcon />
					<input
						className={inner("hb-input")}
						aria-label={words.search}
						placeholder={words.search}
						value={query}
						onChange={(event) => setQuery(event.target.value)}
					/>
				</label>
				<span className={inner("hb-figures__hint")}>
					{words.count(total, (category.families ?? []).length)}
				</span>
			</div>
			<div className={inner("hb-figures__cols")} aria-hidden="true">
				<span />
				<span>{words.columns.code}</span>
				<span>{words.columns.name}</span>
				<span>{words.columns.variants}</span>
				<span />
				<span />
			</div>
			<DndContext
				sensors={sensors}
				collisionDetection={collisionDetection}
				accessibility={{ announcements }}
				onDragStart={onDragStart}
				onDragOver={(event) => setDrop(markFor(event))}
				onDragEnd={onDragEnd}
				onDragCancel={() => {
					setActive(null);
					setDrop(null);
				}}
			>
				{groups.map(renderGroup)}
				<DragOverlay dropAnimation={null}>{ghost}</DragOverlay>
			</DndContext>
			{filtering && !anyVisible && (
				<p className={inner("hb-scoring__hint")}>{words.noResults}</p>
			)}
			<button
				type="button"
				className={inner("hb-figures__addfamily")}
				onClick={() => {
					const added = addFamily(category);
					edit(() => added.category);
					setNewFamily(added.id);
				}}
			>
				<PlusIcon />
				{words.familyAdd}
			</button>
			<p
				className={inner("hb-visually-hidden")}
				role="status"
				aria-live="polite"
			>
				{announcement}
			</p>
		</div>
	);
}
