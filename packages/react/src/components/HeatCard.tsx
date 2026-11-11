import { useId, useRef } from "react";
import { Heading } from "./Heading";
import { HeatActions } from "./HeatActions";
import { sameTarget, useInspector } from "./inspectorContext";
import {
	getQualified,
	heatNumbers,
	raceFormatDrift,
	raceFormatOf,
} from "@heatboard/core";
import { useBracketContext } from "../context";
import { describeRaceFormat } from "../describeRaceFormat";
import {
	EndDropZone,
	SortableHeat,
	SortableSlot,
	displaySlots,
	dragAccess,
	useHeatDrop,
} from "../dnd";
import { useInspectable } from "./InspectorTrigger";
import { useInRoundColumn } from "./roundColumnContext";
import { EmptySlot } from "./EmptySlot";
import { heatLabel } from "./heatLabel";
import { HeatStatusBadge } from "./HeatStatusBadge";
import { HeatTimer } from "./HeatTimer";
import { totalsOf } from "./heatTotals";
import { isSeedEntry } from "./seedEntry";
import { heatResult } from "./liveNotes";
import { viewerSlots } from "./viewerOrder";
import { ParticipantRow } from "./ParticipantRow";
import {
	destinationText,
	originText,
	slotDestination,
	slotOrigins,
} from "./slotRoutes";
import { partProps, useBoardSettings, type HeatCardProps } from "./settings";

