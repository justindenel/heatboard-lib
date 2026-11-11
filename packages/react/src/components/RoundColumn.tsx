import { useId, useState } from "react";
import type { Bracket } from "@heatboard/core";
import { useBracketContext } from "../context";
import { IconButton } from "./admin";
import { Heading } from "./Heading";
import { HeatCard } from "./HeatCard";
import { ChevronIcon } from "./icons";
import { sameTarget, useInspector } from "./inspectorContext";
import { InRoundColumn } from "./roundColumnContext";
import { RoundHeaderActions } from "./RoundHeaderActions";
import {
	cx,
	partProps,
	useBoardSettings,
	type RoundColumnProps,
} from "./settings";

/**
 * Rounds after this index start folded: the round in progress and the next main round stay open,
 * with the repechage rounds that run in between.
 */
function lastOpenRoundIndex(bracket: Bracket): number {
	const current = bracket.rounds.findIndex((round) =>
		round.heats.some(
			(heat) => heat.status === "pending" || heat.status === "running",
		),
	);
	if (current === -1) return bracket.rounds.length;
	let last = current + 1;
	while (bracket.rounds[last]?.group === "repechage") last += 1;
	return last;
}

/** A round: title, size and qualification summary, then its heats. */
export function RoundColumn({ round, roundIndex }: RoundColumnProps) {
	const settings = useBoardSettings();
	const { bracket } = useBracketContext();
	const titleId = useId();
	const heatsId = useId();
	const Card = settings.components.HeatCard ?? HeatCard;
	const Actions = settings.components.RoundHeaderActions ?? RoundHeaderActions;
	const { selection } = useInspector();

	const foldable = settings.collapseFarRounds && bracket.status === "running";
	const [chosen, setChosen] = useState<boolean | undefined>(undefined);
	const collapsed =
		foldable && (chosen ?? roundIndex > lastOpenRoundIndex(bracket));

	const root = partProps(settings, "round", "hb-round");
	const header = partProps(settings, "roundHeader", "hb-round__header");
	const title = partProps(settings, "roundTitle", "hb-round__title");
	const meta = partProps(settings, "roundMeta", "hb-round__meta");
	const toggle = partProps(settings, "roundToggle", "hb-round__toggle");
	const summary = partProps(settings, "roundSummary", "hb-round__summary");
	const heats = partProps(settings, "heats", "hb-round__heats");
	const item = partProps(settings, "heatItem", "hb-round__heat");

	const heading = (
		<Heading
			depth={1}
			id={titleId}
			tabIndex={-1}
			data-hb-title="round"
			className={title.className}
			style={title.style}
		>
			{round.name}
		</Heading>
	);

	return (
		<section
			className={root.className}
			style={root.style}
			aria-labelledby={titleId}
			data-round-id={round.id}
			data-collapsed={collapsed ? "true" : undefined}
			data-selected={
				sameTarget(selection, { type: "round", roundId: round.id })
					? "true"
					: undefined
			}
		>
			<header
				className={cx(
					header.className,
					foldable && !settings.unstyled && "hb-round__header--foldable",
				)}
				style={header.style}
			>
				{heading}
				<p className={meta.className} style={meta.style}>
					<span>{settings.labels.maxPerHeat(round.maxPerHeat)}</span>{" "}
					{round.advancing > 0 && (
						<span>{settings.labels.advancing(round.advancing)}</span>
					)}
				</p>
				<Actions round={round} />
				{foldable && (
					<IconButton
						label={
							collapsed
								? settings.labels.expandRound(round.name)
								: settings.labels.collapseRound(round.name)
						}
						aria={{ "aria-expanded": !collapsed, "aria-controls": heatsId }}
						{...(toggle.className && { className: toggle.className })}
						onPress={() => setChosen(!collapsed)}
					>
						<ChevronIcon up={!collapsed} />
					</IconButton>
				)}
			</header>
			{collapsed ? (
				<p id={heatsId} className={summary.className} style={summary.style}>
					{settings.labels.roundCollapsedSummary(
						round.heats.length,
						round.heats.reduce(
							(sum, heat) =>
								sum + Math.max(round.maxPerHeat, heat.slots.length),
							0,
						),
					)}
				</p>
			) : (
				<ul id={heatsId} className={heats.className} style={heats.style}>
					{round.heats.map((heat, heatIndex) => (
						<li key={heat.id} className={item.className} style={item.style}>
							<InRoundColumn.Provider value={true}>
								<Card round={round} heat={heat} heatIndex={heatIndex} />
							</InRoundColumn.Provider>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
