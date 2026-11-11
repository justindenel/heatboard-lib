import type { HeatStatus } from "@heatboard/core";

export type HeatTransitionLabel =
	"startHeat" | "cancelStart" | "judgeHeat" | "lockHeat" | "reopenHeat";

/** Allowed status changes of a heat; the first one is the usual way forward. */
export const HEAT_TRANSITIONS: Record<
	HeatStatus,
	{ status: HeatStatus; label: HeatTransitionLabel }[]
> = {
	pending: [{ status: "running", label: "startHeat" }],
	running: [
		{ status: "judged", label: "judgeHeat" },
		{ status: "pending", label: "cancelStart" },
	],
	judged: [
		{ status: "locked", label: "lockHeat" },
		{ status: "running", label: "reopenHeat" },
	],
	locked: [{ status: "judged", label: "reopenHeat" }],
};
