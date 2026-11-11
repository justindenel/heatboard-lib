import {
	scoringOf,
	type Heat,
	type ViewerHeatResult,
	type ViewerRiderResult,
} from "@heatboard/core";
import { useBracketContext } from "../context";
import { AlignedChip, RideMeanChip } from "./NoteChip";
import { cx, partProps, useBoardSettings } from "./settings";

/**
 * The notes of a rider, one line per category: move chips, then the category subtotal; each part
 * only when the result carries it. Chips are ride means in head-judge mode and averaged moves in
 * free mode; they only make the result with `rideMeans`, otherwise the line is marked indicative.
 */
export function CategoryNoteLines(props: {
	result: ViewerRiderResult;
	live: ViewerHeatResult;
	heat: Heat;
}) {
	const { result, live, heat } = props;
	const { bracket } = useBracketContext();
	const settings = useBoardSettings();
	const { labels } = settings;
	const scoring = scoringOf(bracket, heat);
	const lineProps = partProps(
		settings,
		"inspectorAligned",
		"hb-inspector__aligned",
	);
	const inner = (name: string) => cx(!settings.unstyled && name);
	if (!scoring) return null;

	const decisive = scoring.method === "rideMeans";
	const shared = live.mode === "headJudge";
	const moves = result.moves ?? [];

	const lines = scoring.categories.flatMap(({ type }) => {
		const chips = moves
			.filter((move) => move.type === type)
			.map((move, index) =>
				shared ? (
					<RideMeanChip
						key={`${move.at}-${index}`}
						ride={move}
						decisive={decisive}
					/>
				) : (
					<AlignedChip key={`${move.at}-${index}`} group={move} />
				),
			);
		const subtotalValue = result.byType?.[type];
		const subtotal =
			scoring.method !== "placings" &&
			subtotalValue !== undefined &&
			(subtotalValue !== 0 || moves.some((move) => move.type === type))
				? labels.formatTotal(subtotalValue)
				: undefined;
		if (chips.length === 0 && subtotal === undefined) return [];
		return [
			<div
				key={type}
				className={lineProps.className}
				style={lineProps.style}
				role="group"
				aria-label={labels.categoryLine(type)}
				data-category={type}
			>
				<span className={inner("hb-inspector__category")}>{type}</span>
				{chips}
				{chips.length > 0 && !decisive && (
					<small className={inner("hb-inspector__indicative")}>
						{labels.indicative}
					</small>
				)}
				{subtotal !== undefined && (
					<span
						className={inner("hb-inspector__subtotal")}
						title={labels.categorySubtotal(type, subtotal)}
					>
						= <strong>{subtotal}</strong>
					</span>
				)}
			</div>,
		];
	});

	const places = (
		result.placesByJudge
			? Object.values(result.placesByJudge)
			: (result.places ?? [])
	).map((place) => labels.formatScore(place));

	return (
		<>
			{lines}
			{places.length > 0 && (
				<div
					className={lineProps.className}
					style={lineProps.style}
					role="group"
					aria-label={labels.judgePlaces}
				>
					<span className={inner("hb-inspector__place")}>
						{labels.placingsLine(labels.rank(result.rank), places.join(" · "))}
					</span>
				</div>
			)}
		</>
	);
}
