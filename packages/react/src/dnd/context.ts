import { createContext, useContext } from "react";
import type { BracketError } from "@heatboard/core";
import type { ServerError } from "../useBracket";
import type { DragSource, HeatDrop, PoolDrop } from "./types";
import type { Action } from "@heatboard/core";
import type { DispatchResult } from "../useBracket";

export interface DndState {
	active: DragSource | null;
	drop: HeatDrop | null;
	poolDrop: PoolDrop | null;
	/** Error returned by `dispatch` for the last drop, until dismissed. */
	error: BracketError | ServerError | null;
	dismissError: () => void;
	/** True while at least one admin `Board` is mounted in the same context. */
	hasAdminBoard: boolean;
	/** Registers an admin `Board`; returns the cleanup. */
	registerAdminBoard: () => () => void;
	/** Registers the dispatcher that asks for confirmation; returns the cleanup. */
	registerRunner: (run: (action: Action) => DispatchResult) => () => void;
}

export const DndStateContext = createContext<DndState | null>(null);

/** Null outside of a `HeatboardDnd`. */
export function useDndState(): DndState | null {
	return useContext(DndStateContext);
}

/** Drop feedback for a heat while a drag hovers it, if any. */
export function useHeatDrop(heatId: string): HeatDrop | undefined {
	const drop = useContext(DndStateContext)?.drop;
	return drop?.heatId === heatId ? drop : undefined;
}

/** Drop feedback for the pool of a round while a drag hovers it, if any. */
export function usePoolDrop(roundId: string | undefined): PoolDrop | undefined {
	const poolDrop = useContext(DndStateContext)?.poolDrop;
	return poolDrop && poolDrop.roundId === roundId ? poolDrop : undefined;
}
