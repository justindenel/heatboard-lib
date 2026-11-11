import { useRacePause } from "../useRacePause";
import { RefusableButton } from "./admin";
import { partProps, useBoardSettings } from "./settings";

/**
 * The big pause button of the timing: pauses it (the heat in progress runs to the end first),
 * cancels that request, or resumes it with a break. Renders nothing while there is nothing to
 * pause. Meant for the organiser's page: the host decides who sees it.
 */
export function RacePauseButton() {
	const settings = useBoardSettings();
	const pause = useRacePause();
	const { className, style } = partProps(
		settings,
		"racePause",
		"hb-race-pause",
		pause?.state === "requested" && "hb-race-pause--requested",
		pause?.state === "paused" && "hb-race-pause--paused",
	);
	if (!pause) return null;

	return (
		<RefusableButton
			reason={pause.refusal}
			title={pause.hint}
			className={className}
			style={style}
			aria={{ "aria-pressed": pause.state !== "pause" }}
			onPress={() => pause.press()}
		>
			{pause.label}
		</RefusableButton>
	);
}
