import { createContext, useContext, useMemo } from "react";
import { findHeat, type Entry, type Heat, type Round } from "@heatboard/core";
import type { BracketController } from "./useBracket";

export const BracketContext = createContext<BracketController | null>(null);

/** Reads the controller provided by the closest `BracketProvider`. */
export function useBracketContext(): BracketController {
	const controller = useContext(BracketContext);
	if (!controller) {
		throw new Error("useBracketContext must be used within a BracketProvider");
	}
	return controller;
}

export function useRound(roundId: string): Round | undefined {
	return useBracketContext().bracket.rounds.find((r) => r.id === roundId);
}

export function useHeat(
	heatId: string,
): { round: Round; heat: Heat } | undefined {
	const found = findHeat(useBracketContext().bracket, heatId);
	const round = found?.round;
	const heat = found?.heat;
	return useMemo(
		() => (round && heat ? { round, heat } : undefined),
		[round, heat],
	);
}

export function useEntry(riderId: string): Entry | undefined {
	return useBracketContext().bracket.entries.find((e) => e.riderId === riderId);
}
