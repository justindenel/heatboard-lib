import {
	scoringOf,
	type Action,
	type Bracket,
	type BracketError,
	type Heat,
} from "@heatboard/core";
import { useBracketContext } from "../context";
import { errorMessage, type Labels } from "../labels";
import {
	ActionButton,
	RefusableButton,
	heatDisplayName,
	useAdmin,
} from "./admin";
import { HEAT_TRANSITIONS } from "./heatTransitions";
import {
	entryOrStandIn,
	partProps,
	riderLabel,
	useBoardSettings,
	type BoardSettings,
	type HeatControlsProps,
} from "./settings";

function tiedNames(
	settings: BoardSettings,
	labels: Labels,
	bracket: Bracket,
	error: BracketError,
	hint: boolean,
): string {
	const groups = error.details?.["tiedRiderIds"];
	const names = (Array.isArray(groups) ? groups : []).map((group) =>
		(Array.isArray(group) ? group : []).map((riderId) =>
			riderLabel(settings, entryOrStandIn(bracket.entries, String(riderId))),
		),
	);
	return `${labels.unresolvedTie(names)}${hint ? ` ${labels.unresolvedTieHint}` : ""}`;
}

/** Judge button of a running heat that has no rank yet: ranks it from the host's notes. */
function JudgeFromScores(props: { heat: Heat; rankable: boolean }) {
	const { heat, rankable } = props;
	const { bracket, canApply } = useBracketContext();
	const settings = useBoardSettings();
	const { run, labels } = useAdmin();
	const note = partProps(settings, "controlsNote", "hb-controls__note");
	const button = partProps(settings, "button", "hb-button");

	const read = () => settings.getHeatData?.(heat.id);
	const data = read();
	if (!data) return null;
	const action: Action = { type: "judgeHeatFromScores", heatId: heat.id, data };
	const probe = canApply(action);
	let reason: string | undefined;
	if (!probe.ok && probe.error.code !== "DESTRUCTIVE_CHANGE") {
		reason =
			probe.error.code === "UNRESOLVED_TIE"
				? tiedNames(settings, labels, bracket, probe.error, rankable)
				: errorMessage(labels, probe.error);
	}
	return (
		<>
			<RefusableButton
				reason={reason}
				className={button.className}
				style={button.style}
				onPress={() =>
					run({
						type: "judgeHeatFromScores",
						heatId: heat.id,
						data: read() ?? data,
					})
				}
			>
				{labels.judgeHeat}
			</RefusableButton>
			{reason !== undefined &&
				!probe.ok &&
				probe.error.code === "UNRESOLVED_TIE" && (
					<p className={note.className} style={note.style} aria-hidden="true">
						{reason}
					</p>
				)}
		</>
	);
}

/** Status transitions of a heat, plus ranking shortcuts unless the scoring uses points. */
export function HeatControls({ heat }: HeatControlsProps) {
	const { bracket } = useBracketContext();
	const settings = useBoardSettings();
	const { allowed } = useAdmin();
	const labels: Labels = settings.labels;
	const root = partProps(settings, "controls", "hb-controls");

	const transitions = allowed("heatStatus")
		? HEAT_TRANSITIONS[heat.status]
		: [];
	const scoring = scoringOf(bracket, heat);
	const method = scoring?.method;
	const ranking =
		allowed("ranking") && method !== "points" && method !== "rideMeans";
	const reviewable = heat.needsReview === true && allowed("heatStatus");
	if (transitions.length === 0 && !ranking && !reviewable) return null;

	const judgeFromScores =
		scoring !== undefined &&
		settings.getHeatData?.(heat.id) !== undefined &&
		heat.status === "running" &&
		!heat.slots.some((s) => s.status === undefined && s.rank !== null);

	return (
		<div
			className={root.className}
			style={root.style}
			role="group"
			aria-label={heatDisplayName(bracket, labels, heat)}
		>
			{transitions.map(({ status, label }) => {
				if (judgeFromScores && status === "judged") {
					return (
						<JudgeFromScores key={status} heat={heat} rankable={ranking} />
					);
				}
				const action: Action = {
					type: "setHeatStatus",
					heatId: heat.id,
					status,
				};
				const stamped = bracket.scoring && heat.status === "pending";
				return (
					<ActionButton
						key={`${status}-${label}`}
						action={action}
						{...(stamped && {
							build: (): Action => ({
								...action,
								at: new Date().toISOString(),
							}),
						})}
					>
						{labels[label]}
					</ActionButton>
				);
			})}
			{reviewable && (
				<ActionButton action={{ type: "clearReview", heatId: heat.id }}>
					{labels.markReviewed}
				</ActionButton>
			)}
			{ranking && (
				<>
					<ActionButton action={{ type: "rankByPosition", heatId: heat.id }}>
						{labels.rankByOrder}
					</ActionButton>
					<ActionButton action={{ type: "clearRanks", heatId: heat.id }}>
						{labels.clearRanks}
					</ActionButton>
				</>
			)}
		</div>
	);
}
