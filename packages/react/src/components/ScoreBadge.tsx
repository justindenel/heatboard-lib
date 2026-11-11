import {
	cx,
	partProps,
	useBoardSettings,
	type ScoreBadgeProps,
} from "./settings";

/** Aggregated total of a rider in a heat, or with the placings method their place in it. */
export function ScoreBadge({ total, places }: ScoreBadgeProps) {
	const settings = useBoardSettings();
	const { className, style } = partProps(settings, "scoreBadge", "hb-total");
	if (places) {
		return (
			<span className={className} style={style} data-total={total}>
				{settings.labels.rank(total)}
			</span>
		);
	}
	const formatted = settings.labels.formatTotal(total);
	return (
		<span className={className} style={style} data-total={total}>
			<span aria-hidden="true" title={settings.labels.judgeTotal}>
				{formatted}
			</span>
			<span className={cx(!settings.unstyled && "hb-visually-hidden")}>
				{settings.labels.judgeTotal} {formatted}
			</span>
		</span>
	);
}