/** A heat: title, status, riders, then open slots up to the round maximum. */
export function HeatCard({ round, heat }: HeatCardProps) {
	const { bracket } = useBracketContext();
	const settings = useBoardSettings();
	const titleId = useId();
	const drop = useHeatDrop(heat.id);
	const admin = settings.mode === "admin";
	const Row = settings.components.ParticipantRow ?? ParticipantRow;
	const Empty = settings.components.EmptySlot ?? EmptySlot;
	const StatusBadge = settings.components.HeatStatusBadge ?? HeatStatusBadge;
	const Actions = settings.components.HeatActions ?? HeatActions;
	const Timer = settings.components.HeatTimer ?? HeatTimer;
	const inRoundColumn = useInRoundColumn();
	const { selection, panelId, open, close } = useInspector();
	const inspectable = useInspectable("heat", heat.id);
	const titleButton = useRef<HTMLButtonElement>(null);

	const qualified = new Set(getQualified(bracket, heat.id));
	const result = heatResult(bracket, heat, settings);
	const totals = result && totalsOf(result);
	// A judged heat reads by rank for everyone; the organiser's lycra order only holds until then.
	const started = heat.status === "judged" || heat.status === "locked";
	const ordered =
		admin && !started ? displaySlots(heat) : viewerSlots(heat, result);
	const access = dragAccess(bracket, heat);
	const rankingAllowed = settings.permissions.ranking !== false;
	// A judged heat of an admin board is a result: routes instead of open places.
	const compact =
		admin && (heat.status === "judged" || heat.status === "locked");
	const emptyIndexes = Array.from(
		{
			length: compact ? 0 : Math.max(0, round.maxPerHeat - heat.slots.length),
		},
		(_, i) => heat.slots.length + i,
	);
	const origins =
		admin && heat.status === "pending" ? slotOrigins(bracket, heat.id) : [];

	const root = partProps(
		settings,
		"heat",
		"hb-heat",
		`hb-heat--${heat.status}`,
		compact && "hb-heat--compact",
		drop && `hb-drop--${drop.status}`,
		drop?.kind && `hb-drop--${drop.kind}`,
	);
	const header = partProps(settings, "heatHeader", "hb-heat__header");
	const title = partProps(settings, "heatTitle", "hb-heat__title");
	const titleLink = partProps(
		settings,
		"heatTitleButton",
		"hb-heat__title-button",
	);
	const roundTag = partProps(settings, "heatRound", "hb-heat__round");
	const review = partProps(settings, "heatReview", "hb-heat__review");
	const ranWith = partProps(settings, "heatFormat", "hb-heat__format");
	const driftMark = partProps(settings, "heatFormatDrift", "hb-heat__drift");
	const drift = admin ? raceFormatDrift(bracket, heat.id) : undefined;
	const driftText =
		drift === "current"
			? settings.labels.raceFormat.driftCurrent
			: settings.labels.raceFormat.driftPrevious;
	const list = partProps(settings, "participants", "hb-heat__participants");
	const draggable = partProps(settings, "draggable", "hb-draggable");

	const rows = ordered.map(({ slot, index }) => {
		const locked =
			access.kind === "closed" ||
			(access.kind === "ranking" &&
				(slot.status !== undefined || !rankingAllowed));
		const reason =
			access.kind === "closed"
				? settings.labels.rankingReason[access.reason]
				: access.kind === "ranking" && slot.status !== undefined
					? settings.labels.rankingReason.status
					: undefined;
		const entry = bracket.entries.find((e) => e.riderId === slot.riderId);
		const route =
			compact && slot.status === undefined && slot.rank !== null
				? slotDestination(bracket, heat.id, slot.rank)
				: undefined;
		const row = (
			<Row
				round={round}
				heat={heat}
				slot={slot}
				index={index}
				entry={entry}
				qualified={qualified.has(slot.riderId)}
				seedEntry={isSeedEntry(bracket, round.id, slot.riderId)}
				rider={settings.riders?.[slot.riderId]}
				total={totals?.get(slot.riderId)}
				{...(route && {
					destination: destinationText(settings.labels, route),
				})}
			/>
		);
		return (
			<li key={slot.riderId}>
				{admin ? (
					<SortableSlot
						heatId={heat.id}
						riderId={slot.riderId}
						locked={locked}
						reason={reason}
						className={draggable.className}
						style={draggable.style}
						roleDescription={settings.labels.dndRoleDescription}
					>
						{row}
					</SortableSlot>
				) : (
					row
				)}
			</li>
		);
	});
	const openSlots = emptyIndexes.map((index) => {
		const origin = origins[index - heat.slots.length];
		const empty = (
			<Empty
				round={round}
				heat={heat}
				index={index}
				{...(origin && { origin: originText(settings.labels, origin) })}
			/>
		);
		return (
			<li key={`empty-${index}`}>
				{admin ? (
					<EndDropZone heatId={heat.id} index={index}>
						{empty}
					</EndDropZone>
				) : (
					empty
				)}
			</li>
		);
	});
	const items = [...rows, ...openSlots];

	const target = { type: "heat", heatId: heat.id } as const;
	const selected = sameTarget(selection, target);
	const name = heatLabel(bracket, heat.id, settings.labels);
	const number = heatNumbers(bracket)[heat.id];
	const numbered =
		heat.name !== undefined && number !== undefined
			? settings.labels.heatTitle(number)
			: undefined;
	// The round column already names the round.
	const tag = (inRoundColumn ? [numbered] : [numbered, round.name])
		.filter(Boolean)
		.map((part) => ` · ${part}`)
		.join("");
	const heading = (
		<Heading depth={2} className={title.className} style={title.style}>
			{inspectable ? (
				<button
					ref={titleButton}
					type="button"
					className={titleLink.className}
					style={titleLink.style}
					aria-label={settings.labels.openHeatPanel(name)}
					aria-expanded={selected}
					aria-controls={selected ? panelId : undefined}
					onClick={(event) => {
						if (selected) close();
						else open(target, event.currentTarget);
					}}
				>
					<span id={titleId}>{name}</span>
				</button>
			) : (
				<span id={titleId}>{name}</span>
			)}
			{/* Redundant with the round column: hidden from the accessible name of the heat. */}
			{tag && (
				<span
					className={roundTag.className}
					style={roundTag.style}
					aria-hidden="true"
				>
					{tag}
				</span>
			)}
		</Heading>
	);

	return (
		<section
			className={root.className}
			style={root.style}
			aria-labelledby={titleId}
			data-heat-id={heat.id}
			data-status={heat.status}
			data-selected={selected ? "true" : undefined}
			data-drop={drop?.status}
			data-drop-kind={drop?.kind}
			title={drop?.reason}
		>
			<header
				className={header.className}
				style={header.style}
				data-interactive={inspectable ? "true" : undefined}
				onClick={(event) => {
					if ((event.target as Element).closest("button, a, input")) return;
					titleButton.current?.click();
				}}
			>
				{heading}
				<StatusBadge status={heat.status} />
				{drift !== undefined && (
					<span
						className={driftMark.className}
						style={driftMark.style}
						role="img"
						tabIndex={0}
						title={driftText}
						aria-label={driftText}
					/>
				)}
				{(heat.status === "running" || heat.status === "pending") && (
					<Timer heatId={heat.id} />
				)}
				<Actions round={round} heat={heat} />
				{heat.needsReview && (
					<span className={review.className} style={review.style}>
						{settings.labels.needsReview}
					</span>
				)}
			</header>
			{!admin && heat.timing !== undefined && (
				<p className={ranWith.className} style={ranWith.style}>
					{describeRaceFormat(raceFormatOf(bracket, heat), settings.labels, {
						ran: true,
						judging: false,
					})}
				</p>
			)}
			<ol className={list.className} style={list.style}>
				{admin ? (
					<SortableHeat
						heatId={heat.id}
						riderIds={ordered.map(({ slot }) => slot.riderId)}
					>
						{items}
					</SortableHeat>
				) : (
					items
				)}
			</ol>
		</section>
	);
}
