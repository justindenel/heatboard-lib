import {
	partProps,
	useBoardSettings,
	type HeatStatusBadgeProps,
} from "./settings";

/** Text badge for the state of a heat. */
export function HeatStatusBadge({ status }: HeatStatusBadgeProps) {
	const settings = useBoardSettings();
	const { className, style } = partProps(
		settings,
		"heatStatusBadge",
		"hb-badge",
		"hb-heat-status",
		`hb-heat-status--${status}`,
	);
	return (
		<span className={className} style={style} data-status={status}>
			{settings.labels.heatStatus[status]}
		</span>
	);
}
