import type { ReactNode } from "react";

/**
 * What is being dragged: a rider already in a heat, a rider in the ranking
 * list of the inspector, or an unplaced entry from the pool.
 */
export type DragSource =
	| { kind: "slot"; heatId: string; riderId: string }
	| { kind: "rank"; heatId: string; riderId: string }
	| {
			kind: "pool";
			roundId: string;
			riderId: string;
			/** Preview rendered with the settings of the pool, captured when the drag starts. */
			preview?: ReactNode;
	  };

/** Where a drag can land: onto a rider's position, at the end of a heat, or on the pool of a round. */
export type DropTarget =
	| { kind: "slot"; heatId: string; riderId: string }
	| { kind: "rank"; heatId: string; riderId: string }
	| { kind: "end"; heatId: string }
	| { kind: "pool"; roundId: string };

export interface HeatDrop {
	heatId: string;
	status: "allowed" | "denied";
	/** Translated refusal message when denied. */
	reason?: string;
	/** `place` when the drop adds the rider to a later round and keeps its current place. */
	kind?: "place";
}

/** Drop feedback for the pool of a round while a drag hovers it. */
export interface PoolDrop {
	roundId: string;
	status: "allowed" | "denied";
	reason?: string;
}

export function slotId(heatId: string, riderId: string): string {
	return `slot:${heatId}:${riderId}`;
}

export function rankId(heatId: string, riderId: string): string {
	return `rank:${heatId}:${riderId}`;
}

export function poolZoneId(roundId: string): string {
	return `poolzone:${roundId}`;
}

export function poolId(roundId: string, riderId: string): string {
	return `pool:${roundId}:${riderId}`;
}

export function endId(heatId: string, index: number): string {
	return `end:${heatId}:${index}`;
}
