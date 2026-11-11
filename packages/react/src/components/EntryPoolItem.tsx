import {
	partProps,
	riderLabel,
	useBoardSettings,
	type EntryPoolItemProps,
} from "./settings";

/** One unplaced entry in the pool: its name, as a draggable chip. */
export function EntryPoolItem({ entry, rider }: EntryPoolItemProps) {
	const settings = useBoardSettings();
	const root = partProps(settings, "entryPoolItem", "hb-pool__item");
	const content = settings.renderRiderName
		? settings.renderRiderName(entry, rider)
		: riderLabel(settings, entry);
	return (
		<span
			className={root.className}
			style={root.style}
			data-rider-id={entry.riderId}
		>
			{content}
		</span>
	);
}
