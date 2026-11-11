import { useMemo } from "react";
import type { Heat, Round } from "@heatboard/core";
import { HeatPenalties } from "./HeatPenalties";
import {
	SettingsContext,
	usePresentation,
	type BoardSettings,
	type PresentationProps,
} from "./settings";

export interface JudgePenaltiesProps<TRider = unknown> extends Omit<
	PresentationProps<TRider>,
	"mode"
> {
	round: Round;
	heat: Heat;
}

/**
 * Penalties of a running heat outside of a `Board`, for a head judge: the same
 * section as the inspector's, with only the penalties controls enabled.
 */
export function JudgePenalties<TRider = unknown>({
	round,
	heat,
	...presentation
}: JudgePenaltiesProps<TRider>) {
	const base = usePresentation(presentation);
	const settings = useMemo<BoardSettings>(
		() => ({ ...base, mode: "admin", permissions: { penalties: true } }),
		[base],
	);
	return (
		<SettingsContext.Provider value={settings}>
			<HeatPenalties round={round} heat={heat} />
		</SettingsContext.Provider>
	);
}
