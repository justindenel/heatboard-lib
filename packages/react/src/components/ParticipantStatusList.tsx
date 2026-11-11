import { useState } from "react";
import { getQualified } from "@heatboard/core";
import { useBracketContext } from "../context";
import {
	RankList,
	RankRow,
	displaySlots,
	dragAccess,
	useDndState,
} from "../dnd";
import { useAdmin } from "./admin";
import { Heading } from "./Heading";
import { GripIcon } from "./icons";
import { heatResult } from "./liveNotes";
import { CategoryNoteLines } from "./CategoryNoteLines";
import { JudgeNoteLines } from "./NoteChip";
import { ParticipantStatusMenu } from "./ParticipantStatusMenu";
import { ResultBadge } from "./ResultBadge";
import { ScoreBadge } from "./ScoreBadge";
import {
	cx,
	entryOrStandIn,
	partProps,
	riderLabel,
	useBoardSettings,
	type HeatControlsProps,
} from "./settings";

function ProvisionalRank({ rank }: { rank: number }) {
	const settings = useBoardSettings();
	const { className, style } = partProps(
		settings,
		"resultBadge",
		"hb-badge",
		"hb-result",
		"hb-result--provisional",
	);
	const full = settings.labels.provisionalRank(rank);
	return (
		<span className={className} style={style} data-result="provisional">
			<span aria-hidden="true" title={full}>
				{rank}
			</span>
			<span className={cx(!settings.unstyled && "hb-visually-hidden")}>
				{full}
			</span>
		</span>
	);
}

/**
 * Riders of a heat, each with a menu to set or clear DNF, DSQ and DNS.
 * While the heat runs with manual ranks, the rows can be reordered to set the ranking.
 * With the host's notes, each rider also shows its total, a provisional rank and the averaged notes
 * per move; in admin mode the notes of each judge can be shown too.
 * Without a manual order or official ranks, rows follow the provisional rank;
 * without the status permission the list is read-only.
 */
export function ParticipantStatusList({ heat }: HeatControlsProps) {
	const { bracket } = useBracketContext();
	const inDnd = useDndState() !== null;
	const settings = useBoardSettings();
	const { allowed, labels } = useAdmin();
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
	const head = {
		className: cx(!settings.unstyled && "hb-inspector__section-head"),
	};
	const list = partProps(settings, "inspectorRiders", "hb-inspector__riders");
	const item = partProps(settings, "inspectorRider", "hb-inspector__rider");
	const Badge = settings.components.ResultBadge ?? ResultBadge;
	const Total = settings.components.ScoreBadge ?? ScoreBadge;
	const [showJudges, setShowJudges] = useState(false);
	const toggle = partProps(settings, "switch", "hb-switch");

	const editable = allowed("riderStatus");
	const live = heatResult(bracket, heat, settings);
	const liveRiders = new Map(live?.riders.map((r) => [r.riderId, r]));
	if ((!editable && !live) || heat.slots.length === 0) return null;

	const access = dragAccess(bracket, heat);
	const ranking =
		editable && inDnd && access.kind === "ranking" && allowed("ranking");
	const unranked = heat.slots.every((s) => s.rank === null);
	const byProvisionalRank =
		unranked && live !== undefined && !heat.order?.length;
	const hasNotes = (riderId: string) => {
		const rider = liveRiders.get(riderId);
		return (
			rider !== undefined &&
			(rider.total !== 0 ||
				(rider.moves?.length ?? 0) > 0 ||
				(rider.judgeRides?.length ?? 0) > 0)
		);
	};
	const ordered = byProvisionalRank
		? [...displaySlots(heat)].sort((a, b) => {
				const group = ({ slot }: typeof a) =>
					slot.status !== undefined ? 2 : hasNotes(slot.riderId) ? 0 : 1;
				const diff = group(a) - group(b);
				if (diff !== 0 || group(a) !== 0) return diff;
				return (
					(liveRiders.get(a.slot.riderId)?.rank ?? 0) -
					(liveRiders.get(b.slot.riderId)?.rank ?? 0)
				);
			})
		: displaySlots(heat);
	const admin = settings.mode === "admin";
	const showToggle = admin && live?.judgeIds !== undefined;
	const judgesShown = !admin || showJudges;
	const handleClass = cx(!settings.unstyled && "hb-rank-handle");
	const nameClass = cx(!settings.unstyled && "hb-inspector__rider-name");
	const rankClass = cx(!settings.unstyled && "hb-inspector__rider-rank");
	const qualified = new Set(getQualified(bracket, heat.id));

	const rows = ordered.map(({ slot }) => {
		const name = riderLabel(
			settings,
			entryOrStandIn(bracket.entries, slot.riderId),
		);
		const result = liveRiders.get(slot.riderId);
		const provisional =
			unranked && result !== undefined && hasNotes(slot.riderId)
				? result.rank
				: undefined;
		const content = (
			<>
				<span className={rankClass}>
					{provisional !== undefined ? (
						<ProvisionalRank rank={provisional} />
					) : (
						<Badge slot={slot} qualified={qualified.has(slot.riderId)} />
					)}
				</span>
				<span className={nameClass}>{name}</span>
				{result && <Total total={result.total} />}
				{editable && (
					<ParticipantStatusMenu heatId={heat.id} slot={slot} name={name} />
				)}
				{result && live && (
					<CategoryNoteLines result={result} live={live} heat={heat} />
				)}
				{result && live && judgesShown && result.judgeRides && (
					<JudgeNoteLines
						rides={result.judgeRides}
						judgeIds={live.judgeIds ?? []}
						shared={live.mode === "headJudge"}
					/>
				)}
			</>
		);
		const reason =
			access.kind === "closed"
				? labels.rankingReason[access.reason]
				: ranking && slot.status !== undefined
					? labels.rankingReason.status
					: undefined;
		if (ranking) {
			return (
				<RankRow
					key={slot.riderId}
					heatId={heat.id}
					riderId={slot.riderId}
					className={item.className}
					style={item.style}
					roleDescription={labels.dndRoleDescription}
					handleLabel={labels.rankHandle(name)}
					handleClassName={handleClass}
					handle={<GripIcon />}
					disabled={slot.status !== undefined}
					reason={reason}
				>
					{content}
				</RankRow>
			);
		}
		return (
			<li
				key={slot.riderId}
				className={item.className}
				style={item.style}
				title={reason}
				aria-description={reason}
			>
				{content}
			</li>
		);
	});

	return (
		<div className={section.className} style={section.style}>
			<div className={head.className}>
				<Heading
					depth={2}
					className={sectionTitle.className}
					style={sectionTitle.style}
				>
					{labels.inspectorRiders}
				</Heading>
				{showToggle && (
					<button
						type="button"
						role="switch"
						className={toggle.className}
						style={toggle.style}
						aria-checked={showJudges}
						onClick={() => setShowJudges((shown) => !shown)}
					>
						<span
							className={cx(!settings.unstyled && "hb-switch__track")}
							aria-hidden="true"
						>
							<span className={cx(!settings.unstyled && "hb-switch__thumb")} />
						</span>
						{labels.judgeDetails}
					</button>
				)}
			</div>
			<ul className={list.className} style={list.style}>
				{ranking ? (
					<RankList
						heatId={heat.id}
						riderIds={ordered
							.filter(({ slot }) => slot.status === undefined)
							.map(({ slot }) => slot.riderId)}
					>
						{rows}
					</RankList>
				) : (
					rows
				)}
			</ul>
		</div>
	);
}
