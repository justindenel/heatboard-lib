import { findHeat } from "@heatboard/core";
import { useBracketContext } from "../context";
import { IconButton, useAdmin } from "./admin";
import { heatLabel } from "./heatLabel";
import { MoreIcon } from "./icons";
import { sameTarget, useInspector } from "./inspectorContext";
import { hasLiveNotes } from "./liveNotes";
import {
	useBoardSettings,
	type AdminPermission,
	type BoardSelection,
} from "./settings";

const PERMISSIONS: Record<BoardSelection["type"], AdminPermission[]> = {
	heat: ["names", "heatStatus", "ranking", "riderStatus", "structure"],
	round: ["names", "roundSettings", "structure"],
	bracket: ["names", "bracketStatus", "visibility", "reset"],
};

/** A heat is also inspectable read-only when the host has live notes for it; pass `heatId` to check that. */
export function useInspectable(
	type: BoardSelection["type"],
	heatId?: string,
): boolean {
	const { allowed } = useAdmin();
	const { bracket } = useBracketContext();
	const settings = useBoardSettings();
	if (type === "bracket" && !allowed("bracketPanel")) return false;
	if (PERMISSIONS[type].some(allowed)) return true;
	if (type !== "heat" || heatId === undefined) return false;
	const found = findHeat(bracket, heatId);
	return found !== undefined && hasLiveNotes(bracket, found.heat, settings);
}

/** Icon button that opens the inspector on `target`; renders nothing when the inspector would be empty. */
export function InspectorTrigger({ target }: { target: BoardSelection }) {
	const { bracket } = useBracketContext();
	const { labels } = useAdmin();
	const { selection, open } = useInspector();
	const inspectable = useInspectable(
		target.type,
		target.type === "heat" ? target.heatId : undefined,
	);

	if (!inspectable) return null;
	let name: string;
	if (target.type === "heat") {
		const found = findHeat(bracket, target.heatId);
		if (!found) return null;
		name = heatLabel(bracket, found.heat.id, labels);
	} else if (target.type === "round") {
		const round = bracket.rounds.find((r) => r.id === target.roundId);
		if (!round) return null;
		name = round.name;
	} else {
		name = bracket.name;
	}

	return (
		<IconButton
			label={labels.inspect(name)}
			aria={{
				"aria-haspopup": "dialog",
				"aria-expanded": sameTarget(selection, target),
			}}
			onPress={(button) => open(target, button)}
		>
			<MoreIcon />
		</IconButton>
	);
}
