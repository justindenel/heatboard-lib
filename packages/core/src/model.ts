import type { FormatEditorState, FormatSettings } from "./format/model";
import type { Penalty, ScoringConfig } from "./scoring/model";

export type ParticipantStatus = "DNF" | "DSQ" | "DNS";
export type HeatStatus = "pending" | "running" | "judged" | "locked";
export type BracketStatus =
	"draft" | "published" | "running" | "finished" | "validated";
export type Visibility = "private" | "public";
/** `free`: each judge creates their own rides; `headJudge`: the head judge announces shared rides. */
export type JudgingMode = "free" | "headJudge";

/** What the spectator view shows beyond rank and total; omitted fields follow the scoring method. */
export interface ViewerDisplay {
	typeSubtotals?: boolean;
	rides?: boolean;
	judgePlaces?: boolean;
	judges?: boolean;
}

/** Timing of the heats; absent fields mean no timer / no break. */
export interface RaceTiming {
	heatDurationSec?: number;
	breakSec?: number;
}

/** Automatic chaining of the heats: the break after a heat, then the next start; absent while nothing is going on. */
export interface RaceChain {
	/** `requested`: the running heat goes to the end of its timer, then the chain stops. `paused`: no automatic start. */
	pause?: "requested" | "paused";
	/** Break before the next heat; its duration is frozen when it starts. */
	break?: { startedAt: string; durationSec: number };
	/** The break is over but the next heat has no known rider yet. */
	waiting?: true;
}

export interface Entry {
	riderId: string;
	displayName: string;
	seed?: number;
	entryRoundId?: string;
}

export interface HeatSlot {
	riderId: string;
	rank: number | null;
	status?: ParticipantStatus;
	overridden?: boolean;
}

export interface Heat {
	id: string;
	name?: string;
	slots: HeatSlot[];
	/** Provisional order of the riders without status, set before any rank exists; slots keep the composition. */
	order?: string[];
	status: HeatStatus;
	needsReview?: boolean;
	/** ISO date of the start; only set on a heat that has started. */
	startedAt?: string;
	/** ISO date the timer ran out; set when the chain is settled, absent on a heat without duration. */
	endedAt?: string;
	/** Penalties entered while the heat runs; absent when there are none. */
	penalties?: Penalty[];
	/** Scoring in force when the heat started; later bracket scoring changes never apply to it. */
	scoring?: ScoringConfig;
	/** Race timing in force when the heat last started; cleared when it goes back to pending. */
	timing?: RaceTiming;
	/** Judging mode in force when the heat last started; cleared when it goes back to pending. */
	judgingMode?: JudgingMode;
}

export interface Round {
	id: string;
	name: string;
	group: string;
	maxPerHeat: number;
	advancing: number;
	/** Played only when needed (e.g. a super final); standings ignore it while no heat has started. */
	optional?: true;
	heats: Heat[];
}

export interface Link {
	from: { heatId: string; rank: number };
	to: { heatId: string } | "eliminated";
}

export interface Bracket {
	id: string;
	name: string;
	entries: Entry[];
	rounds: Round[];
	links: Link[];
	status: BracketStatus;
	visibility: Visibility;
	scoring?: ScoringConfig;
	/** Race timing applied to heats that start from now on. */
	timing?: RaceTiming;
	chain?: RaceChain;
	/** Absent means `free`. */
	judgingMode?: JudgingMode;
	viewerDisplay?: ViewerDisplay;
	/** Settings the rounds were generated from, with the draw seed used and the editor state, if any. */
	format?: {
		settings: FormatSettings;
		drawSeed: number;
		editor?: FormatEditorState;
	};
}
