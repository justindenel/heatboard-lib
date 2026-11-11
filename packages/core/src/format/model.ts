import type { Link, Round } from "../model";

export interface FormatOutcome {
	/** Inclusive range of heat ranks, e.g. [1, 2]. */
	ranks: [number, number];
	/** Key of a later round. */
	to: string;
}

export type FormatPlacement = "branch" | "spread";

export interface FormatRound {
	key: string;
	name: string;
	/** Defaults to "main". */
	group?: string;
	heats: number;
	/** Ranks not listed are eliminated. */
	outcomes?: FormatOutcome[];
	optional?: boolean;
	/**
	 * How riders arriving in this round are placed in its heats. Defaults to "branch".
	 * Has no effect on riders entering the round directly.
	 */
	placement?: FormatPlacement;
	/**
	 * Seeds that join this round directly, taken from the riders entered without an entry round
	 * by seed priority. Only on a main round other than the first; 0 or absent means none.
	 */
	seedSlots?: number;
}

export type FormatFill = "serpentine" | "draw";

export interface FormatSettings {
	heatboardFormat: 1;
	name: string;
	description?: string;
	fill: FormatFill;
	/** In running order. */
	rounds: FormatRound[];
}

/** What the round-by-round editor stores next to a format; it is not part of the shared JSON. */
export interface FormatEditorState {
	/** Riders the format was planned for. */
	riders: number;
	/** One per main round, the final included, in order. */
	rounds: { auto: boolean; repechageAuto?: boolean }[];
}

export interface FormatIssue {
	/** Location in the JSON, e.g. `rounds[2].outcomes[0].to`; empty for the root. */
	path: string;
	message: string;
}

export type ParseFormatResult =
	{ ok: true; format: FormatSettings } | { ok: false; errors: FormatIssue[] };

export type FormatWarning =
	| {
			code: "REMATCH";
			roundId: string;
			heatId: string;
			sourceHeatId: string;
	  }
	| { code: "TOO_MANY_HEATS"; roundId: string; riders: number; heats: number };

export type BuiltRound = Round;

export type BuildFormatResult =
	| {
			ok: true;
			rounds: BuiltRound[];
			links: Link[];
			/** Planned riders per heat for each round id, counting those who will arrive through links. */
			sizes: Record<string, number[]>;
			warnings: FormatWarning[];
	  }
	| { ok: false; code: "UNKNOWN_ROUND"; riderId: string; entryRoundId: string };
