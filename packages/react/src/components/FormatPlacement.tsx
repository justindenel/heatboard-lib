import {
	useId,
	useMemo,
	useState,
	type KeyboardEvent,
	type ReactNode,
} from "react";
import {
	planRoundName,
	type FormatNames,
	type FormatPlacement,
	type FormatPlan,
} from "@heatboard/core";
import { formatNamesOf } from "../formatNames";
import type { Labels } from "../labels";
import {
	focusTransition,
	placementStudy,
	type PlacementAssign,
	type PlacementTransition,
} from "./formatPlacementStudy";
import { cx, partProps, useBoardSettings } from "./settings";
import { useThemeProps } from "../theme";

/** Above this many arrows the zoom shows only those reaching one target heat. */
const MAX_ARROWS = 12;

function usePlacementStudy(plan: FormatPlan) {
	const { labels } = useBoardSettings();
	const names = useMemo(() => formatNamesOf(labels), [labels]);
	const transitions = useMemo(() => placementStudy(plan, names), [plan, names]);
	return { names, transitions };
}

const assignsFor = (
	transition: PlacementTransition,
	placement: FormatPlacement,
) => (placement === "spread" ? transition.spread : transition.branch);

const unique = (values: number[]) => [...new Set(values)].sort((a, b) => a - b);

function feedersText(
	plan: FormatPlan,
	labels: Labels,
	names: FormatNames,
	transition: PlacementTransition,
	assigns: PlacementAssign[],
	targetHeat: number,
): string {
	const into = assigns.filter((a) => a.target === targetHeat);
	const source = planRoundName(plan, transition.round - 1, names);
	const heatsOf = (lane: PlacementAssign["lane"], rank: number) =>
		unique(
			into
				.filter((a) => a.lane === lane && a.rank === rank)
				.map((a) => a.heat + 1),
		);
	const ranks = unique(into.map((a) => a.rank));
	const note = labels.formatPlacementNote;
	const first = heatsOf("main", ranks[0] ?? 1);
	if (
		ranks.length > 1 &&
		into.every((a) => a.lane === "main") &&
		ranks.every((rank) => heatsOf("main", rank).join() === first.join())
	) {
		return note.top(ranks.length, source, first);
	}
	const parts: string[] = [];
	for (const rank of ranks) {
		for (const lane of ["main", "repechage"] as const) {
			const heats = heatsOf(lane, rank);
			if (heats.length === 0) continue;
			const name =
				lane === "main" ? source : labels.formatRepechageName(transition.round);
			parts.push(note.ranked(rank, name, heats));
		}
	}
	return parts.join(", ");
}

function sentenceOf(
	labels: Labels,
	transition: PlacementTransition,
	placement: FormatPlacement,
) {
	const note = labels.formatPlacementNote;
	if (!transition.differs) return note.same;
	return placement === "spread" ? note.spread : note.branch;
}

/**
 * Small diagram of the first passage where branch and spread differ (else the
 * first one fed by a repechage): the heats of the round on the left, those of
 * the next round on the right, one arrow per qualifier (solid for the 1st,
 * dashed for the others, repechage colour for repechage qualifiers), and a
 * sentence with the real heat numbers. Computed from the links of the core.
 * With many arrows only those of one target heat stay opaque; select a heat on
 * the right to change it.
 */
