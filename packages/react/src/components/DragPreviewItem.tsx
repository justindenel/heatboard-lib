import { findHeat, getQualified } from "@heatboard/core";
import { useBracketContext } from "../context";
import type { DragSource } from "../dnd";
import { ParticipantRow } from "./ParticipantRow";
import { useBoardSettings } from "./settings";

/** Static copy of a dragged rider row or pool entry, rendered in the drag overlay. */
export function DragPreviewItem({ source }: { source: DragSource }) {
	const { bracket } = useBracketContext();
	const settings = useBoardSettings();
	if (source.kind === "pool") return <>{source.preview}</>;

	const entry = bracket.entries.find((e) => e.riderId === source.riderId);
	const rider = settings.riders?.[source.riderId];
	const found = findHeat(bracket, source.heatId);
	const index =
		found?.heat.slots.findIndex((s) => s.riderId === source.riderId) ?? -1;
	const slot = found?.heat.slots[index];
	if (!found || !slot) return null;
	const Row = settings.components.ParticipantRow ?? ParticipantRow;
	return (
		<Row
			round={found.round}
			heat={found.heat}
			slot={slot}
			index={index}
			entry={entry}
			qualified={getQualified(bracket, found.heat.id).includes(source.riderId)}
			rider={rider}
		/>
	);
}
