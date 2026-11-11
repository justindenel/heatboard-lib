import { createContext, useContext } from "react";
import { findHeat, type Bracket } from "@heatboard/core";
import type { BoardSelection } from "./settings";

export interface InspectorApi {
	selection: BoardSelection | null;
	/** `id` of the inspector panel, for `aria-controls`. */
	panelId: string | undefined;
	/** `opener` gets the focus back when the inspector closes. */
	open: (target: BoardSelection, opener: HTMLElement | null) => void;
	close: () => void;
}

export const InspectorContext = createContext<InspectorApi>({
	selection: null,
	panelId: undefined,
	open: () => undefined,
	close: () => undefined,
});

export function useInspector(): InspectorApi {
	return useContext(InspectorContext);
}

export function targetKey(target: BoardSelection): string {
	switch (target.type) {
		case "heat":
			return `heat:${target.heatId}`;
		case "round":
			return `round:${target.roundId}`;
		case "bracket":
			return "bracket";
	}
}

export function sameTarget(
	a: BoardSelection | null,
	b: BoardSelection | null,
): boolean {
	return a !== null && b !== null && targetKey(a) === targetKey(b);
}

export function targetExists(bracket: Bracket, target: BoardSelection) {
	switch (target.type) {
		case "heat":
			return findHeat(bracket, target.heatId) !== undefined;
		case "round":
			return bracket.rounds.some((round) => round.id === target.roundId);
		case "bracket":
			return true;
	}
}
