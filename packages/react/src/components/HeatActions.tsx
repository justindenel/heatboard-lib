import { heatNumbers, type Action } from "@heatboard/core";
import { useBracketContext } from "../context";
import { ActionIconButton, useAdmin } from "./admin";
import { PlayIcon } from "./icons";
import { partProps, useBoardSettings, type HeatActionsProps } from "./settings";

/** Start button of a pending heat; every other action lives in the inspector. */
export function HeatActions({ heat }: HeatActionsProps) {
	const { bracket } = useBracketContext();
	const settings = useBoardSettings();
	const { allowed } = useAdmin();
	const root = partProps(settings, "actions", "hb-actions");

	if (heat.status !== "pending" || !allowed("heatStatus")) return null;

	const action: Action = {
		type: "setHeatStatus",
		heatId: heat.id,
		status: "running",
	};
	const number = heatNumbers(bracket)[heat.id];
	const { labels } = settings;
	return (
		<div className={root.className} style={root.style}>
			<ActionIconButton
				action={action}
				label={
					number === undefined
						? labels.startHeat
						: labels.startHeatNumbered(number)
				}
				{...(bracket.scoring && {
					build: (): Action => ({ ...action, at: new Date().toISOString() }),
				})}
			>
				<PlayIcon />
			</ActionIconButton>
		</div>
	);
}
