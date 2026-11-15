import type { ParticipantStatus } from "./model";

export interface BracketOptions {
	allowCrossRoundMove?: boolean;
	statusOrder?: ParticipantStatus[];
	/**
	 * Once a heat has started and advancement is automatic, refuses with `PLACEMENT_LOCKED` every action
	 * that changes which heat a rider sits in (place, remove, advance, draws, a move to another heat).
	 * Reordering riders inside one heat stays allowed.
	 */
	lockPlacementOnceStarted?: boolean;
}

/** Default options; `statusOrder` ranks DNS as the very last. */
export const DEFAULT_OPTIONS: Required<BracketOptions> = {
	allowCrossRoundMove: false,
	statusOrder: ["DNF", "DSQ", "DNS"],
	lockPlacementOnceStarted: false,
};
