import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import {
	DndContext,
	KeyboardCode,
	KeyboardSensor,
	MouseSensor,
	TouchSensor,
	closestCenter,
	pointerWithin,
	useSensor,
	useSensors,
	type Active,
	type Announcements,
	type Collision,
	type CollisionDetection,
	type DragEndEvent,
	type DragOverEvent,
	type DragStartEvent,
	type Over,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { findHeat, type Action, type Entry } from "@heatboard/core";
import { useHeatboardConfig } from "../config";
import { heatLabel } from "../components/heatLabel";
import { useBracketContext } from "../context";
import { errorMessage, type Labels } from "../labels";
import type { DispatchResult } from "../useBracket";
import { DndStateContext, type DndState } from "./context";
import { evaluateDrop } from "./evaluate";
import type { DragSource, DropTarget } from "./types";

const KEYBOARD_CODES = {
	start: [KeyboardCode.Space],
	cancel: [KeyboardCode.Esc],
	end: [KeyboardCode.Space],
};

type Outcome =
	| { type: "applied"; target: string; round: string; copy: boolean }
	| { type: "ranked"; rank: number }
	| { type: "reordered"; position: number }
	| { type: "unplaced" }
	| { type: "confirming" }
	| { type: "denied"; reason: string }
	| { type: "cancelled" };

function toSource(active: Active | null): DragSource | null {
	const data = active?.data.current as DragSource | undefined;
	return data?.kind === "slot" || data?.kind === "pool" || data?.kind === "rank"
		? data
		: null;
}

function toTarget(over: Over | null): DropTarget | null {
	const data = over?.data.current as DropTarget | undefined;
	return data?.kind === "slot" ||
		data?.kind === "end" ||
		data?.kind === "rank" ||
		data?.kind === "pool"
		? data
		: null;
}

function targetHeatId(target: DropTarget | null): string | undefined {
	return target && target.kind !== "pool" ? target.heatId : undefined;
}

function dataKind(container: { data: { current?: unknown } }): string {
	return (container.data.current as { kind?: string } | undefined)?.kind ?? "";
}

// The pool is a large panel: its center is rarely the closest one, so it only
// takes part while the pointer is over it. Ranking rows and heat rows never compete.
const collisionDetection: CollisionDetection = (args) => {
	const ranking = dataKind(args.active) === "rank";
	const droppableContainers = args.droppableContainers.filter(
		(container) => (dataKind(container) === "rank") === ranking,
	);
	const candidates = { ...args, droppableContainers };
	if (!args.pointerCoordinates) return closestCenter(candidates);
	const overPool = pointerWithin(candidates).filter((collision) => {
		const container = droppableContainers.find((c) => c.id === collision.id);
		return container !== undefined && dataKind(container) === "pool";
	});
	// Lists of later entry rounds sit inside the pool: the innermost one wins.
	const area = (id: Collision["id"]) => {
		const rect = droppableContainers.find((c) => c.id === id)?.rect.current;
		return rect ? rect.width * rect.height : Infinity;
	};
	if (overPool.length > 0) {
		return overPool.sort((a, b) => area(a.id) - area(b.id));
	}
	return closestCenter({
		...candidates,
		droppableContainers: droppableContainers.filter(
			(container) => dataKind(container) !== "pool",
		),
	});
};

/**
 * Drag and drop context for admin boards. `Board` and `EntryPool` rendered
 * inside it share one drag session; `Board` in admin mode adds its own when
 * used alone.
 */
export function HeatboardDnd<TRider = unknown>(props: {
	/** Shallow override of the labels used for refusal reasons and announcements. */
	labels?: Partial<Labels>;
	/** Host rider records, keyed by rider id, handed to `getRiderLabel`. */
	riders?: Record<string, TRider>;
	/** Plain-text name of a rider in the announcements; defaults to `displayName`, then the rider id. */
	getRiderLabel?: (entry: Entry, rider: TRider | undefined) => string;
	children: ReactNode;
}) {
	const controller = useBracketContext();
	const { bracket, canApply, dispatch } = controller;
	const config = useHeatboardConfig();
	const { labels: labelOverrides, riders, getRiderLabel } = props;
	const labels = useMemo(
		(): Labels => ({ ...config.labels, ...labelOverrides }),
		[config.labels, labelOverrides],
	);

	const [active, setActive] = useState<DragSource | null>(null);
	const [over, setOver] = useState<DropTarget | null>(null);
	const [error, setError] = useState<DndState["error"]>(null);
	const runner = useRef<((action: Action) => DispatchResult) | null>(null);
	const registerRunner = useCallback(
		(run: (action: Action) => DispatchResult) => {
			runner.current = run;
			return () => {
				if (runner.current === run) runner.current = null;
			};
		},
		[],
	);

	const sensors = useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 200, tolerance: 8 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
			keyboardCodes: KEYBOARD_CODES,
		}),
	);

	const [boards, setBoards] = useState(0);
	const registerAdminBoard = useCallback(() => {
		setBoards((n) => n + 1);
		return () => setBoards((n) => n - 1);
	}, []);

	const assess = useCallback(
		(source: DragSource, target: DropTarget) => {
			const evaluation = evaluateDrop(bracket, canApply, source, target);
			if (!evaluation) return null;
			if (evaluation.noop) return { status: "noop" as const, evaluation };
			if (
				evaluation.result.ok ||
				evaluation.result.error.code === "DESTRUCTIVE_CHANGE"
			) {
				return { status: "allowed" as const, evaluation };
			}
			return {
				status: "denied" as const,
				evaluation,
				reason: errorMessage(labels, evaluation.result.error),
			};
		},
		[bracket, canApply, labels],
	);

	const feedback = useMemo(() => {
		if (!active || !over || active.kind === "rank") return null;
		const assessment = assess(active, over);
		if (!assessment || assessment.status === "noop") return null;
		return { assessment, target: over };
	}, [active, over, assess]);

	const drop = useMemo((): DndState["drop"] => {
		if (!feedback || feedback.target.kind === "pool") return null;
		const { assessment, target } = feedback;
		if (assessment.status === "allowed") {
			return {
				heatId: target.heatId,
				status: "allowed",
				...(assessment.evaluation.copy && { kind: "place" as const }),
			};
		}
		return {
			heatId: target.heatId,
			status: "denied",
			reason: assessment.reason,
		};
	}, [feedback]);

	const poolDrop = useMemo((): DndState["poolDrop"] => {
		if (!feedback || feedback.target.kind !== "pool") return null;
		const { assessment, target } = feedback;
		return assessment.status === "allowed"
			? { roundId: target.roundId, status: "allowed" }
			: {
					roundId: target.roundId,
					status: "denied",
					reason: assessment.reason,
				};
	}, [feedback]);

	const dismissError = useCallback(() => setError(null), []);
	const state = useMemo(
		(): DndState => ({
			active,
			drop,
			poolDrop,
			error,
			dismissError,
			hasAdminBoard: boards > 0,
			registerAdminBoard,
			registerRunner,
		}),
		[
			active,
			drop,
			poolDrop,
			error,
			dismissError,
			boards,
			registerAdminBoard,
			registerRunner,
		],
	);

	const outcome = useRef<Outcome>({ type: "cancelled" });

	const riderName = useCallback(
		(source: DragSource | null) => {
			const riderId = source?.riderId ?? "";
			const entry = bracket.entries.find((e) => e.riderId === riderId);
			if (entry && getRiderLabel) {
				return getRiderLabel(entry, riders?.[riderId]);
			}
			return entry?.displayName || riderId;
		},
		[bracket.entries, getRiderLabel, riders],
	);

	const heatName = useCallback(
		(target: DropTarget | null) => {
			const heatId = targetHeatId(target);
			const found = heatId !== undefined && findHeat(bracket, heatId);
			if (!found) return undefined;
			return heatLabel(bracket, found.heat.id, labels);
		},
		[bracket, labels],
	);

	const roundName = useCallback(
		(target: DropTarget | null) => {
			const heatId = targetHeatId(target);
			return (
				(heatId !== undefined && findHeat(bracket, heatId)?.round.name) || ""
			);
		},
		[bracket],
	);

	const announcements = useMemo(
		(): Announcements => ({
			onDragStart: ({ active }) => labels.dndStart(riderName(toSource(active))),
			onDragOver: ({ active, over }) => {
				const source = toSource(active);
				const target = toTarget(over);
				const name = riderName(source);
				const assessment = source && target ? assess(source, target) : null;
				if (assessment?.status === "allowed" && assessment.evaluation.copy) {
					return labels.dndOverCopy(
						name,
						heatName(target) ?? "",
						roundName(target),
					);
				}
				const base =
					target?.kind === "pool"
						? labels.dndOverPool(name)
						: labels.dndOver(name, heatName(target));
				return assessment?.status === "denied"
					? `${base} ${assessment.reason}`
					: base;
			},
			onDragEnd: ({ active }) => {
				const name = riderName(toSource(active));
				const result = outcome.current;
				if (result.type === "ranked") {
					return labels.dndDropRank(name, labels.rank(result.rank));
				}
				if (result.type === "reordered") {
					return labels.dndDropOrder(name, labels.rank(result.position));
				}
				if (result.type === "unplaced") return labels.dndDropPool(name);
				if (result.type === "confirming") return labels.dndConfirm(name);
				if (result.type === "applied") {
					return result.copy
						? labels.dndDropCopy(name, result.target, result.round)
						: labels.dndDrop(name, result.target);
				}
				if (result.type === "denied") {
					return labels.dndRefused(name, result.reason);
				}
				return labels.dndCancel(name);
			},
			onDragCancel: ({ active }) =>
				labels.dndCancel(riderName(toSource(active))),
		}),
		[labels, riderName, heatName, roundName, assess],
	);

	const reset = () => {
		setActive(null);
		setOver(null);
	};

	const handleStart = (event: DragStartEvent) => {
		setError(null);
		setActive(toSource(event.active));
	};

	const handleOver = (event: DragOverEvent) => {
		setOver(toTarget(event.over));
	};

	const handleCancel = () => {
		outcome.current = { type: "cancelled" };
		reset();
	};

	const handleEnd = (event: DragEndEvent) => {
		const source = toSource(event.active);
		const target = toTarget(event.over);
		reset();
		const assessment = source && target ? assess(source, target) : null;
		if (!assessment || assessment.status === "noop") {
			outcome.current = { type: "cancelled" };
			return;
		}
		if (assessment.status === "denied") {
			outcome.current = { type: "denied", reason: assessment.reason };
			return;
		}
		const { action } = assessment.evaluation;
		const confirmable = runner.current !== null;
		const result = (runner.current ?? dispatch)(action);
		if (
			!result.ok &&
			result.error.code === "DESTRUCTIVE_CHANGE" &&
			confirmable
		) {
			setError(null);
			outcome.current = { type: "confirming" };
			return;
		}
		setError(result.ok ? null : result.error);
		if (!result.ok) {
			outcome.current = {
				type: "denied",
				reason: errorMessage(labels, result.error),
			};
		} else if (action.type === "setRanks") {
			outcome.current = {
				type: "ranked",
				rank: action.riderIds.indexOf(source?.riderId ?? "") + 1,
			};
		} else if (action.type === "reorderSlots") {
			outcome.current = {
				type: "reordered",
				position: action.riderIds.indexOf(source?.riderId ?? "") + 1,
			};
		} else if (action.type === "remove") {
			outcome.current = { type: "unplaced" };
		} else {
			outcome.current = {
				type: "applied",
				target: heatName(target) ?? "",
				round: roundName(target),
				copy: assessment.evaluation.copy,
			};
		}
	};

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={collisionDetection}
			accessibility={{
				announcements,
				screenReaderInstructions: { draggable: labels.dndInstructions },
			}}
			onDragStart={handleStart}
			onDragOver={handleOver}
			onDragEnd={handleEnd}
			onDragCancel={handleCancel}
		>
			<DndStateContext.Provider value={state}>
				{props.children}
			</DndStateContext.Provider>
		</DndContext>
	);
}
