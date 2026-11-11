import { useBracketContext } from "../context";
import {
	ActionButton,
	ActionIconButton,
	heatDisplayName,
	useAdmin,
} from "./admin";
import { PlusIcon } from "./icons";
import {
	partProps,
	useBoardSettings,
	type HeatStructureControlsProps,
	type RoundStructureControlsProps,
} from "./settings";

export function useStructureEditable(): boolean {
	const { bracket } = useBracketContext();
	const { allowed } = useAdmin();
	return (
		allowed("structure") &&
		// The stored format owns the structure: the core refuses these edits (FORMAT_LOCKED).
		bracket.format === undefined &&
		bracket.status !== "finished" &&
		bracket.status !== "validated"
	);
}

/** Appends a round to the bracket. */
export function AddRoundButton() {
	const { bracket } = useBracketContext();
	const settings = useBoardSettings();
	const editable = useStructureEditable();
	if (!editable) return null;

	const last = bracket.rounds.at(-1);
	const maxPerHeat = last?.maxPerHeat ?? 4;
	const newRound = (id: string) => ({
		id,
		name: settings.labels.newRoundName(bracket.rounds.length + 1),
		group: last?.group ?? "main",
		maxPerHeat,
		advancing: Math.min(Math.max(1, last?.advancing ?? 2), maxPerHeat),
	});
	return (
		<ActionIconButton
			action={{ type: "addRound", round: newRound("") }}
			build={() => ({
				type: "addRound",
				round: newRound(settings.createId()),
			})}
			label={settings.labels.addRound}
			className="hb-icon-button--ghost"
		>
			<PlusIcon />
		</ActionIconButton>
	);
}

/** Adds a heat to a round and removes the round. Removal asks for confirmation only inside a `Board`. */
export function RoundStructureControls({ round }: RoundStructureControlsProps) {
	const settings = useBoardSettings();
	const editable = useStructureEditable();
	const root = partProps(settings, "controls", "hb-controls");
	if (!editable) return null;
	const { labels } = settings;
	return (
		<div className={root.className} style={root.style}>
			<ActionButton
				action={{ type: "addHeat", roundId: round.id, heat: { id: "" } }}
				build={() => ({
					type: "addHeat",
					roundId: round.id,
					heat: { id: settings.createId() },
				})}
			>
				{labels.addHeat}
			</ActionButton>
			<ActionButton
				action={{ type: "removeRound", roundId: round.id }}
				ariaLabel={labels.removeRound(round.name)}
				danger
			>
				{labels.remove}
			</ActionButton>
		</div>
	);
}

/** Removes a heat from its round. Removal asks for confirmation only inside a `Board`. */
export function HeatStructureControls({ heat }: HeatStructureControlsProps) {
	const { bracket } = useBracketContext();
	const settings = useBoardSettings();
	const editable = useStructureEditable();
	const root = partProps(settings, "controls", "hb-controls");
	if (!editable) return null;
	const { labels } = settings;
	return (
		<div className={root.className} style={root.style}>
			<ActionButton
				action={{ type: "removeHeat", heatId: heat.id }}
				ariaLabel={labels.removeHeat(heatDisplayName(bracket, labels, heat))}
				danger
			>
				{labels.remove}
			</ActionButton>
		</div>
	);
}
