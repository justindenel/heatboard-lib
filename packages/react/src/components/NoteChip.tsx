import { cx, partProps, useBoardSettings } from "./settings";
import type { ViewerJudgeRide, ViewerMove } from "@heatboard/core";

type NoteLike = Pick<ViewerJudgeRide, "type" | "figure" | "value" | "counted">;

/**
 * Category initial, value and figure code: `W 6.5`, `J 7.5 B`. Without the initial (`showType` off)
 * where the category already heads the line: a figure code such as `J` must not read as a category.
 */
export function NoteChipContent(props: {
	type: string;
	figure: string | undefined;
	value: string;
	showType?: boolean;
}) {
	const initial = (Array.from(props.type)[0] ?? "").toUpperCase();
	return (
		<>
			{props.showType === false ? null : `${initial} `}
			<strong>{props.value}</strong>
			{props.figure ? ` ${props.figure}` : null}
		</>
	);
}

/** Read-only compact chip of one note; `given` is the judge's own note when it differs from the ride value, `null` for "not seen". */
export function NoteChip(props: {
	note: NoteLike;
	given?: number | null;
	counted?: boolean;
}) {
	const { note } = props;
	const settings = useBoardSettings();
	const { labels } = settings;
	const unseen = props.given === null;
	const counted = props.counted ?? note.counted;
	const value = unseen ? "–" : labels.formatScore(props.given ?? note.value);
	const full = unseen
		? labels.rideUnseenSummary(note.type, note.figure)
		: labels.noteSummary(note.type, note.figure, value, counted);
	const chip = partProps(
		settings,
		"inspectorNote",
		"hb-note",
		counted && "hb-note--counted",
	);
	return (
		<span
			className={chip.className}
			style={chip.style}
			role="img"
			aria-label={full}
			title={full}
			data-counted={counted ? "true" : undefined}
		>
			<NoteChipContent type={note.type} figure={note.figure} value={value} />
		</span>
	);
}

/** Read-only chip of the notes of all judges on one move: average, figure and how many judges noted it. */
export function AlignedChip({ group }: { group: ViewerMove }) {
	const settings = useBoardSettings();
	const { labels } = settings;
	const average = labels.formatTotal(group.value);
	const disagree = !group.figureAgreement;
	const complete = group.judges === group.of;
	const full = labels.alignedSummary(
		group.type,
		average,
		group.judges,
		group.of,
		group.figure,
		disagree,
	);
	const chip = partProps(
		settings,
		"inspectorNote",
		"hb-note",
		!complete && "hb-note--partial",
	);
	const marker = cx(!settings.unstyled && "hb-note__marker");
	return (
		<span
			className={chip.className}
			style={chip.style}
			role="img"
			aria-label={full}
			title={full}
			data-complete={complete ? "true" : "false"}
			data-figure-disagreement={disagree ? "true" : undefined}
		>
			<NoteChipContent
				type={group.type}
				figure={group.figure}
				value={average}
			/>
			{disagree && <span className={marker}> ≠</span>}
			{!complete && (
				<span className={marker}>
					{" "}
					{group.judges}/{group.of}
				</span>
			)}
		</span>
	);
}

/** Read-only chip of a head-judge ride: mean of the judges' notes, highlighted when it counts in the result. */
export function RideMeanChip(props: {
	ride: ViewerMove;
	/** The mean makes the result (`rideMeans`) rather than being indicative. */
	decisive: boolean;
}) {
	const { ride, decisive } = props;
	const of = ride.of;
	const settings = useBoardSettings();
	const { labels } = settings;
	const unseen = ride.judges === 0;
	const mean = labels.formatTotal(ride.value);
	const counted = decisive && ride.counted;
	const full = unseen
		? labels.rideUnseenSummary(ride.type, ride.figure)
		: labels.rideMeanSummary(
				ride.type,
				mean,
				ride.judges,
				of,
				ride.figure,
				counted,
				!decisive,
			);
	const chip = partProps(
		settings,
		"inspectorNote",
		"hb-note",
		counted && "hb-note--counted",
		ride.answers < of && "hb-note--partial",
	);
	const marker = cx(!settings.unstyled && "hb-note__marker");
	return (
		<span
			className={chip.className}
			style={chip.style}
			role="img"
			aria-label={full}
			title={full}
			data-counted={counted ? "true" : undefined}
			data-unseen={unseen ? "true" : undefined}
		>
			<NoteChipContent
				type={ride.type}
				figure={ride.figure}
				value={unseen ? "–" : mean}
			/>
			{ride.answers < of && (
				<span className={marker}>
					{" "}
					{ride.answers}/{of}
				</span>
			)}
		</span>
	);
}

/** One line per judge: its name, then its notes in time order. */
export function JudgeNoteLines(props: {
	rides: ViewerJudgeRide[];
	judgeIds: string[];
	/** Rides are shared: "counted" is a heat-level fact, not a judge's own. */
	shared: boolean;
}) {
	const settings = useBoardSettings();
	const line = partProps(settings, "inspectorJudge", "hb-inspector__judge");
	const name = partProps(
		settings,
		"inspectorJudgeName",
		"hb-inspector__judge-name",
	);
	const lines = props.judgeIds.flatMap((judgeId, index) => {
		const notes = props.rides.flatMap((ride) => {
			const given = ride.scores.find((s) => s.judgeId === judgeId);
			return given ? [{ ride, value: given.value }] : [];
		});
		if (notes.length === 0) return [];
		const label =
			settings.judgeLabel?.(judgeId) ??
			settings.labels.judgeShortName(index + 1);
		return [
			<li key={judgeId} className={line.className} style={line.style}>
				<span className={name.className} style={name.style}>
					{label}
				</span>
				{notes.map(({ ride, value }) => (
					<NoteChip
						key={ride.rideId}
						note={ride}
						given={value}
						counted={!props.shared && ride.counted}
					/>
				))}
			</li>,
		];
	});
	if (lines.length === 0) return null;
	return (
		<ul
			className={cx(!settings.unstyled && "hb-inspector__judges")}
			aria-label={settings.labels.liveNotes}
		>
			{lines}
		</ul>
	);
}
