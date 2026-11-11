import type { JudgingMode } from "../model";

/** `rideMeans` (head-judge ride means) needs shared rides, so it is only allowed in head-judge mode. */
export type ScoringMethod = "placings" | "points" | "rideMeans";
export type Aggregation = "mean" | "trimmedMean" | "sum";

export interface ScoringCategory {
	type: string;
	counted: number;
	coefficient?: number;
	/** Families of figures, defined by the organiser; absent or empty means none. */
	families?: ScoringFamily[];
	/** When true, the counted rides must belong to pairwise different families. Needs at least two families. */
	distinctFamilies?: boolean;
	/** Base figures a ride of this category may name; absent or empty means none. */
	figures?: ScoringFigure[];
}

export interface ScoringFamily {
	id: string;
	name: string;
}

export interface ScoringFigure {
	code: string;
	name?: string;
	/** Id of one of the families of the category. */
	family: string;
	/** Codes of the scoring-level variants this figure accepts; a variant keeps the family of its figure. */
	variants?: string[];
}

export interface ScoringVariant {
	code: string;
	name: string;
	/** Short form appended to the figure code, e.g. "1H". */
	suffix: string;
}

export interface ScoringConfig {
	method: ScoringMethod;
	scale: { min: number; max: number; step: number };
	categories: ScoringCategory[];
	/** Variants shared by the figures of every category. */
	variants?: ScoringVariant[];
	aggregation: Aggregation;
	trimPlacings?: boolean;
	priorityType?: string;
	/** Largest gap in seconds between two judges' notes grouped as the same move; default 30. */
	alignWindowSec?: number;
}

/** Who typed an entry: the judge of the slot, or an organiser acting as that slot. Set by the server, never by the client. */
export type EntryAuthor =
	{ kind: "judge" } | { kind: "organiser"; userId: string };

export interface Ride {
	id: string;
	riderId: string;
	type: string;
	at: string;
	figure?: string;
	/** Code of a variant accepted by the figure named by `figure`. */
	variant?: string;
	enteredBy?: EntryAuthor;
}

export interface Score {
	rideId: string;
	judgeId: string;
	/** `null` means the judge did not see the ride (head-judge mode only). */
	value: number | null;
	at: string;
	enteredBy?: EntryAuthor;
}

export type PenaltyKind = "halfSecondBest" | "zeroSecondBest" | "zeroBest";

export interface Penalty {
	riderId: string;
	type: string;
	kind: PenaltyKind;
}

export interface RideResult {
	rideId: string;
	type: string;
	at: string;
	figure?: string;
	variant?: string;
	/** Head-judge mode: mean (per `aggregation`) of the judges' notes, 0 when nobody saw the ride. */
	value: number;
	counted: boolean;
	/** Number of judges who gave a note. */
	judges: number;
	/** Free mode: the judge who scored the ride; absent while it has no valid score. */
	judgeId?: string;
	/** Every judge's answer on the ride; `null` is "not seen". Judges who have not answered are absent. */
	scores: Array<{ judgeId: string; value: number | null }>;
}

export interface RiderResult {
	riderId: string;
	rank: number;
	tied: boolean;
	total: number;
	byType: Record<string, number>;
	rides: RideResult[];
	placingsSum?: number;
	placesByJudge?: Record<string, number>;
	interferences: number;
	dsqSuggested: boolean;
	missingScores: boolean;
}

export type ScoringIssueCode =
	| "MISSING_SCORE"
	| "INVALID_SCORE"
	| "UNKNOWN_TYPE"
	| "UNKNOWN_RIDE"
	| "UNKNOWN_RIDER"
	| "DUPLICATE_SCORE"
	| "DUPLICATE_RIDE"
	| "UNKNOWN_FIGURE"
	| "UNKNOWN_VARIANT"
	| "RIDE_MULTIPLE_JUDGES";

export interface ScoringIssue {
	code: ScoringIssueCode;
	message: string;
	details?: Record<string, string | number>;
}

export interface ComputeOptions {
	/** Defaults to `free`; the `rideMeans` method always works on shared rides. */
	judgingMode?: JudgingMode;
}

export interface HeatResult {
	method: ScoringMethod;
	riders: RiderResult[];
	unresolvedTie: boolean;
	issues: ScoringIssue[];
}

export type RankingFromResult =
	{ ok: true; riderIds: string[] } | { ok: false; tiedRiderIds: string[][] };

export type ScoreNeeded =
	| { status: "reached" }
	| { status: "needed"; value: number }
	| {
			status: "impossible";
			reason?:
				| "UNKNOWN_TYPE"
				| "UNKNOWN_RIDER"
				| "INVALID_TARGET_RANK"
				| "INVALID_SCALE";
	  };

export interface AlignedNote {
	judgeId: string;
	rideId: string;
	value: number;
	figure?: string;
}

/** Notes of several judges taken to be the same move; display only, never used for ranking. */
export interface AlignedGroup {
	type: string;
	/** Mean time of the notes, ISO. */
	at: string;
	notes: AlignedNote[];
	/** Mean of the notes, rounded to two decimals. */
	mean: number;
	judges: number;
	/** Judges who scored at least one ride in the heat. */
	of: number;
	/** Most frequent figure among the notes naming one; absent on a tie or when none names one. */
	figure?: string;
	/** False when the notes name more than one distinct figure. */
	figureAgreement: boolean;
	complete: boolean;
}

export interface AlignedRider {
	riderId: string;
	groups: AlignedGroup[];
}
