import { InspectorTrigger, useInspectable } from "./InspectorTrigger";
import {
	partProps,
	useBoardSettings,
	type RoundHeaderActionsProps,
} from "./settings";

/** Inspector trigger of a round header. */
export function RoundHeaderActions({ round }: RoundHeaderActionsProps) {
	const settings = useBoardSettings();
	const inspectable = useInspectable("round");
	const root = partProps(settings, "actions", "hb-actions");

	if (!inspectable) return null;

	return (
		<div
			className={root.className}
			style={root.style}
			role="group"
			aria-label={round.name}
		>
			<InspectorTrigger target={{ type: "round", roundId: round.id }} />
		</div>
	);
}
