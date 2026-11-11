import { useState, type CSSProperties } from "react";
import { scoringOf, type PenaltyKind } from "@heatboard/core";
import { useBracketContext } from "../context";
import { ActionButton, ActionIconButton, useAdmin } from "./admin";
import { Heading } from "./Heading";
import { CloseIcon } from "./icons";
import {
	cx,
	entryOrStandIn,
	partProps,
	riderLabel,
	useBoardSettings,
	type HeatPenaltiesProps,
} from "./settings";

const KINDS: readonly PenaltyKind[] = [
	"zeroBest",
	"zeroSecondBest",
	"halfSecondBest",
];

/**
 * Penalties of a running heat: list, add and remove. Two penalties on a rider
 * suggest a disqualification; the status itself stays a separate decision.
 */
export function HeatPenalties({ heat }: HeatPenaltiesProps) {
	const { bracket } = useBracketContext();
	const settings = useBoardSettings();
	const { allowed, labels } = useAdmin();
	const [type, setType] = useState("");
	const [kind, setKind] = useState<PenaltyKind>("zeroBest");

	const section = partProps(
		settings,
		"inspectorSection",
		"hb-inspector__section",
	);
	const sectionTitle = partProps(
		settings,
		"inspectorSectionTitle",
		"hb-inspector__section-title",
	);
	const root = partProps(settings, "penalties", "hb-penalties");
	const select = partProps(settings, "select", "hb-select");
	const inner = (cls: string) => cx(!settings.unstyled && cls);

	const scoring = scoringOf(bracket, heat);
	if (!allowed("penalties") || !scoring || heat.status !== "running") {
		return null;
	}

	const riders = heat.slots.flatMap((slot, index) =>
		slot.status === undefined ? [{ slot, index }] : [],
	);
	const types = scoring.categories.map((c) => c.type);
	const penalties = heat.penalties ?? [];
	const name = (id: string) =>
		riderLabel(settings, entryOrStandIn(bracket.entries, id));
	const chosenType = types.includes(type) ? type : (types[0] ?? "");

	const suggested = (riderId: string) =>
		penalties.filter((p) => p.riderId === riderId).length >= 2;
	const lycraOf = (index: number) => {
		const slot = heat.slots[index];
		if (!slot) return undefined;
		return settings.getLycraColor
			? settings.getLycraColor(slot, index, heat)
			: settings.lycraColors[index % settings.lycraColors.length];
	};

	return (
		<div className={section.className} style={section.style}>
			<Heading
				depth={2}
				className={sectionTitle.className}
				style={sectionTitle.style}
			>
				{labels.penalties}
			</Heading>
			<div className={root.className} style={root.style}>
				{penalties.length === 0 && (
					<p className={inner("hb-penalties__empty")}>{labels.penaltyNone}</p>
				)}
				<div className={inner("hb-penalties__form")}>
					<select
						className={select.className}
						style={select.style}
						aria-label={labels.penaltyType}
						value={chosenType}
						onChange={(e) => setType(e.target.value)}
					>
						{types.map((t) => (
							<option key={t} value={t}>
								{t}
							</option>
						))}
					</select>
					<select
						className={select.className}
						style={select.style}
						aria-label={labels.penaltyKind}
						value={kind}
						onChange={(e) => setKind(e.target.value as PenaltyKind)}
					>
						{KINDS.map((k) => (
							<option key={k} value={k}>
								{labels.penaltyKinds[k]}
							</option>
						))}
					</select>
				</div>
				<ul className={inner("hb-penalties__list")}>
					{riders.map(({ slot, index }) => {
						const who = name(slot.riderId);
						const own = penalties.filter((p) => p.riderId === slot.riderId);
						return (
							<li
								key={slot.riderId}
								className={inner("hb-penalties__rider")}
								style={
									{
										"--hb-judge-lycra": lycraOf(index) ?? "transparent",
									} as CSSProperties
								}
							>
								<span className={inner("hb-penalties__name")}>{who}</span>
								<ActionButton
									action={{
										type: "addPenalty",
										heatId: heat.id,
										penalty: { riderId: slot.riderId, type: chosenType, kind },
									}}
									ariaLabel={`${labels.penaltyAdd} · ${who}`}
								>
									+
								</ActionButton>
								{own.length > 0 && (
									<ul className={inner("hb-penalties__chips")}>
										{own.map((penalty, i) => {
											const kindLabel = labels.penaltyKinds[penalty.kind];
											const description = labels.penaltyItem(
												who,
												penalty.type,
												kindLabel,
											);
											return (
												<li key={i} className={inner("hb-penalties__chip")}>
													<span>
														{penalty.type} · {kindLabel}
													</span>
													<ActionIconButton
														action={{
															type: "removePenalty",
															heatId: heat.id,
															penalty,
														}}
														label={labels.penaltyRemove(description)}
													>
														<CloseIcon />
													</ActionIconButton>
												</li>
											);
										})}
									</ul>
								)}
								{suggested(slot.riderId) && (
									<p className={inner("hb-penalties__suggestion")}>
										{labels.penaltyDsqSuggested(who)}
									</p>
								)}
							</li>
						);
					})}
				</ul>
			</div>
		</div>
	);
}
