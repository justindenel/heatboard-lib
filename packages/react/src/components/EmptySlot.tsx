import { fullTextOnHover } from "./fullTextOnHover";
import {
	cx,
	partProps,
	useBoardSettings,
	type EmptySlotProps,
} from "./settings";

/** Placeholder row for a place not yet filled in a heat; says where its rider will come from when known. */
export function EmptySlot({ origin }: Partial<EmptySlotProps>) {
	const settings = useBoardSettings();
	const { className, style } = partProps(
		settings,
		"emptySlot",
		"hb-empty-slot",
	);
	return (
		<div
			className={className}
			style={style}
			data-origin={origin ? "true" : undefined}
			title={origin ? settings.labels.emptySlot : undefined}
		>
			<span
				className={cx(!settings.unstyled && "hb-empty-slot__text")}
				{...(origin && fullTextOnHover(settings.labels.emptySlot))}
			>
				{origin ?? settings.labels.emptySlot}
			</span>
		</div>
	);
}
