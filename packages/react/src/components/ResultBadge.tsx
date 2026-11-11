import {
	cx,
	partProps,
	useBoardSettings,
	type ResultBadgeProps,
} from "./settings";

/** Rank or DNF/DSQ/DNS status of a rider in a heat; nothing while unranked. */
export function ResultBadge({ slot, qualified }: ResultBadgeProps) {
	const settings = useBoardSettings();
	const kind = slot.status ?? (slot.rank !== null ? "rank" : undefined);
	if (kind === undefined) return null;
	const { className, style } = partProps(
		settings,
		"resultBadge",
		"hb-badge",
		"hb-result",
		`hb-result--${kind.toLowerCase()}`,
		qualified && "hb-result--qualified",
	);
	if (slot.status) {
		const full = settings.labels.participantStatus[slot.status];
		return (
			<span className={className} style={style} data-result={kind}>
				<span aria-hidden="true" title={full}>
					{slot.status}
				</span>
				<span className={cx(!settings.unstyled && "hb-visually-hidden")}>
					{full}
				</span>
			</span>
		);
	}
	const rank = slot.rank as number;
	const full = settings.labels.rank(rank);
	return (
		<span className={className} style={style} data-result={kind}>
			<span aria-hidden="true" title={full}>
				{rank}
			</span>
			<span className={cx(!settings.unstyled && "hb-visually-hidden")}>
				{full}
			</span>
		</span>
	);
}
