import { useEffect, useState, type CSSProperties } from "react";
import { findHeat, scoringOf } from "@heatboard/core";
import { useHeatboardConfig } from "../config";
import { useBracketContext } from "../context";
import {
	useThemeProps,
	type ColorSchemeSetting,
	type HeatboardTheme,
} from "../theme";
import type { HeadJudgingController } from "../useHeadJudging";
import { Heading } from "./Heading";
import { heatLabel } from "./heatLabel";
import { HeatStatusBadge } from "./HeatStatusBadge";
import { HeatTimer } from "./HeatTimer";
import { CloseIcon } from "./icons";
import { JudgeFigureSteps } from "./JudgeFigureSteps";
import { figureText, judgeCategoriesOf } from "./judgeCategories";
import {
	SettingsContext,
	entryOrStandIn,
	partProps,
	riderLabel,
	usePresentation,
	type PresentationProps,
} from "./settings";

export interface HeadJudgePanelProps<
	TRider = unknown,
> extends PresentationProps<TRider> {
	heatId: string;
	/** State and actions of the head judge, from `useHeadJudging`. */
	headJudging: HeadJudgingController;
	theme?: HeatboardTheme;
	colorScheme?: ColorSchemeSetting;
}

interface Picking {
	riderId: string;
	category?: string;
	figure?: string;
	variant?: string;
}

/**
 * Page of the head judge on one heat, designed for a phone: tap a rider, then a category and a
 * figure to announce a ride; announced rides are listed newest first with their scoring progress.
 */
