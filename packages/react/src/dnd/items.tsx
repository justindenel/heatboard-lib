import type { CSSProperties, ReactNode } from "react";
import { DragOverlay, useDroppable } from "@dnd-kit/core";
import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
	type SortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDndState } from "./context";
import {
	endId,
	poolId,
	poolZoneId,
	rankId,
	slotId,
	type DragSource,
	type DropTarget,
} from "./types";

const noShift: SortingStrategy = () => null;

// Behaviour the gestures depend on, kept inline so it survives `unstyled`.
const GESTURE_STYLE: CSSProperties = {
	touchAction: "manipulation",
	userSelect: "none",
	WebkitTouchCallout: "none",
};

interface ItemProps {
	className?: string | undefined;
	style?: CSSProperties | undefined;
	roleDescription: string;
	children: ReactNode;
}

/** Orders the riders of one heat; wraps the heat's rows. */
export function SortableHeat(props: {
	riderIds: string[];
	heatId: string;
	children: ReactNode;
}) {
	const items = props.riderIds.map((riderId) => slotId(props.heatId, riderId));
	return (
		<SortableContext items={items} strategy={verticalListSortingStrategy}>
			{props.children}
		</SortableContext>
	);
}

/** A rider row that can be dragged, and dropped onto, within a `SortableHeat`. */
export function SortableSlot(
	props: ItemProps & {
		heatId: string;
		riderId: string;
		locked: boolean;
		/** Why the row cannot be dragged; exposed on a locked row. */
		reason?: string | undefined;
	},
) {
	const { heatId, riderId, locked, reason, className, style, roleDescription } =
		props;
	const source: DragSource = { kind: "slot", heatId, riderId };
	const staysInPlace = useDndState()?.drop?.kind === "place";
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: slotId(heatId, riderId),
		data: source,
		disabled: { draggable: locked },
		attributes: { roleDescription },
	});
	const dragProps = locked ? {} : { ...attributes, ...listeners };
	return (
		<div
			ref={setNodeRef}
			className={className}
			style={{
				...GESTURE_STYLE,
				...style,
				transform: CSS.Transform.toString(transform),
				transition: transition,
			}}
			data-dragging={isDragging && !staysInPlace ? "true" : undefined}
			title={locked ? reason : undefined}
			aria-description={locked ? reason : undefined}
			{...dragProps}
		>
			{props.children}
		</div>
	);
}

/** Orders the riders of a running heat in the inspector; wraps the ranking rows. */
export function RankList(props: {
	riderIds: string[];
	heatId: string;
	children: ReactNode;
}) {
	const items = props.riderIds.map((riderId) => rankId(props.heatId, riderId));
	return (
		<SortableContext items={items} strategy={verticalListSortingStrategy}>
			{props.children}
		</SortableContext>
	);
}

/**
 * A row of the ranking list. The pointer drags from anywhere on the row (a
 * press without movement still reaches the controls inside it); the keyboard
 * only from the handle, so keys typed in those controls never start a drag.
 */
export function RankRow(props: {
	heatId: string;
	riderId: string;
	className?: string | undefined;
	style?: CSSProperties | undefined;
	roleDescription: string;
	handleLabel: string;
	handleClassName?: string | undefined;
	handleStyle?: CSSProperties | undefined;
	handle: ReactNode;
	/** The row stays in the list but cannot be dragged; `reason` is exposed on it. */
	disabled?: boolean;
	reason?: string | undefined;
	children: ReactNode;
}) {
	const { heatId, riderId, disabled = false, reason } = props;
	const source: DragSource = { kind: "rank", heatId, riderId };
	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: rankId(heatId, riderId),
		data: source,
		disabled,
		attributes: { roleDescription: props.roleDescription },
	});
	return (
		<li
			ref={setNodeRef}
			className={props.className}
			style={{
				...GESTURE_STYLE,
				...props.style,
				transform: CSS.Transform.toString(transform),
				transition: transition,
			}}
			data-dragging={isDragging ? "true" : undefined}
			title={disabled ? reason : undefined}
			aria-description={disabled ? reason : undefined}
			{...(disabled ? {} : listeners)}
		>
			{!disabled && (
				<button
					ref={setActivatorNodeRef}
					type="button"
					className={props.handleClassName}
					style={{ ...GESTURE_STYLE, ...props.handleStyle }}
					aria-label={props.handleLabel}
					{...attributes}
				>
					{props.handle}
				</button>
			)}
			{props.children}
		</li>
	);
}

/** Makes the element a drop zone standing for the pool of a round; attach `setNodeRef` to it. */
export function usePoolDropZone(roundId: string | undefined, enabled: boolean) {
	const target: DropTarget = { kind: "pool", roundId: roundId ?? "" };
	return useDroppable({
		id: poolZoneId(roundId ?? ""),
		data: target,
		disabled: !enabled || roundId === undefined,
	});
}

/** Drop zone standing for the end of a heat, used by open slots. */
export function EndDropZone(props: {
	heatId: string;
	index: number;
	children: ReactNode;
}) {
	const target: DropTarget = { kind: "end", heatId: props.heatId };
	const { setNodeRef } = useDroppable({
		id: endId(props.heatId, props.index),
		data: target,
	});
	return <div ref={setNodeRef}>{props.children}</div>;
}

/**
 * Wraps the pool entries. Entries are registered as sortable items only
 * because the keyboard coordinates of dnd-kit can move nothing else; they
 * never shift nor accept drops.
 */
export function PoolList(props: {
	roundId: string;
	riderIds: string[];
	children: ReactNode;
}) {
	const items = props.riderIds.map((riderId) => poolId(props.roundId, riderId));
	return (
		<SortableContext items={items} strategy={noShift}>
			{props.children}
		</SortableContext>
	);
}

/** An unplaced entry that can be dragged into a heat. */
export function PoolDraggable(
	props: ItemProps & { roundId: string; riderId: string; preview: ReactNode },
) {
	const { roundId, riderId, preview, className, style, roleDescription } =
		props;
	const source: DragSource = { kind: "pool", roundId, riderId, preview };
	const { attributes, listeners, setNodeRef, isDragging } = useSortable({
		id: poolId(roundId, riderId),
		data: source,
		disabled: { droppable: true },
		attributes: { roleDescription },
	});
	return (
		<div
			ref={setNodeRef}
			className={className}
			style={{ ...GESTURE_STYLE, ...style }}
			data-dragging={isDragging ? "true" : undefined}
			{...attributes}
			{...listeners}
		>
			{props.children}
		</div>
	);
}

/** Visual copy of the dragged item, following the pointer. */
export function DragPreview(props: {
	render: (source: DragSource) => ReactNode;
	className?: string | undefined;
	style?: CSSProperties | undefined;
}) {
	const active = useDndState()?.active;
	return (
		<DragOverlay dropAnimation={null}>
			{active ? (
				<div className={props.className} style={props.style}>
					{props.render(active)}
				</div>
			) : null}
		</DragOverlay>
	);
}
