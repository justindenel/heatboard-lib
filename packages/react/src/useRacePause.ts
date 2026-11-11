import { errorMessage } from "./labels";
import { useBracketContext } from "./context";
import { useHeatboardConfig } from "./config";
import { useSchedule } from "./useSchedule";
import type { Action } from "@heatboard/core";
import type { DispatchResult } from "./useBracket";

export interface RacePause {
	/** `pause`: running; `requested`: the chain stops after the heat in progress; `paused`: stopped. */
	state: "pause" | "requested" | "paused";
	label: string;
	/** What the button does, for its tooltip. */
	hint: string;
	/** Translated reason when the core refuses the action; the button stays focusable. */
	refusal: string | undefined;
	press: () => DispatchResult;
}

/**
 * State of the race pause button, or `null` while there is nothing to pause or resume (the race
 * is not running, or its heats have no timer). The press sends `pauseRace`, `cancelPauseRequest`
 * or `resumeRace` according to the state.
 */
export function useRacePause(): RacePause | null {
	const { bracket, dispatch, canApply } = useBracketContext();
	const { labels } = useHeatboardConfig();
	const plan = useSchedule(bracket);
	const timed =
		plan.phase === "break" ||
		plan.phase === "waiting" ||
		(plan.phase === "heat" && plan.endsAt !== undefined);
	if (bracket.status !== "running" || !(timed || plan.phase === "paused")) {
		return null;
	}

	const { racePause } = labels;
	const paused = plan.phase === "paused";
	const action: Action = paused
		? { type: "resumeRace" }
		: plan.pauseRequested
			? { type: "cancelPauseRequest" }
			: { type: "pauseRace" };
	const probe = canApply(action);
	const [label, hint] = paused
		? [racePause.resume, racePause.resumeHint(bracket.timing?.breakSec ?? 0)]
		: plan.pauseRequested
			? [racePause.requested, racePause.requestedHint]
			: [racePause.pause, racePause.pauseHint];
	return {
		state: paused ? "paused" : plan.pauseRequested ? "requested" : "pause",
		label,
		hint,
		refusal: probe.ok ? undefined : errorMessage(labels, probe.error),
		press: () => dispatch(action),
	};
}
