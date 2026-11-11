import { scoringOf } from "@heatboard/core";
import { useBracketContext } from "../context";
import { ResultBadge } from "./ResultBadge";
import { ScoreBadge } from "./ScoreBadge";
import { fullTextOnHover } from "./fullTextOnHover";
import { LycraStripe } from "./LycraStripe";
import {
	cx,
	partProps,
	riderLabel,
	useBoardSettings,
	type ParticipantRowProps,
} from "./settings";

/**
 * One rider in a heat, on fixed columns so each figure stays at the same place from row to row:
 * lycra, rank or status, name, total, qualified marker.
 */
export function ParticipantRow(props: ParticipantRowProps) {
	const {
		heat,
		slot,
		index,
		entry,
		qualified,
		seedEntry,
		rider,
		total,
		destination,
	} = props;
	const { bracket } = useBracketContext();
	const settings = useBoardSettings();
	const Badge = settings.components.ResultBadge ?? ResultBadge;
	const Stripe = settings.components.LycraStripe ?? LycraStripe;
	const Total = settings.components.ScoreBadge ?? ScoreBadge;
	const inner = (name: string) => cx(!settings.unstyled && name);

	const row = partProps(
		settings,
		"participant",
		"hb-participant",
		qualified && "hb-participant--qualified",
		slot.status && `hb-participant--${slot.status.toLowerCase()}`,
	);
	const name = partProps(settings, "participantName", "hb-participant__name");

	const color = settings.getLycraColor
		? settings.getLycraColor(slot, index, heat)
		: settings.lycraColors[index % settings.lycraColors.length];
	const displayEntry = entry ?? {
		riderId: slot.riderId,
		displayName: slot.riderId,
	};
	const content = settings.renderRiderName
		? settings.renderRiderName(displayEntry, rider)
		: riderLabel(settings, displayEntry);
	const places = scoringOf(bracket, heat)?.method === "placings";

	return (
		<div
			className={row.className}
			style={row.style}
			title={destination?.text}
			data-rider-id={slot.riderId}
			data-destination={destination?.kind}
			data-qualified={qualified ? "true" : undefined}
		>
			<Stripe color={color} />
			<span className={inner("hb-participant__rank")}>
				<Badge slot={slot} qualified={qualified} />
			</span>
			<span
				className={name.className}
				style={name.style}
				{...fullTextOnHover()}
			>
				{content}
				{seedEntry && (
					<span
						className={inner("hb-participant__seed")}
						title={settings.labels.seedEntry.title}
					>
						{settings.labels.seedEntry.short}
					</span>
				)}
			</span>
			<span className={inner("hb-participant__total")}>
				{total !== undefined && <Total total={total} places={places} />}
			</span>
			<span className={inner("hb-participant__mark")} aria-hidden="true" />
			{qualified && (
				<span className={cx(!settings.unstyled && "hb-visually-hidden")}>
					{settings.labels.qualified}
				</span>
			)}
		</div>
	);
}