export function HeadJudgePanel<TRider = unknown>(
	props: HeadJudgePanelProps<TRider>,
) {
	const { heatId, headJudging } = props;
	const { bracket } = useBracketContext();
	const config = useHeatboardConfig();
	const settings = usePresentation(props);
	const themeProps = useThemeProps(props.theme, props.colorScheme);

	const found = findHeat(bracket, heatId);
	const scoring = found ? scoringOf(bracket, found.heat) : bracket.scoring;
	const categories = judgeCategoriesOf(scoring);
	const [picking, setPicking] = useState<Picking | null>(null);
	const [retracting, setRetracting] = useState<string | null>(null);
	const pickerOpen = picking !== null && headJudging.canEdit;
	useEffect(() => {
		if (!pickerOpen) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			setPicking(null);
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [pickerOpen]);

	if (!found) return null;
	const { heat } = found;
	const Timer = settings.components.HeatTimer ?? HeatTimer;
	const StatusBadge = settings.components.HeatStatusBadge ?? HeatStatusBadge;
	const { labels: text } = settings;

	const root = partProps(settings, "headJudge", "hb-judge hb-head-judge");
	const header = partProps(settings, "judgeHeader", "hb-judge__header");
	const title = partProps(settings, "judgeTitle", "hb-judge__title");
	const sync = partProps(settings, "judgeSync", "hb-judge__sync");
	const notice = partProps(settings, "judgeNotice", "hb-judge__notice");
	const section = partProps(settings, "headJudgeSection", "hb-judge__riders");
	const sectionTitle = partProps(
		settings,
		"judgeQueueTitle",
		"hb-judge__section-title",
	);
	const riderList = partProps(
		settings,
		"headJudgeRiders",
		"hb-judge__list hb-head-judge__riders",
	);
	const riderButton = partProps(
		settings,
		"headJudgeRider",
		"hb-head-judge__rider",
	);
	const rideList = partProps(
		settings,
		"headJudgeRides",
		"hb-judge__list hb-head-judge__rides",
	);
	const ride = partProps(settings, "headJudgeRide", "hb-head-judge__ride");
	const overlay = partProps(settings, "judgeOverlay", "hb-judge-overlay");
	const sheet = partProps(
		settings,
		"headJudgePicker",
		"hb-judge-sheet hb-judge-sheet--full",
	);
	const head = partProps(settings, "judgeSheetHead", "hb-judge-sheet__head");
	const body = partProps(settings, "judgeSheetBody", "hb-judge-sheet__body");
	const button = partProps(settings, "button", "hb-button");
	const dangerButton = partProps(
		settings,
		"button",
		"hb-button",
		"hb-button--danger",
	);
	const inner = (cls: string) => (settings.unstyled ? undefined : cls);

	const heatName = heatLabel(bracket, heat.id, text);
	const nameOf = (riderId: string) => {
		const index = heat.slots.findIndex((s) => s.riderId === riderId);
		const entry = entryOrStandIn(bracket.entries, riderId);
		const slot = heat.slots[index];
		const label = riderLabel(settings, entry);
		return {
			label,
			node: settings.renderRiderName
				? settings.renderRiderName(entry, settings.riders?.[riderId])
				: label,
			color:
				slot === undefined
					? undefined
					: settings.getLycraColor
						? settings.getLycraColor(slot, index, heat)
						: settings.lycraColors[index % settings.lycraColors.length],
		};
	};
	const describe = (type: string, figure: string | undefined) =>
		figure ? `${type}, ${figure}` : type;

	const announce = (picked: Picking) => {
		if (picked.category === undefined) return;
		const figure = categories
			.find((c) => c.type === picked.category)
			?.groups.flatMap((group) => group.figures)
			.find((f) => f.code === picked.figure);
		const variant = figure?.variants.some((v) => v.code === picked.variant)
			? picked.variant
			: undefined;
		headJudging.announceRide({
			riderId: picked.riderId,
			type: picked.category,
			...(figure !== undefined && { figure: figure.code }),
			...(variant !== undefined && { variant }),
		});
		setPicking(null);
	};

	const riderRows = heat.slots.flatMap((slot) => {
		if (slot.status !== undefined) return [];
		const who = nameOf(slot.riderId);
		return [
			<li key={slot.riderId}>
				<button
					type="button"
					className={riderButton.className}
					style={
						{
							...riderButton.style,
							"--hb-judge-lycra": who.color ?? "transparent",
						} as CSSProperties
					}
					disabled={!headJudging.canEdit}
					aria-label={text.headJudgeRiderButton(who.label)}
					data-rider-id={slot.riderId}
					onClick={() =>
						setPicking({
							riderId: slot.riderId,
							...(categories.length === 1 && {
								category: categories[0]?.type,
							}),
						})
					}
				>
					{who.node}
				</button>
			</li>,
		];
	});

	const announced = [...headJudging.rides].reverse();
	const pickedWho = pickerOpen ? nameOf(picking.riderId) : undefined;

	return (
		<SettingsContext.Provider value={settings}>
			<div
				className={root.className}
				{...themeProps}
				style={{ ...themeProps.style, ...root.style }}
				lang={config.locale}
				role="region"
				aria-label={heatName}
				data-heat-id={heat.id}
			>
				<header className={header.className} style={header.style}>
					<Heading depth={0} className={title.className} style={title.style}>
						{heatName}
					</Heading>
					<StatusBadge status={heat.status} />
					{heat.status === "running" && <Timer heatId={heat.id} />}
					<span
						className={sync.className}
						style={sync.style}
						role="status"
						data-status={headJudging.status}
						title={
							headJudging.error instanceof Error
								? headJudging.error.message
								: undefined
						}
					>
						{text.judgeSync[headJudging.status]}
					</span>
				</header>
				{headJudging.disabledReason !== null && (
					<p className={notice.className} style={notice.style} role="status">
						{text.judgeDisabled[headJudging.disabledReason]}
					</p>
				)}
				<section className={section.className} style={section.style}>
					<Heading
						depth={1}
						className={sectionTitle.className}
						style={sectionTitle.style}
					>
						{text.headJudgeRiders}
					</Heading>
					{riderRows.length === 0 ? (
						<p className={notice.className} style={notice.style}>
							{text.judgeNoRiders}
						</p>
					) : (
						<ol className={riderList.className} style={riderList.style}>
							{riderRows}
						</ol>
					)}
				</section>
				<section className={section.className} style={section.style}>
					<Heading
						depth={1}
						className={sectionTitle.className}
						style={sectionTitle.style}
					>
						{text.headJudgeAnnounced} ({announced.length})
					</Heading>
					{announced.length === 0 ? (
						<p className={notice.className} style={notice.style}>
							{text.headJudgeNone}
						</p>
					) : (
						<ol className={rideList.className} style={rideList.style}>
							{announced.map((item) => {
								const who = nameOf(item.riderId);
								const progress = headJudging.progress[item.id];
								const shown = figureText(item.figure, item.variant);
								const what = describe(item.type, shown);
								return (
									<li
										key={item.id}
										className={ride.className}
										style={
											{
												...ride.style,
												"--hb-judge-lycra": who.color ?? "transparent",
											} as CSSProperties
										}
										data-ride-id={item.id}
									>
										<span className={inner("hb-head-judge__who")}>
											{who.node}
										</span>
										<span className={inner("hb-head-judge__what")}>
											{item.type}
											{shown ? <strong> {shown}</strong> : null}
										</span>
										<span className={inner("hb-head-judge__progress")}>
											{progress
												? text.headJudgeProgress(
														progress.noted,
														progress.judges,
														progress.unseen,
													)
												: ""}
										</span>
										{retracting === item.id ? (
											<span
												className={inner("hb-head-judge__confirm")}
												role="alert"
											>
												{text.headJudgeRetractConfirm}
												<button
													type="button"
													className={dangerButton.className}
													style={dangerButton.style}
													onClick={() => {
														headJudging.retractRide(item.id);
														setRetracting(null);
													}}
												>
													{text.headJudgeRetractYes}
												</button>
												<button
													type="button"
													className={button.className}
													style={button.style}
													onClick={() => setRetracting(null)}
												>
													{text.confirmCancel}
												</button>
											</span>
										) : (
											<button
												type="button"
												className={inner("hb-head-judge__retract")}
												disabled={!headJudging.canEdit}
												aria-label={text.headJudgeRetractAria(
													`${who.label}, ${what}`,
												)}
												title={text.headJudgeRetract}
												onClick={() => setRetracting(item.id)}
											>
												<CloseIcon />
											</button>
										)}
									</li>
								);
							})}
						</ol>
					)}
				</section>
				{pickerOpen && pickedWho && (
					<>
						<button
							type="button"
							className={overlay.className}
							style={overlay.style}
							aria-label={text.judgeClose}
							tabIndex={-1}
							onClick={() => setPicking(null)}
						/>
						<div
							role="dialog"
							aria-modal="true"
							aria-label={text.headJudgeRiderButton(pickedWho.label)}
							className={sheet.className}
							style={
								{
									...sheet.style,
									"--hb-judge-lycra": pickedWho.color ?? "transparent",
								} as CSSProperties
							}
						>
							<div className={head.className} style={head.style}>
								<span className={inner("hb-judge-sheet__who")}>
									{pickedWho.node}
								</span>
								<button
									type="button"
									className={inner("hb-judge-sheet__close")}
									aria-label={text.judgeClose}
									onClick={() => setPicking(null)}
								>
									<CloseIcon />
								</button>
							</div>
							<div className={body.className} style={body.style}>
								<JudgeFigureSteps
									categories={categories}
									category={picking.category}
									onCategory={(category) =>
										setPicking({ riderId: picking.riderId, category })
									}
									figure={picking.figure}
									onFigure={(figure) =>
										setPicking({
											riderId: picking.riderId,
											...(picking.category !== undefined && {
												category: picking.category,
											}),
											...(figure !== undefined && { figure }),
										})
									}
									variant={picking.variant}
									onVariant={(variant) =>
										setPicking({
											riderId: picking.riderId,
											...(picking.category !== undefined && {
												category: picking.category,
											}),
											...(picking.figure !== undefined && {
												figure: picking.figure,
											}),
											...(variant !== undefined && { variant }),
										})
									}
									alwaysCategories
								/>
								<div className={inner("hb-judge-sheet__actions")}>
									<button
										type="button"
										className={button.className}
										style={button.style}
										disabled={picking.category === undefined}
										onClick={() => announce(picking)}
									>
										{text.judgeEntry.announce}
									</button>
								</div>
							</div>
						</div>
					</>
				)}
			</div>
		</SettingsContext.Provider>
	);
}
