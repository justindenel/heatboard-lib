import { useMemo, type CSSProperties } from "react";
import {
	buildFromFormat,
	formatFromPlan,
	parseFormat,
	type Entry,
	type FormatPlan,
	type FormatSettings,
} from "@heatboard/core";
import { formatNamesOf } from "../formatNames";
import { warningText } from "./formatText";
import { heatMixes, roundColumns } from "./formatShapeLayout";
import { cx, partProps, useBoardSettings } from "./settings";
import { useThemeProps } from "../theme";

/** Bounds the placeholder entries built for the preview. */
const MAX_RIDERS = 5000;
const COMFORTABLE_HEAT = 8;

export interface FormatShapeProps {
	/** Format to draw; written from `plan` in the language of the board when absent. */
	format?: FormatSettings;
	/** Plan the format comes from: gives the rider count and the index of each round for `onRoundClick`. */
	plan?: FormatPlan;
	/** Rider count the shape is computed for (the riders themselves are placeholders); defaults to the plan's. */
	riders?: number;
	/**
	 * Makes the round names buttons. Receives the index of the main round in the
	 * plan; a repechage gives the index of its source round, the small final
	 * that of the final. Needs `plan`.
	 */
	onRoundClick?: (index: number) => void;
}

/**
 * Read-only preview of a format for a given number of riders: rounds as columns
 * from left to right, one lane per group (main, repechage, double) with each
 * repechage round under the main round it comes from, the riders of every heat
 * ("3 + 1" when a heat also receives repechage qualifiers, read from the real
 * links), the small final dashed after the final, the totals and the warnings
 * of the build in plain words. Needs no bracket.
 */
