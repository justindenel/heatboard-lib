import { useEffect, useId, useRef, type ReactNode } from "react";
import { findHeat, heatNumbers, raceFormatOf } from "@heatboard/core";
import { useBracketContext } from "../context";
import { describeRaceFormat } from "../describeRaceFormat";
import { useDndState } from "../dnd";
import { IconButton, useAdmin } from "./admin";
import { BracketToolbar } from "./BracketToolbar";
import { EditableName } from "./EditableName";
import { Heading } from "./Heading";
import { FormatEditor } from "./FormatEditor";
import { HeatControls } from "./HeatControls";
import { HeatPenalties } from "./HeatPenalties";
import { HeatTimer } from "./HeatTimer";
import { CloseIcon } from "./icons";
import { targetKey, useInspector } from "./inspectorContext";
import { ParticipantStatusList } from "./ParticipantStatusList";
import { RoundControls } from "./RoundControls";
import { ScoringEditor } from "./ScoringEditor";
import {
	HeatStructureControls,
	RoundStructureControls,
} from "./StructureControls";
import { partProps, useBoardSettings, type InspectorProps } from "./settings";

/**
 * Side panel with the settings and actions of a heat, a round or the bracket.
 * It takes the focus when it opens or changes target; the board gives it back on close.
 */
export function Inspector({ target, onClose }: InspectorProps) {
	const { bracket } = useBracketContext();
	const settings = useBoardSettings();
	const { allowed, run, labels } = useAdmin();
	const titleId = useId();
	const { panelId } = useInspector();
	const panelRef = useRef<HTMLDivElement>(null);
	const key = targetKey(target);
	const dragging = useDndState()?.active != null;

	const root = partProps(settings, "inspector", "hb-inspector");
	const header = partProps(settings, "inspectorHeader", "hb-inspector__header");
	const title = partProps(settings, "inspectorTitle", "hb-inspector__title");
	const body = partProps(settings, "inspectorBody", "hb-inspector__body");
	const ranWith = partProps(settings, "inspectorRanWith", "hb-inspector__ran");

	const Timer = settings.components.HeatTimer ?? HeatTimer;
	const Editable = settings.components.EditableName ?? EditableName;
	const HeatControlsComponent =
		settings.components.HeatControls ?? HeatControls;
	const Penalties = settings.components.HeatPenalties ?? HeatPenalties;
	const Scoring = settings.components.ScoringEditor ?? ScoringEditor;
	const Format = settings.components.FormatEditor ?? FormatEditor;
	const RoundControlsComponent =
		settings.components.RoundControls ?? RoundControls;
	const Toolbar = settings.components.BracketToolbar ?? BracketToolbar;
	const RoundStructure =
		settings.components.RoundStructureControls ?? RoundStructureControls;
	const HeatStructure =
		settings.components.HeatStructureControls ?? HeatStructureControls;

	useEffect(() => {
		panelRef.current?.focus();
	}, [key]);

	let name: string;
	let content: ReactNode;
	if (target.type === "heat") {
		const found = findHeat(bracket, target.heatId);
		if (!found) return null;
		const { round, heat } = found;
		const number = heatNumbers(bracket)[heat.id];
		const defaultName = labels.heatTitle(number ?? found.heatIndex + 1);
		name = heat.name ?? defaultName;
		content = (
			<>
				{allowed("names") && (
					<Editable
						key={key}
						value={heat.name ?? ""}
						placeholder={defaultName}
						allowEmpty
						onSubmit={(next) =>
							run({
								type: "renameHeat",
								heatId: heat.id,
								...(next !== "" && { name: next }),
							})
						}
					/>
				)}
				{heat.status === "running" && <Timer heatId={heat.id} />}
				{heat.timing !== undefined && (
					<p className={ranWith.className} style={ranWith.style}>
						{labels.raceFormat.ranWith(
							describeRaceFormat(raceFormatOf(bracket, heat), labels, {
								ran: true,
							}),
						)}
					</p>
				)}
				<HeatControlsComponent round={round} heat={heat} />
				<ParticipantStatusList round={round} heat={heat} />
				<Penalties round={round} heat={heat} />
				<HeatStructure round={round} heat={heat} />
			</>
		);
	} else if (target.type === "round") {
		const round = bracket.rounds.find((r) => r.id === target.roundId);
		if (!round) return null;
		name = round.name;
		content = (
			<>
				{allowed("names") && (
					<Editable
						key={key}
						value={round.name}
						onSubmit={(next) =>
							run({ type: "renameRound", roundId: round.id, name: next })
						}
					/>
				)}
				<RoundControlsComponent round={round} />
				<RoundStructure round={round} />
			</>
		);
	} else {
		name = bracket.name;
		content = (
			<>
				{allowed("names") && (
					<Editable
						key={key}
						value={bracket.name}
						onSubmit={(next) => run({ type: "renameBracket", name: next })}
					/>
				)}
				<Toolbar />
				{allowed("scoring") && <Scoring />}
				{allowed("format") && <Format />}
			</>
		);
	}

	return (
		<div
			ref={panelRef}
			id={panelId}
			className={root.className}
			style={root.style}
			role="dialog"
			aria-modal="false"
			aria-labelledby={titleId}
			tabIndex={-1}
			data-target={target.type}
			onKeyDown={(event) => {
				// dnd-kit cancels a keyboard drag from a document listener that runs after this one.
				if (event.key === "Escape" && !event.defaultPrevented && !dragging) {
					event.preventDefault();
					onClose();
				}
			}}
		>
			<div className={header.className} style={header.style}>
				<Heading
					depth={1}
					id={titleId}
					className={title.className}
					style={title.style}
				>
					{name}
				</Heading>
				<IconButton label={labels.closeInspector} onPress={onClose}>
					<CloseIcon />
				</IconButton>
			</div>
			<div className={body.className} style={body.style}>
				{content}
			</div>
		</div>
	);
}
