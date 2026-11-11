import { isJudged, isStarted } from "../internal/bracket";
import type { Bracket, Link } from "../model";

export interface AdvancementChange {
	links?: Link[];
	advancing?: { roundId: string; value: number };
}

export interface QualificationChange {
	heatId: string;
	riderId: string;
	qualifiedBefore: boolean;
	qualifiedAfter: boolean;
}

export interface AdvancementConflict {
	riderId: string;
	roundId: string;
	heatIds: string[];
}

export interface AdvancementSimulation {
	heats: HeatEntryImpact[];
	/** Riders the simulated links would deliver to several heats of one round; judging the source heat refuses them. */
	conflicts: AdvancementConflict[];
	qualification: QualificationChange[];
}

export interface HeatEntryImpact {
	heatId: string;
	started: boolean;
	entering: string[];
	leaving: string[];
}

/** Riders each target heat receives from judged heats, as judging them delivers them. */
function deliveries(bracket: Bracket, links: Link[]): Map<string, string[]> {
	const delivered = new Map<string, string[]>();
	for (const link of links) {
		if (link.to === "eliminated") continue;
		for (const round of bracket.rounds) {
			const source = round.heats.find((h) => h.id === link.from.heatId);
			if (!source || !isJudged(source)) continue;
			const slot = source.slots.find(
				(s) => s.rank === link.from.rank && s.status === undefined,
			);
			if (!slot) continue;
			const riders = delivered.get(link.to.heatId) ?? [];
			if (!riders.includes(slot.riderId)) riders.push(slot.riderId);
			delivered.set(link.to.heatId, riders);
		}
	}
	return delivered;
}

function targetsFromJudged(bracket: Bracket, links: Link[]): Set<string> {
	const judged = new Set(
		bracket.rounds.flatMap((r) => r.heats.filter(isJudged).map((h) => h.id)),
	);
	return new Set(
		links.flatMap((l) =>
			l.to !== "eliminated" && judged.has(l.from.heatId) ? [l.to.heatId] : [],
		),
	);
}

function linkImpacts(bracket: Bracket, newLinks: Link[]): HeatEntryImpact[] {
	const current = deliveries(bracket, bracket.links);
	const proposed = deliveries(bracket, newLinks);
	const targets = new Set([
		...targetsFromJudged(bracket, bracket.links),
		...targetsFromJudged(bracket, newLinks),
	]);
	return bracket.rounds.flatMap((round) =>
		round.heats
			.filter((heat) => targets.has(heat.id))
			.map((heat) => {
				const before = current.get(heat.id) ?? [];
				const after = proposed.get(heat.id) ?? [];
				return {
					heatId: heat.id,
					started: isStarted(heat),
					entering: after.filter((id) => !before.includes(id)),
					leaving: before.filter((id) => !after.includes(id)),
				};
			}),
	);
}

function conflictsOf(bracket: Bracket, links: Link[]): AdvancementConflict[] {
	const delivered = deliveries(bracket, links);
	return bracket.rounds.flatMap((round) => {
		const heatsByRider = new Map<string, string[]>();
		for (const heat of round.heats) {
			for (const riderId of delivered.get(heat.id) ?? []) {
				heatsByRider.set(riderId, [
					...(heatsByRider.get(riderId) ?? []),
					heat.id,
				]);
			}
		}
		return [...heatsByRider]
			.filter(([, heatIds]) => heatIds.length > 1)
			.map(([riderId, heatIds]) => ({ riderId, roundId: round.id, heatIds }));
	});
}

function qualificationChanges(
	bracket: Bracket,
	change: { roundId: string; value: number },
): QualificationChange[] {
	const round = bracket.rounds.find((r) => r.id === change.roundId);
	if (!round) return [];
	return round.heats.filter(isJudged).flatMap((heat) =>
		heat.slots.flatMap((slot) => {
			if (slot.status !== undefined || slot.rank === null) return [];
			const qualifiedBefore = slot.rank <= round.advancing;
			const qualifiedAfter = slot.rank <= change.value;
			return qualifiedBefore === qualifiedAfter
				? []
				: [
						{
							heatId: heat.id,
							riderId: slot.riderId,
							qualifiedBefore,
							qualifiedAfter,
						},
					];
		}),
	);
}

/**
 * Previews an advancement change; reads only, never writes. Links decide who
 * moves on (as judging a heat applies them); `advancing` only drives the qualified
 * state, so it is reported separately.
 */
export function simulateAdvancementChange(
	bracket: Bracket,
	change: AdvancementChange,
): AdvancementSimulation {
	return {
		heats: change.links ? linkImpacts(bracket, change.links) : [],
		conflicts: change.links ? conflictsOf(bracket, change.links) : [],
		qualification: change.advancing
			? qualificationChanges(bracket, change.advancing)
			: [],
	};
}