export function FormatShape(props: FormatShapeProps) {
	const { plan, onRoundClick } = props;
	const settings = useBoardSettings();
	const { labels } = settings;
	const themeProps = useThemeProps();
	const root = partProps(settings, "formatShape", "hb-format-shape");
	const inner = (cls: string) => cx(!settings.unstyled && cls);

	const format = useMemo(
		() =>
			props.format ??
			(plan ? formatFromPlan(plan, formatNamesOf(labels)) : undefined),
		[props.format, plan, labels],
	);
	const riders = props.riders ?? plan?.riders ?? 0;

	const shape = useMemo(() => {
		if (!format || !parseFormat(format).ok) return null;
		const count = Math.max(0, Math.min(Math.floor(riders), MAX_RIDERS));
		const entries: Entry[] = Array.from({ length: count }, (_, i) => ({
			riderId: `p${i + 1}`,
			displayName: `p${i + 1}`,
		}));
		const built = buildFromFormat({ entries, rounds: [] }, format, 0);
		if (!built.ok) return null;
		return {
			...built,
			mixes: heatMixes(format, built.sizes, built.links),
			columns: roundColumns(format),
		};
	}, [format, riders]);

	if (!format || !shape) return null;

	const groups: string[] = [];
	for (const round of format.rounds) {
		const group = round.group ?? "main";
		if (!groups.includes(group)) groups.push(group);
	}
	const heatCount = format.rounds.reduce((sum, r) => sum + r.heats, 0);
	const columnCount = Math.max(0, ...Object.values(shape.columns)) + 1;
	const finalKey = [...format.rounds]
		.reverse()
		.find((r) => (r.group ?? "main") === "main" && r.optional !== true)?.key;
	const groupName = (group: string) =>
		(labels.formatShape.groups as Record<string, string>)[group] ?? group;
	const mainKeys = format.rounds
		.filter((r) => (r.group ?? "main") === "main" && r.optional !== true)
		.map((r) => r.key);
	const roundIndex = (key: string): number | undefined => {
		if (!plan) return undefined;
		const main = mainKeys.indexOf(key);
		if (main >= 0) return main;
		if (key === "small-final") return plan.rounds.length - 1;
		const repechage = /^rep-r(\d+)$/.exec(key);
		return repechage ? Number(repechage[1]) - 1 : undefined;
	};

	return (
		<div
			className={root.className}
			{...themeProps}
			style={{ ...themeProps.style, ...root.style }}
			aria-label={labels.formatShape.region}
			role="group"
		>
			<p className={inner("hb-format-shape__summary")}>
				<strong className={inner("hb-format-shape__title")}>
					{labels.formatShape.title}
				</strong>
				<span>{labels.formatShape.summary(riders)}</span>
			</p>
			<div className={inner("hb-format-shape__scroll")}>
				<div
					className={inner("hb-format-shape__lanes")}
					style={{ "--hb-format-shape-columns": columnCount } as CSSProperties}
				>
					{groups.map((group) => (
						<div
							key={group}
							className={cx(
								!settings.unstyled && "hb-format-shape__lane",
								!settings.unstyled &&
									group === "repechage" &&
									"hb-format-shape__lane--repechage",
							)}
						>
							<span className={inner("hb-format-shape__group")}>
								{groupName(group)}
							</span>
							{format.rounds
								.filter((r) => (r.group ?? "main") === group)
								.map((round) => {
									const index = roundIndex(round.key);
									const title = round.name;
									return (
										<div
											key={round.key}
											className={inner("hb-format-shape__round")}
											style={{
												gridColumn: (shape.columns[round.key] ?? 0) + 1,
											}}
										>
											{onRoundClick && index !== undefined ? (
												<button
													type="button"
													className={inner(
														"hb-format-shape__round-name hb-format-shape__round-name--button",
													)}
													onClick={() => onRoundClick(index)}
												>
													{title}
												</button>
											) : (
												<span className={inner("hb-format-shape__round-name")}>
													{title}
												</span>
											)}
											<span className={inner("hb-format-shape__round-count")}>
												{`${round.heats} ${labels.formatShape.heats(round.heats)}`}
												{round.seedSlots
													? ` ${labels.formatShape.seedSlots(round.seedSlots)}`
													: ""}
											</span>
											<ul
												className={inner("hb-format-shape__heats")}
												aria-label={labels.formatPreview(
													shape.sizes[round.key] ?? [],
												)}
											>
												{(shape.sizes[round.key] ?? []).map((size, i) => {
													const mix = shape.mixes[round.key]?.[i];
													const mixed = mix !== undefined && mix.foreign > 0;
													return (
														<li
															key={i}
															className={cx(
																!settings.unstyled && "hb-format-shape__heat",
																!settings.unstyled &&
																	(size < 2 || size > COMFORTABLE_HEAT) &&
																	"hb-format-shape__heat--problem",
																!settings.unstyled &&
																	round.key === finalKey &&
																	"hb-format-shape__heat--final",
																!settings.unstyled &&
																	round.optional === true &&
																	"hb-format-shape__heat--optional",
															)}
															title={
																mixed
																	? labels.formatShape.composition(
																			mix.own,
																			mix.foreign,
																		)
																	: undefined
															}
														>
															{mixed ? (
																<>
																	<span>{mix.own}</span>
																	<span
																		className={inner("hb-format-shape__extra")}
																	>
																		{` + ${mix.foreign}`}
																	</span>
																</>
															) : (
																size
															)}
														</li>
													);
												})}
											</ul>
										</div>
									);
								})}
						</div>
					))}
				</div>
			</div>
			<p className={inner("hb-format-shape__totals")}>
				<span>
					<strong>{heatCount}</strong> {labels.formatShape.heats(heatCount)}
				</span>
				<span>
					<strong>{format.rounds.length}</strong>{" "}
					{labels.formatShape.rounds(format.rounds.length)}
				</span>
			</p>
			{shape.warnings.length > 0 && (
				<ul className={inner("hb-format-shape__footer")}>
					{shape.warnings.map((warning, i) => (
						<li key={i}>{warningText(format, labels, warning)}</li>
					))}
				</ul>
			)}
		</div>
	);
}
