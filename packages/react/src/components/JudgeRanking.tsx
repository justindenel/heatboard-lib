import { useEffect, useRef } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import { hasManualRanks, type Heat, type Round } from "@heatboard/core";
import { useBracketContext } from "../context";
import { rankableOrder } from "../dnd/ranking";
import { ChevronIcon } from "./icons";
import { ActionButton, ActionIconButton } from "./admin";
import {
	SettingsContext,
	cx,
	entryOrStandIn,
	partProps,
	riderLabel,
	useBoardSettings,
	usePresentation,
	type PresentationProps,
} from "./settings";

export interface JudgeRankingProps<
	TRider = unknown,
> extends PresentationProps<TRider> {
	round: Round;
	heat: Heat;
	/**
	 * Computed standing per rider (`useJudging`, `useHeadJudging`). While no manual order is set the
	 * list follows it, so moving a rider starts from the computed ranking instead of the draw.
	 */
	standings?: Record<string, { rank: number }>;
	/**
	 * Groups of riders the ranking could not separate, as in the `details.tiedRiderIds` of an
	 * `UNRESOLVED_TIE` refusal. While non-empty the section opens and these riders are highlighted.
	 */
	tiedRiderIds?: readonly (readonly string[])[];
}

/** `order` sorted by computed rank; riders without standing last, ties keep their order. */
export function orderByStanding(
	order: string[],
	standings: Record<string, { rank: number }> | undefined,
): string[] {
	if (!standings) return order;
	const rankOf = (riderId: string) =>
		standings[riderId]?.rank ?? Number.MAX_SAFE_INTEGER;
	return [...order].sort((a, b) => rankOf(a) - rankOf(b));
}

function Rows({
	heat,
	standings,
	tiedRiderIds,
}: {
	heat: Heat;
	standings: JudgeRankingProps["standings"];
	tiedRiderIds: JudgeRankingProps["tiedRiderIds"];
}) {
	const { bracket } = useBracketContext();
	const settings = useBoardSettings();
	const { labels } = settings;
	const section = partProps(
		settings,
		"inspectorSection",
		"hb-inspector__section",
	);
	const inner = (cls: string) => cx(!settings.unstyled && cls);
	const manual = hasManualRanks(heat);
	const tied = new Set((tiedRiderIds ?? []).flat());
	const block = useRef<HTMLDetailsElement>(null);
	const hasTie = tied.size > 0;
	useEffect(() => {
		if (hasTie && block.current) block.current.open = true;
	}, [hasTie, tiedRiderIds]);
	const order = manual
		? rankableOrder(heat)
		: orderByStanding(rankableOrder(heat), standings);
	if (heat.status !== "running" || order.length < 2) return null;

	const text = labels.judgeRanking;
	const nameOf = (riderId: string) =>
		riderLabel(settings, entryOrStandIn(bracket.entries, riderId));
	const moved = (from: number, to: number) => ({
		type: "setRanks" as const,
		heatId: heat.id,
		riderIds: arrayMove(order, from, to),
		override: true,
	});

	return (
		<details ref={block} className={inner("hb-judge-ranking__block")}>
			<summary className={inner("hb-judge-ranking__summary")}>
				<span>{text.title}</span>
				{manual && (
					<span className={inner("hb-judge-ranking__badge")} role="status">
						{text.manual}
					</span>
				)}
			</summary>
			<div className={section.className} style={section.style}>
				<p className={inner("hb-judge-ranking__hint")}>{text.hint}</p>
				{manual ? (
					<p className={inner("hb-judge-ranking__state")}>
						<ActionButton action={{ type: "clearRanks", heatId: heat.id }}>
							{text.revert}
						</ActionButton>
					</p>
				) : (
					standings && (
						<p className={inner("hb-judge-ranking__state")}>{text.computed}</p>
					)
				)}
				<ol className={inner("hb-judge-ranking")}>
					{order.map((riderId, index) => (
						<li
							key={riderId}
							className={cx(
								inner("hb-judge-ranking__row"),
								!settings.unstyled &&
									tied.has(riderId) &&
									"hb-judge-ranking__row--tied",
							)}
							data-tied={tied.has(riderId) ? "true" : undefined}
						>
							<span
								className={inner("hb-judge-ranking__position")}
								aria-label={text.position(index + 1, order.length)}
							>
								{index + 1}
							</span>
							<span className={inner("hb-judge-ranking__name")}>
								{nameOf(riderId)}
							</span>
							{tied.has(riderId) && (
								<span className={inner("hb-judge-ranking__badge-tied")}>
									{text.tied}
								</span>
							)}
							<ActionIconButton
								action={moved(index, Math.max(0, index - 1))}
								label={text.moveUp(nameOf(riderId))}
							>
								<ChevronIcon up />
							</ActionIconButton>
							<ActionIconButton
								action={moved(index, Math.min(order.length - 1, index + 1))}
								label={text.moveDown(nameOf(riderId))}
							>
								<ChevronIcon up={false} />
							</ActionIconButton>
						</li>
					))}
				</ol>
			</div>
		</details>
	);
}

/**
 * Manual order of a running heat outside of a `Board`, for a head judge: up and down buttons that send
 * `setRanks` with `override`, which judging the heat then keeps instead of ranking from the notes.
 */
export function JudgeRanking<TRider = unknown>(
	props: JudgeRankingProps<TRider>,
) {
	const settings = usePresentation(props);
	return (
		<SettingsContext.Provider value={settings}>
			<Rows
				heat={props.heat}
				standings={props.standings}
				tiedRiderIds={props.tiedRiderIds}
			/>
		</SettingsContext.Provider>
	);
}
