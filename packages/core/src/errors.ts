import type { Bracket } from "./model";

export type BracketErrorCode =
	| "UNKNOWN_ROUND"
	| "UNKNOWN_HEAT"
	| "UNKNOWN_RIDER"
	| "RIDER_ALREADY_IN_ROUND"
	| "RIDER_NOT_IN_HEAT"
	| "HEAT_FULL"
	| "HEAT_LOCKED"
	| "HEAT_STARTED"
	| "HEAT_NOT_JUDGED"
	| "BEFORE_ENTRY_ROUND"
	| "CROSS_ROUND_MOVE"
	| "INVALID_RANKS"
	| "INVALID_MAX"
	| "MAX_BELOW_CURRENT"
	| "INVALID_STATUS_TRANSITION"
	| "DUPLICATE_ID"
	| "UNKNOWN_ACTION"
	| "HEAT_NOT_RANKED"
	| "HEAT_EMPTY"
	| "INVALID_ARGUMENT"
	| "INVALID_LINK"
	| "BRACKET_NOT_PUBLISHED"
	| "BRACKET_VALIDATED"
	| "ROUND_STARTED"
	| "RIDER_IN_STARTED_HEAT"
	| "DESTRUCTIVE_CHANGE"
	| "HEAT_JUDGED"
	| "HEAT_HAS_RANKS"
	| "HEAT_NOT_RUNNING"
	| "DOWNSTREAM_STARTED"
	| "ROUND_REFERENCED"
	| "NO_SCORING"
	| "INVALID_SCORING"
	| "UNRESOLVED_TIE"
	| "INVALID_PENALTY"
	| "INVALID_FORMAT"
	| "ROUND_LIMIT"
	| "DOUBLE_OPEN"
	| "DOUBLE_NOT_OPEN"
	| "DOUBLE_STARTED"
	| "DOUBLE_UNAVAILABLE"
	| "FORMAT_LOCKED"
	| "NOTHING_TO_SIMULATE"
	| "SIMULATE_WHILE_RUNNING";

export interface BracketError {
	code: BracketErrorCode;
	message: string;
	details?: Record<string, string | number | string[][]>;
}

export type ActionResult =
	{ ok: true; bracket: Bracket } | { ok: false; error: BracketError };
