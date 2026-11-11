import { createContext, useContext } from "react";
import type {
	Action,
	RaceFormat,
	RaceTiming,
	ScoringCategory,
	ScoringConfig,
} from "@heatboard/core";
import type {
	ChangedSections,
	FormatDraft,
	FormatIssue,
} from "./raceFormatDraft";

/** What the host of the editor owns of the race format: the timing fields. */
export interface HostTiming {
	/** Timing the host's fields describe; the timing in force while they are invalid. */
	next: RaceTiming;
	/** Number of invalid host fields; they stop the format from being saved. */
	errors: number;
	/** Puts the host's fields back to the timing in force. */
	reset: () => void;
}

export interface RaceFormatEditorState {
	draft: FormatDraft;
	scoring: ScoringConfig | null;
	presets: Record<string, ScoringConfig>;
	edit: (next: FormatDraft) => void;
	patchScoring: (change: (config: ScoringConfig) => ScoringConfig) => void;
	patchCategory: (
		index: number,
		change: (category: ScoringCategory) => ScoringCategory,
	) => void;
	issues: FormatIssue[];
	/** Problems of the draft plus those of the host's fields. */
	errorCount: number;
	changed: ChangedSections;
	changeCount: number;
	plan: Action[];
	current: RaceFormat;
	/** The race format once saved; the one in force while there are problems. */
	next: RaceFormat;
	saved: boolean;
	failure: string | null;
	save: () => void;
	discard: () => void;
	/** Category whose figures are open, if any. */
	figuresIndex: number | null;
	openFigures: (index: number) => void;
	closeFigures: () => void;
}

export const RaceFormatContext = createContext<RaceFormatEditorState | null>(
	null,
);

export function useRaceFormatEditor(): RaceFormatEditorState {
	const state = useContext(RaceFormatContext);
	if (!state) {
		throw new Error("The race format editor needs a RaceFormatProvider.");
	}
	return state;
}
