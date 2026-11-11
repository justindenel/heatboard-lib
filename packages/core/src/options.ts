import type { ParticipantStatus } from "./model";

export interface BracketOptions {
	allowCrossRoundMove?: boolean;
	statusOrder?: ParticipantStatus[];
}

/** Default options; `statusOrder` ranks DNS as the very last. */
export const DEFAULT_OPTIONS: Required<BracketOptions> = {
	allowCrossRoundMove: false,
	statusOrder: ["DNF", "DSQ", "DNS"],
};
