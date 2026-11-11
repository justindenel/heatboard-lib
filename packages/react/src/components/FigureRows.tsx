import {
	useEffect,
	useRef,
	useState,
	type KeyboardEvent,
	type ReactNode,
} from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { ScoringCategory, ScoringConfig } from "@heatboard/core";
import { ChevronIcon, CloseIcon, GripIcon, PlusIcon, TrashIcon } from "./icons";
import type { FigureGroup, FigureRef } from "./figureEdits";
import { VariantMenu } from "./FigureVariants";
import { issueAt, type FormatIssue } from "./raceFormatDraft";
import { cx, useBoardSettings } from "./settings";

export const FAMILY_COLORS = [
	"#1d5fb8",
	"#c25e00",
	"#4b2f8f",
	"#2a9d4b",
	"#b3261e",
	"#7b838d",
];

export function familyColor(index: number): string {
	return FAMILY_COLORS[index % FAMILY_COLORS.length] ?? "#7b838d";
}

export interface DropMark {
	kind: "figure" | "family";
	familyId: string;
	/** Position in the displayed list before which the insertion line is drawn. */
	before: number;
}

interface RowProps {
	category: ScoringCategory;
	scoring: ScoringConfig;
	categoryIndex: number;
	groupIndex: number;
	groupSize: number;
	groups: number;
	figureRef: FigureRef;
	familyId: string;
	position: number;
	issues: readonly FormatIssue[];
	filtering: boolean;
	menuOpen: boolean;
	onMenu: (index: number | null) => void;
	onCategory: (change: (category: ScoringCategory) => ScoringCategory) => void;
	onStep: (index: number, direction: -1 | 1) => void;
	onRemove: (index: number) => void;
	onUpdate: (index: number, change: { code?: string; name?: string }) => void;
}

export function FigureRow(props: RowProps) {
	const { figureRef, familyId, position, filtering } = props;
	const { figure, index } = figureRef;
	const settings = useBoardSettings();
	const { labels } = settings;
	const words = labels.figuresEditor;
	const inner = (cls: string) => cx(!settings.unstyled && cls);
	const {
		setNodeRef: setDragRef,
		setActivatorNodeRef,
		listeners,
		isDragging,
	} = useDraggable({
		id: `figure:${index}`,
		data: { kind: "figure", index, familyId, position },
		disabled: filtering,
	});
	const { setNodeRef: setDropRef } = useDroppable({
		id: `row:${index}`,
		data: { kind: "row", familyId, position },
	});
	const path = `categories.${props.categoryIndex}.figures.${index}.code`;
	const issue = issueAt(props.issues, path);
	const accepted = figure.variants ?? [];
	const first = props.groupIndex === 0 && position === 0;
	const last =
		props.groupIndex === props.groups - 1 && position === props.groupSize - 1;

	const onGripKey = (event: KeyboardEvent) => {
		if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
		event.preventDefault();
		props.onStep(index, event.key === "ArrowUp" ? -1 : 1);
	};

	return (
		<div
			ref={(node) => {
				setDropRef(node);
				setDragRef(node);
			}}
			className={inner("hb-figures__row")}
			data-dragging={isDragging ? "" : undefined}
			data-family={familyId}
			data-figure-code={figure.code}
			data-position={position}
		>
			<button
				ref={setActivatorNodeRef}
				type="button"
				className={inner("hb-figures__grip")}
				aria-label={words.figureMove(figure.code)}
				disabled={filtering}
				onKeyDown={onGripKey}
				{...listeners}
			>
				<GripIcon />
			</button>
			<input
				className={inner("hb-input hb-figures__q hb-figures__code")}
				aria-label={words.figureCode}
				aria-invalid={issue ? true : undefined}
				value={figure.code}
				onChange={(event) =>
					props.onUpdate(index, { code: event.target.value })
				}
			/>
			<input
				className={inner("hb-input hb-figures__q")}
				aria-label={words.figureName}
				placeholder={figure.code || words.figureNameOptional}
				value={figure.name ?? ""}
				onChange={(event) =>
					props.onUpdate(index, { name: event.target.value })
				}
			/>
			<button
				type="button"
				className={inner("hb-figures__vars")}
				data-variants-button=""
				aria-label={words.figureVariants(figure.code)}
				aria-expanded={props.menuOpen}
				data-open={props.menuOpen ? "" : undefined}
				onClick={() => props.onMenu(props.menuOpen ? null : index)}
			>
				{accepted.length === 0 ? (
					<span className={inner("hb-figures__add-variant")}>
						{words.figureAddVariant}
					</span>
				) : (
					accepted.map((code) => (
						<span key={code} className={inner("hb-figures__chip")}>
							{props.scoring.variants?.find((v) => v.code === code)?.suffix ??
								code}
						</span>
					))
				)}
			</button>
			<span className={inner("hb-figures__updown")}>
				<button
					type="button"
					data-action="up"
					disabled={first}
					aria-label={words.figureUp(figure.code)}
					onClick={() => props.onStep(index, -1)}
				>
					<ChevronIcon up />
				</button>
				<button
					type="button"
					data-action="down"
					disabled={last}
					aria-label={words.figureDown(figure.code)}
					onClick={() => props.onStep(index, 1)}
				>
					<ChevronIcon up={false} />
				</button>
			</span>
			<button
				type="button"
				className={inner("hb-figures__icon")}
				aria-label={words.figureRemove(figure.code)}
				onClick={() => props.onRemove(index)}
			>
				<TrashIcon />
			</button>
			{issue && (
				<span className={inner("hb-scoring__error hb-figures__rowerr")}>
					{labels.scoringProblems[issue.code] ?? labels.errorGeneric}
				</span>
			)}
			{props.menuOpen && (
				<VariantMenu
					scoring={props.scoring}
					category={props.category}
					index={index}
					onChange={props.onCategory}
					onClose={() => props.onMenu(null)}
				/>
			)}
		</div>
	);
}

