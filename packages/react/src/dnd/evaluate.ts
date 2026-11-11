import { findHeat } from "@heatboard/core";
import type { Action, ActionResult, Bracket } from "@heatboard/core";
import { arrayMove } from "@dnd-kit/sortable";
import { dragAccess, rankableOrder } from "./ranking";
import type { DragSource, DropTarget } from "./types";

export type DropResult =
	| { ok: true; bracket: Bracket }
	| { ok: false; error: { code: string; message: string } };

export interface DropEvaluation {
	action: Action;
	result: DropResult;
	/** The drop would leave the bracket unchanged. */
	noop: boolean;
	/** A rider of a heat is added to a later round and stays where it is. */
	copy: boolean;
}

/** `setRanks` (or `reorderSlots` while no rank is set) for a rider dropped onto another position, or `null` when nothing moves. */
function rankingAction(
	bracket: Bracket,
	heatId: string,
	riderId: string,
	target: DropTarget,
): Action | null {
	const found = findHeat(bracket, heatId);
	if (!found) return null;
	const order = rankableOrder(found.heat);
	const from = order.indexOf(riderId);
	if (from === -1) return null;
	const at =
		target.kind === "slot" || target.kind === "rank"
			? order.indexOf(target.riderId)
			: -1;
	const to = at === -1 ? order.length - 1 : at;
	if (from === to) return null;
	const riderIds = arrayMove(order, from, to);
	// An explicit reorder of existing ranks is an override: judging then keeps it instead of recomputing from the notes.
	const ranked = found.heat.slots.some((slot) => slot.rank !== null);
	return ranked
		? { type: "setRanks", heatId, riderIds, override: true }
		: { type: "reorderSlots", heatId, riderIds };
}

/** Translates a drag source and a drop target into the bracket action it stands for. */
export function buildAction(
	bracket: Bracket,
	source: DragSource,
	target: DropTarget,
): Action | null {
	if (target.kind === "pool") {
		return source.kind === "slot"
			? { type: "remove", riderId: source.riderId, heatId: source.heatId }
			: null;
	}
	if (source.kind === "rank") {
		return target.kind === "rank" && target.heatId === source.heatId
			? rankingAction(bracket, source.heatId, source.riderId, target)
			: null;
	}
	if (target.kind === "rank") return null;
	const found = findHeat(bracket, target.heatId);
	if (!found) return null;
	if (
		source.kind === "slot" &&
		source.heatId === target.heatId &&
		dragAccess(bracket, found.heat).kind === "ranking"
	) {
		return rankingAction(bracket, source.heatId, source.riderId, target);
	}
	const { slots } = found.heat;

	let index: number;
	if (target.kind === "slot") {
		const at = slots.findIndex((slot) => slot.riderId === target.riderId);
		if (at === -1) return null;
		index = at;
	} else {
		const sameHeat = source.kind === "slot" && source.heatId === target.heatId;
		index = sameHeat ? slots.length - 1 : slots.length;
	}

	if (source.kind === "pool") {
		return {
			type: "place",
			riderId: source.riderId,
			heatId: target.heatId,
			index,
		};
	}
	const origin = findHeat(bracket, source.heatId);
	if (origin && found.roundIndex > origin.roundIndex) {
		return {
			type: "place",
			riderId: source.riderId,
			heatId: target.heatId,
			index,
		};
	}
	return {
		type: "move",
		riderId: source.riderId,
		fromHeatId: source.heatId,
		toHeatId: target.heatId,
		index,
	};
}

/** Round whose list a rider returns to: the round where the rider enters, the first one by default. */
function entryRoundOf(bracket: Bracket, riderId: string): string | undefined {
	const entry = bracket.entries.find((e) => e.riderId === riderId);
	if (!entry) return undefined;
	return entry.entryRoundId ?? bracket.rounds[0]?.id;
}

/** Builds the action for a drop and asks the controller whether it would be accepted. */
export function evaluateDrop(
	bracket: Bracket,
	canApply: (action: Action) => ActionResult,
	source: DragSource,
	target: DropTarget,
): DropEvaluation | null {
	const action = buildAction(bracket, source, target);
	if (!action) return null;
	const sourceRound =
		source.kind === "pool"
			? source.roundId
			: target.kind === "pool"
				? findHeat(bracket, source.heatId)?.round.id
				: undefined;
	const targetRound =
		target.kind === "pool"
			? target.roundId
			: findHeat(bracket, target.heatId)?.round.id;
	const entryRound =
		source.kind === "slot" && target.kind === "pool"
			? entryRoundOf(bracket, source.riderId)
			: undefined;
	if (
		(source.kind === "pool" || target.kind === "pool") &&
		(sourceRound !== targetRound ||
			(entryRound !== undefined && entryRound !== targetRound))
	) {
		return {
			action,
			result: {
				ok: false,
				error: {
					code: "OTHER_POOL_ROUND",
					message: "Entries can only be placed in the round of their list",
				},
			},
			noop: false,
			copy: false,
		};
	}
	const result: ActionResult = canApply(action);
	return {
		action,
		result,
		noop: result.ok && result.bracket === bracket,
		copy: source.kind === "slot" && action.type === "place",
	};
}