export function FormatPlacementZoom(props: { plan: FormatPlan }) {
	const { plan } = props;
	const settings = useBoardSettings();
	const { labels } = settings;
	const themeProps = useThemeProps();
	const root = partProps(settings, "formatPlacement", "hb-format-placement");
	const inner = (cls: string) => cx(!settings.unstyled && cls);
	const markerId = useId().replace(/:/g, "");
	const { names, transitions } = usePlacementStudy(plan);
	const [chosen, setChosen] = useState(0);

	const transition = focusTransition(transitions);
	if (!transition) return null;

	const placement = plan.rounds[transition.round]?.placement ?? "branch";
	const assigns = assignsFor(transition, placement);
	const from = planRoundName(plan, transition.round - 1, names);
	const to = planRoundName(plan, transition.round, names);
	const note = labels.formatPlacementNote;

	const m = transition.sourceHeats;
	const rp = transition.hasRepechage ? transition.repechageHeats : 0;
	const t = transition.targetHeats;
	const focusMode =
		assigns.length > MAX_ARROWS &&
		(placement === "spread" || !transition.differs);
	const focusHeat = Math.min(chosen, t - 1);

	const dense = m + rp > 10;
	const boxHeight = dense ? 12 : 20;
	const pitch = boxHeight + (dense ? 3 : 5);
	const width = 320;
	const boxWidth = 54;
	const left = 6;
	const right = width - 6 - boxWidth;
	const top = 20;
	const repechageTop = top + m * pitch + (rp > 0 ? 16 : 0);
	const span = Math.max(repechageTop + rp * pitch - top, t * 20);
	const targetHeight = Math.min(24, span / t - 4);
	const sourceY = (lane: PlacementAssign["lane"], heat: number) =>
		(lane === "repechage" ? repechageTop : top) + heat * pitch;
	const targetY = (heat: number) =>
		top + (heat + 0.5) * (span / t) - targetHeight / 2;
	const height = top + span + 4;

	const fromRepechage = (heat: number) =>
		assigns.filter((a) => a.target === heat && a.lane === "repechage").length;
	const reached = new Set(
		assigns
			.filter((a) => a.target === focusHeat)
			.map((a) => `${a.lane}${a.heat}`),
	);
	const arrow = (a: PlacementAssign, k: number) => {
		const y1 =
			sourceY(a.lane, a.heat) + boxHeight * (a.rank === 1 ? 0.32 : 0.68);
		const y2 = targetY(a.target) + targetHeight / 2 + (a.rank === 1 ? -3 : 3);
		const x1 = left + boxWidth;
		const x2 = right - 2;
		const mid = (x1 + x2) / 2;
		const repechage = a.lane === "repechage";
		return (
			<path
				key={k}
				className={cx(
					!settings.unstyled && "hb-format-placement__arrow",
					!settings.unstyled &&
						a.rank > 1 &&
						"hb-format-placement__arrow--second",
					!settings.unstyled &&
						repechage &&
						"hb-format-placement__arrow--repechage",
				)}
				d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
				markerEnd={`url(#${markerId}${repechage ? "-r" : "-m"})`}
			/>
		);
	};
	const sourceBox = (lane: PlacementAssign["lane"], heat: number) => (
		<g key={`${lane}${heat}`}>
			<rect
				className={cx(
					!settings.unstyled && "hb-format-placement__box",
					!settings.unstyled &&
						lane === "repechage" &&
						"hb-format-placement__box--repechage",
					!settings.unstyled &&
						focusMode &&
						reached.has(`${lane}${heat}`) &&
						"hb-format-placement__box--focus",
				)}
				x={left}
				y={sourceY(lane, heat)}
				width={boxWidth}
				height={boxHeight}
				rx={4}
			/>
			<text
				className={inner("hb-format-placement__box-text")}
				x={left + boxWidth / 2}
				y={sourceY(lane, heat) + boxHeight / 2}
				style={{ fontSize: boxHeight < 16 ? 9 : 11 }}
			>
				{heat + 1}
			</text>
		</g>
	);
	const exampleHeat = focusMode ? focusHeat : 0;
	const feeders = feedersText(
		plan,
		labels,
		names,
		transition,
		assigns,
		exampleHeat,
	);

	return (
		<div
			className={root.className}
			{...themeProps}
			style={{ ...themeProps.style, ...root.style }}
			role="group"
			aria-label={note.title(from, to)}
		>
			<p className={inner("hb-format-placement__head")}>
				<strong className={inner("hb-format-placement__title")}>
					{note.title(from, to)}
				</strong>
				{focusMode && (
					<span className={inner("hb-format-placement__pill")}>
						{note.focusHint}
					</span>
				)}
			</p>
			<svg
				className={inner("hb-format-placement__diagram")}
				viewBox={`0 0 ${width} ${height}`}
				role="img"
				aria-label={note.diagram(from, to)}
			>
				<defs>
					{(["m", "r"] as const).map((kind) => (
						<marker
							key={kind}
							id={`${markerId}-${kind}`}
							viewBox="0 0 8 8"
							refX={7}
							refY={4}
							markerWidth={6}
							markerHeight={6}
							orient="auto"
						>
							<path
								d="M0,0 L8,4 L0,8 z"
								className={inner(
									kind === "r"
										? "hb-format-placement__marker hb-format-placement__marker--repechage"
										: "hb-format-placement__marker",
								)}
							/>
						</marker>
					))}
				</defs>
				<text className={inner("hb-format-placement__label")} x={left} y={12}>
					{from}
				</text>
				<text
					className={inner("hb-format-placement__label")}
					x={right + boxWidth}
					y={12}
					textAnchor="end"
				>
					{to}
				</text>
				{rp > 0 && (
					<text
						className={inner(
							"hb-format-placement__label hb-format-placement__label--repechage",
						)}
						x={left}
						y={repechageTop - 5}
					>
						{labels.formatRepechageName(transition.round)}
					</text>
				)}
				{focusMode && (
					<g className={inner("hb-format-placement__faint")}>
						{assigns.filter((a) => a.target !== focusHeat).map(arrow)}
					</g>
				)}
				{assigns.filter((a) => !focusMode || a.target === focusHeat).map(arrow)}
				{Array.from({ length: m }, (_, h) => sourceBox("main", h))}
				{Array.from({ length: rp }, (_, h) => sourceBox("repechage", h))}
				{Array.from({ length: t }, (_, h) => {
					const extra = fromRepechage(h);
					const heatName = `${to}, ${labels.heatTitle(h + 1)}`;
					const interactive = focusMode
						? {
								role: "button",
								tabIndex: 0,
								"aria-label": note.focusHeat(heatName),
								"aria-pressed": h === focusHeat,
								onClick: () => setChosen(h),
								onKeyDown: (event: KeyboardEvent) => {
									if (event.key === "Enter" || event.key === " ") {
										event.preventDefault();
										setChosen(h);
									}
								},
							}
						: {};
					return (
						<g key={h} {...interactive}>
							<rect
								className={cx(
									!settings.unstyled && "hb-format-placement__box",
									!settings.unstyled &&
										focusMode &&
										h === focusHeat &&
										"hb-format-placement__box--focus",
									!settings.unstyled &&
										focusMode &&
										"hb-format-placement__box--pick",
								)}
								x={right}
								y={targetY(h)}
								width={boxWidth}
								height={targetHeight}
								rx={4}
							/>
							<text
								className={inner("hb-format-placement__box-text")}
								x={right + boxWidth / 2}
								y={targetY(h) + targetHeight / 2}
							>
								{extra > 0 ? `${h + 1} (+${extra})` : h + 1}
							</text>
						</g>
					);
				})}
			</svg>
			<p className={inner("hb-format-placement__legend")}>
				<span>
					<svg width="26" height="8" aria-hidden="true">
						<line
							className={inner("hb-format-placement__swatch")}
							x1="1"
							y1="4"
							x2="25"
							y2="4"
						/>
					</svg>{" "}
					{note.legend.first}
				</span>
				<span>
					<svg width="26" height="8" aria-hidden="true">
						<line
							className={inner(
								"hb-format-placement__swatch hb-format-placement__swatch--second",
							)}
							x1="1"
							y1="4"
							x2="25"
							y2="4"
						/>
					</svg>{" "}
					{note.legend.second}
				</span>
				{rp > 0 && (
					<span>
						<svg width="26" height="8" aria-hidden="true">
							<line
								className={inner(
									"hb-format-placement__swatch hb-format-placement__swatch--repechage",
								)}
								x1="1"
								y1="4"
								x2="25"
								y2="4"
							/>
						</svg>{" "}
						{note.legend.repechage}
					</span>
				)}
			</p>
			<p className={inner("hb-format-placement__say")}>
				{sentenceOf(labels, transition, placement)}
				{feeders !== "" && (
					<span className={inner("hb-format-placement__example")}>
						{note.example(
							`${to}, ${labels.heatTitle(exampleHeat + 1)}`,
							feeders,
						)}
					</span>
				)}
			</p>
		</div>
	);
}

