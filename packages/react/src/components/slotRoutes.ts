import {
	findHeat,
	type Action,
	type Bracket,
	type Heat,
	type Round,
} from "@heatboard/core";
import type { Labels } from "../labels";

export interface HeatRef {
	round: Round;
	heat: Heat;
	heatIndex: number;
}

export type SlotDestination =
	{ kind: "heat"; target: HeatRef } | { kind: "eliminated" };

/** A place of a heat still waiting for the rider that will come out of `source` at `rank`. */
export interface SlotOrigin {
	rank: number;
	source: HeatRef;
}

function refOf(bracket: Bracket, heatId: string): HeatRef | undefined {
	const found = findHeat(bracket, heatId);
	return (
		found && {
			round: found.round,
			heat: found.heat,
			heatIndex: found.heatIndex,
		}
	);
}

/**
 * Where a rider ranked `rank` in a heat goes, read from the bracket links.
 * Undefined when no link of the heat leads to another heat (a final, a small final): the stored
 * format still records explicit "eliminated" links there, which must not read as an elimination.
 */
export function slotDestination(
	bracket: Bracket,
	heatId: string,
	rank: number,
): SlotDestination | undefined {
	const outgoing = bracket.links.filter((link) => link.from.heatId === heatId);
	if (outgoing.every((link) => link.to === "eliminated")) return undefined;
	const link = outgoing.find((l) => l.from.rank === rank);
	if (!link || link.to === "eliminated") return { kind: "eliminated" };
	const target = refOf(bracket, link.to.heatId);
	return target && { kind: "heat", target };
}

/**
 * Whether the heat holds all the riders it will have: some are placed and every heat feeding it is
 * decided. Generated formats also link ranks beyond a smaller heat's size (so a rider added later
 * still has a route); those links lead nowhere while the heat stays that small.
 */
function sizeKnown(bracket: Bracket, source: HeatRef): boolean {
	if (source.heat.slots.length === 0) return false;
	return bracket.links.every((link) => {
		if (link.to === "eliminated" || link.to.heatId !== source.heat.id) {
			return true;
		}
		const feeder = findHeat(bracket, link.from.heatId)?.heat;
		return (
			feeder === undefined ||
			feeder.status === "judged" ||
			feeder.status === "locked"
		);
	});
}

/**
 * Sources of the places a heat is still waiting for, in bracket order: links that end in the heat
 * and start from a heat whose riders are not placed yet, and whose rank that heat can reach.
 */
export function slotOrigins(bracket: Bracket, heatId: string): SlotOrigin[] {
	const origins: SlotOrigin[] = [];
	for (const link of bracket.links) {
		if (link.to === "eliminated" || link.to.heatId !== heatId) continue;
		const source = refOf(bracket, link.from.heatId);
		if (!source) continue;
		if (source.heat.status !== "pending" && source.heat.status !== "running") {
			continue;
		}
		if (
			sizeKnown(bracket, source) &&
			link.from.rank > source.heat.slots.length
		) {
			continue;
		}
		origins.push({ rank: link.from.rank, source });
	}
	const position = (ref: HeatRef) =>
		bracket.rounds.indexOf(ref.round) * 10_000 + ref.heatIndex;
	return origins.sort(
		(a, b) => position(a.source) - position(b.source) || a.rank - b.rank,
	);
}

/** Places still waiting for a rider in the heat `action` starts; 0 for any other action. */
export function openPlacesAtStart(bracket: Bracket, action: Action): number {
	if (action.type !== "setHeatStatus" || action.status !== "running") return 0;
	const found = findHeat(bracket, action.heatId);
	if (!found || found.heat.status !== "pending") return 0;
	return slotOrigins(bracket, action.heatId).length;
}

/** Short reference to a heat: the round name, then the heat unless it is the only one of its round. */
export function heatReference(labels: Labels, ref: HeatRef): string {
	if (ref.round.heats.length === 1) return ref.round.name;
	const heat = ref.heat.name ?? labels.heatShort(ref.heatIndex + 1);
	return `${ref.round.name} ${heat}`;
}

export interface DestinationText {
	text: string;
	kind: "advance" | "repechage" | "eliminated";
}

export function destinationText(
	labels: Labels,
	destination: SlotDestination,
): DestinationText {
	if (destination.kind === "eliminated") {
		return { text: labels.slotEliminated, kind: "eliminated" };
	}
	return {
		text: labels.slotDestination(heatReference(labels, destination.target)),
		kind:
			destination.target.round.group === "repechage" ? "repechage" : "advance",
	};
}

export function originText(labels: Labels, origin: SlotOrigin): string {
	return labels.slotOrigin(
		labels.rank(origin.rank),
		heatReference(labels, origin.source),
	);
}