interface GroupProps {
	group: FigureGroup;
	groupIndex: number;
	groups: FigureGroup[];
	categoryIndex: number;
	issues: readonly FormatIssue[];
	filtering: boolean;
	visible: (figure: FigureRef) => boolean;
	drop: DropMark | null;
	autoRename: boolean;
	onRenamed: () => void;
	onRename: (id: string, name: string) => void;
	onMoveFamily: (id: string, direction: -1 | 1) => void;
	onRemoveFamily: (id: string, into: string | undefined) => void;
	onAddFigure: (id: string) => void;
	renderRow: (ref: FigureRef, position: number, size: number) => ReactNode;
}

export function FamilyGroup(props: GroupProps) {
	const { group, groupIndex, groups } = props;
	const settings = useBoardSettings();
	const { labels } = settings;
	const words = labels.figuresEditor;
	const inner = (cls: string) => cx(!settings.unstyled && cls);
	const { family } = group;
	const {
		setNodeRef: setDragRef,
		setActivatorNodeRef,
		listeners,
		isDragging,
	} = useDraggable({
		id: `family:${family.id}`,
		data: { kind: "family", familyId: family.id },
		disabled: props.filtering,
	});
	const { setNodeRef: setDropRef } = useDroppable({
		id: `group:${family.id}`,
		data: { kind: "group", familyId: family.id, size: group.figures.length },
	});
	const [renaming, setRenaming] = useState(props.autoRename);
	const [text, setText] = useState(family.name);
	const [removing, setRemoving] = useState(false);
	const [into, setInto] = useState("");
	const input = useRef<HTMLInputElement>(null);
	const nameIssue = issueAt(
		props.issues,
		`categories.${props.categoryIndex}.families.${groupIndex}.name`,
	);
	const others = groups.filter((g) => g.family.id !== family.id);

	useEffect(() => {
		if (renaming) input.current?.focus();
	}, [renaming]);
	const commit = () => {
		setRenaming(false);
		props.onRenamed();
		if (text !== family.name) props.onRename(family.id, text);
	};
	const targetHere =
		props.drop?.kind === "figure" && props.drop.familyId === family.id;
	const lineFamily =
		props.drop?.kind === "family" && props.drop.familyId === family.id
			? props.drop.before === groupIndex
				? "before"
				: "after"
			: undefined;
	const rows: ReactNode[] = [];
	group.figures.forEach((ref, p) => {
		if (!props.visible(ref)) return;
		if (targetHere && props.drop?.before === p) {
			rows.push(
				<div key={`line-${p}`} className={inner("hb-figures__dropline")} />,
			);
		}
		rows.push(props.renderRow(ref, p, group.figures.length));
	});
	if (targetHere && props.drop && props.drop.before >= group.figures.length) {
		rows.push(<div key="line-end" className={inner("hb-figures__dropline")} />);
	}

	return (
		<div
			ref={(node) => {
				setDropRef(node);
				setDragRef(node);
			}}
			role="group"
			aria-label={words.familyGroup(family.name)}
			className={inner("hb-figures__group")}
			data-target={targetHere ? "" : undefined}
			data-dragging={isDragging ? "" : undefined}
			data-line-family={lineFamily}
			data-family-key={family.id}
		>
			<div className={inner("hb-figures__group-head")}>
				<button
					ref={setActivatorNodeRef}
					type="button"
					className={inner("hb-figures__grip")}
					aria-label={words.familyMove(family.name)}
					disabled={props.filtering}
					onKeyDown={(event) => {
						if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
						event.preventDefault();
						props.onMoveFamily(family.id, event.key === "ArrowUp" ? -1 : 1);
					}}
					{...listeners}
				>
					<GripIcon />
				</button>
				<span
					className={inner("hb-figures__swatch")}
					style={{ background: familyColor(groupIndex) }}
				/>
				{renaming ? (
					<input
						ref={input}
						className={inner("hb-figures__name-input")}
						aria-label={words.familyName}
						aria-invalid={nameIssue ? true : undefined}
						value={text}
						onChange={(event) => setText(event.target.value)}
						onBlur={commit}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								commit();
							} else if (event.key === "Escape") {
								event.preventDefault();
								event.stopPropagation();
								setText(family.name);
								setRenaming(false);
								props.onRenamed();
							}
						}}
					/>
				) : (
					<button
						type="button"
						className={inner("hb-figures__name")}
						aria-label={words.familyRename(family.name)}
						onClick={() => {
							setText(family.name);
							setRenaming(true);
						}}
					>
						{family.name || "…"}
					</button>
				)}
				<span className={inner("hb-figures__count")}>
					{words.familyFigures(group.figures.length)}
				</span>
				<span className={inner("hb-figures__updown")}>
					<button
						type="button"
						data-action="family-up"
						disabled={groupIndex === 0}
						aria-label={words.familyUp(family.name)}
						onClick={() => props.onMoveFamily(family.id, -1)}
					>
						<ChevronIcon up />
					</button>
					<button
						type="button"
						data-action="family-down"
						disabled={groupIndex === groups.length - 1}
						aria-label={words.familyDown(family.name)}
						onClick={() => props.onMoveFamily(family.id, 1)}
					>
						<ChevronIcon up={false} />
					</button>
				</span>
				<button
					type="button"
					className={inner("hb-figures__icon")}
					aria-label={words.familyRemove(family.name)}
					aria-expanded={removing}
					onClick={() => {
						if (group.figures.length === 0) {
							props.onRemoveFamily(family.id, undefined);
							return;
						}
						setInto(others[0]?.family.id ?? "");
						setRemoving(!removing);
					}}
				>
					<CloseIcon />
				</button>
			</div>
			{nameIssue && (
				<p className={inner("hb-scoring__error hb-figures__rowerr")}>
					{labels.scoringProblems[nameIssue.code] ?? labels.errorGeneric}
				</p>
			)}
			{removing && (
				<div
					role="dialog"
					aria-label={words.removeTitle(family.name)}
					className={inner("hb-figures__confirm")}
				>
					<b>{words.removeTitle(family.name)}</b>
					{others.length > 0 ? (
						<>
							<p>{words.removeBody(group.figures.length)}</p>
							<select
								className={inner("hb-select")}
								aria-label={words.removeInto}
								value={into}
								onChange={(event) => setInto(event.target.value)}
							>
								{others.map((other) => (
									<option key={other.family.id} value={other.family.id}>
										{other.family.name}
									</option>
								))}
							</select>
						</>
					) : (
						<p>{words.removeAll(group.figures.length)}</p>
					)}
					<div className={inner("hb-figures__confirm-actions")}>
						<button
							type="button"
							className={inner("hb-button")}
							onClick={() => setRemoving(false)}
						>
							{labels.confirmCancel}
						</button>
						<button
							type="button"
							className={inner("hb-button hb-button--danger")}
							onClick={() => {
								setRemoving(false);
								props.onRemoveFamily(
									family.id,
									others.length > 0 ? into : undefined,
								);
							}}
						>
							{words.removeConfirm}
						</button>
					</div>
				</div>
			)}
			{rows}
			<button
				type="button"
				className={inner("hb-figures__add")}
				onClick={() => props.onAddFigure(family.id)}
			>
				<PlusIcon />
				{words.figureAdd(family.name)}
			</button>
		</div>
	);
}