function Thumbnail(props: {
	transition: PlacementTransition;
	assigns: PlacementAssign[];
}) {
	const settings = useBoardSettings();
	const inner = (cls: string) => cx(!settings.unstyled && cls);
	const { transition, assigns } = props;
	const m = transition.sourceHeats;
	const rp = transition.hasRepechage ? transition.repechageHeats : 0;
	const t = transition.targetHeats;
	const width = 120;
	const height = 84;
	const top = 6;
	const span = height - 12;
	const step = span / (m + rp + (rp > 0 ? 0.8 : 0));
	const sourceY = (lane: PlacementAssign["lane"], heat: number) =>
		top + step * (heat + 0.5 + (lane === "repechage" ? m + 0.8 : 0));
	const targetY = (heat: number) => top + (span / t) * (heat + 0.5);
	const radius = m + rp > 10 ? 2.4 : 3.4;
	const seen = new Set<string>();
	const lines = assigns.filter((a) => {
		const key = `${a.lane}${a.heat}>${a.target}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
	return (
		<svg
			className={inner("hb-format-placement__thumb")}
			viewBox={`0 0 ${width} ${height}`}
			aria-hidden="true"
		>
			{lines.map((a, k) => (
				<line
					key={k}
					className={cx(
						!settings.unstyled && "hb-format-placement__line",
						!settings.unstyled &&
							a.lane === "repechage" &&
							"hb-format-placement__line--repechage",
					)}
					x1={14}
					y1={sourceY(a.lane, a.heat)}
					x2={104}
					y2={targetY(a.target)}
				/>
			))}
			{Array.from({ length: m }, (_, h) => (
				<circle
					key={`m${h}`}
					className={inner("hb-format-placement__dot")}
					cx={12}
					cy={sourceY("main", h)}
					r={radius}
				/>
			))}
			{Array.from({ length: rp }, (_, h) => (
				<circle
					key={`r${h}`}
					className={inner(
						"hb-format-placement__dot hb-format-placement__dot--repechage",
					)}
					cx={12}
					cy={sourceY("repechage", h)}
					r={radius}
				/>
			))}
			{Array.from({ length: t }, (_, h) => (
				<circle
					key={`t${h}`}
					className={inner(
						"hb-format-placement__dot hb-format-placement__dot--target",
					)}
					cx={107}
					cy={targetY(h)}
					r={radius + 1.2}
				/>
			))}
		</svg>
	);
}

/**
 * Per round, the two ways of placing the qualifiers side by side as small
 * diagrams, the chosen one framed. Where both give the same placement a single
 * greyed tile says so and nothing can be chosen.
 */
export function FormatPlacementChoice(props: {
	plan: FormatPlan;
	onChange: (plan: FormatPlan) => void;
	/**
	 * "focus" shows only the first passage where branch and spread differ (as the zoom does),
	 * "others" all the other ones; defaults to all.
	 */
	scope?: "all" | "focus" | "others";
	/** Rendered above the tiles, only when there is something to show. */
	heading?: ReactNode;
	/** A choice applies to every round instead of the shown passage only. */
	everyRound?: boolean;
}) {
	const { plan, onChange, scope = "all", heading, everyRound = false } = props;
	const settings = useBoardSettings();
	const { labels } = settings;
	const inner = (cls: string) => cx(!settings.unstyled && cls);
	const { names, transitions } = usePlacementStudy(plan);
	const focus = focusTransition(transitions);
	const shown = transitions.filter(
		(t) =>
			t.targetHeats >= 2 &&
			(scope === "all" || (scope === "focus") === (t === focus)),
	);
	if (shown.length === 0) return null;

	const choose = (round: number, placement: FormatPlacement) => {
		onChange({
			...plan,
			rounds: plan.rounds.map((r, i) => {
				if (everyRound ? i === 0 : i !== round) return r;
				const copy = { ...r };
				if (placement === "spread") copy.placement = "spread";
				else delete copy.placement;
				return copy;
			}),
		});
	};

	return (
		<div className={inner("hb-format-placement__choice")}>
			{heading}
			{shown.map((transition) => {
				const from = planRoundName(plan, transition.round - 1, names);
				const to = planRoundName(plan, transition.round, names);
				const current = plan.rounds[transition.round]?.placement ?? "branch";
				return (
					<div
						key={transition.round}
						role="group"
						aria-label={`${from} → ${to}`}
						className={inner("hb-format-placement__pair")}
					>
						<span className={inner("hb-format-placement__pair-title")}>
							{from} → {to}
						</span>
						{transition.differs ? (
							<div className={inner("hb-format-placement__tiles")}>
								{(["branch", "spread"] as const).map((placement) => (
									<button
										key={placement}
										type="button"
										aria-pressed={current === placement}
										className={cx(
											!settings.unstyled && "hb-format-placement__tile",
											!settings.unstyled &&
												current === placement &&
												"hb-format-placement__tile--chosen",
										)}
										onClick={() => choose(transition.round, placement)}
									>
										<Thumbnail
											transition={transition}
											assigns={assignsFor(transition, placement)}
										/>
										<span className={inner("hb-format-placement__tile-title")}>
											{labels.formatPlacementOptions[placement]}
										</span>
										<span className={inner("hb-format-placement__tile-text")}>
											{labels.formatPlacementHelp[placement]}
										</span>
									</button>
								))}
							</div>
						) : (
							<div
								className={cx(
									!settings.unstyled && "hb-format-placement__tile",
									!settings.unstyled && "hb-format-placement__tile--same",
								)}
								aria-disabled="true"
							>
								<Thumbnail
									transition={transition}
									assigns={transition.branch}
								/>
								<span className={inner("hb-format-placement__tile-text")}>
									{labels.formatRows.placementSame(from, to)}
								</span>
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
