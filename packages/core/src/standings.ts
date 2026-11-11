import { DOUBLE_GROUP } from "./format/double";
import type { Bracket, ParticipantStatus } from "./model";
import { DEFAULT_OPTIONS, type BracketOptions } from "./options";

export interface Standing {
	riderId: string;
	place: number;
	tied: boolean;
	lastRoundId: string;
	status?: ParticipantStatus;
}

interface Candidate {
	riderId: string;
	roundIndex: number;
	heatIndex: number;
	slotIndex: number;
	rank: number | null;
	status: ParticipantStatus | undefined;
}

/**
 * Final standings: riders are tiered by the last round they reached, the last
 * round first. Round `group` is ignored, round order alone decides, so rounds
 * must be listed in running order (formats do). An optional round with no
 * started heat is ignored.
 *
 * A round holding exactly one fully ranked heat (every rider without status
 * has a rank) gives distinct places to the riders whose last round it is.
 * Any other round is a tier: tied by default, or tied by rank across heats
 * with `separateWithinHeat`. A small final therefore needs its own round,
 * placed before the final's round, to get distinct places.
 */
export function computeStandings(
	bracket: Bracket,
	options: BracketOptions & { separateWithinHeat?: boolean } = {},
): Standing[] {
	const statusOrder = options.statusOrder ?? DEFAULT_OPTIONS.statusOrder;
	const last = new Map<string, Candidate>();
	for (const [roundIndex, round] of bracket.rounds.entries()) {
		if (round.optional && round.heats.every((h) => h.status === "pending")) {
			continue;
		}
		const isDouble = round.group === DOUBLE_GROUP;
		for (const [heatIndex, heat] of round.heats.entries()) {
			if (isDouble && heat.status === "pending") continue;
			for (const [slotIndex, slot] of heat.slots.entries()) {
				last.set(slot.riderId, {
					riderId: slot.riderId,
					roundIndex,
					heatIndex,
					slotIndex,
					rank: slot.rank,
					status: slot.status,
				});
			}
		}
	}

	const roundIndexOfHeat = new Map<string, number>();
	for (const [roundIndex, round] of bracket.rounds.entries()) {
		for (const heat of round.heats) roundIndexOfHeat.set(heat.id, roundIndex);
	}
	const lastSingleIndex = bracket.rounds.findLastIndex(
		(r) => r.group !== DOUBLE_GROUP,
	);
	const hasDouble = bracket.rounds.some((r) => r.group === DOUBLE_GROUP);
	const tierOf = (roundIndex: number): number => {
		const round = bracket.rounds[roundIndex];
		if (!hasDouble || !round || round.group === DOUBLE_GROUP) return roundIndex;
		if (roundIndex === lastSingleIndex) return Number.POSITIVE_INFINITY;
		const heatIds = new Set(round.heats.map((h) => h.id));
		const targets = bracket.links
			.filter((l) => heatIds.has(l.from.heatId) && l.to !== "eliminated")
			.map((l) => roundIndexOfHeat.get((l.to as { heatId: string }).heatId))
			.filter(
				(i): i is number =>
					i !== undefined && bracket.rounds[i]?.group === DOUBLE_GROUP,
			);
		return targets.length === 0 ? roundIndex : Math.min(...targets);
	};

	const tiers = new Map<number, Candidate[]>();
	for (const candidate of last.values()) {
		const at = tierOf(candidate.roundIndex);
		const tier = tiers.get(at) ?? [];
		tier.push(candidate);
		tiers.set(at, tier);
	}
	const tierKeys = [...tiers.keys()].sort((a, b) =>
		a < b ? 1 : a > b ? -1 : 0,
	);

	const sortKey = (c: Candidate): [number, number] => {
		if (c.status !== undefined) {
			const at = statusOrder.indexOf(c.status);
			return [2, at === -1 ? statusOrder.length : at];
		}
		return c.rank === null ? [1, 0] : [0, c.rank];
	};
	const bySortKey = (a: Candidate, b: Candidate) => {
		const [ka, va] = sortKey(a);
		const [kb, vb] = sortKey(b);
		return ka - kb || va - vb;
	};
	const byPosition = (a: Candidate, b: Candidate) =>
		bySortKey(a, b) || a.heatIndex - b.heatIndex || a.slotIndex - b.slotIndex;

	const toStanding = (c: Candidate, place: number, tied: boolean): Standing => {
		const standing: Standing = {
			riderId: c.riderId,
			place,
			tied,
			lastRoundId: bracket.rounds[c.roundIndex]?.id ?? "",
		};
		if (c.status !== undefined) standing.status = c.status;
		return standing;
	};

	const isDistinct = (tier: Candidate[]) => {
		const roundIndex = tier[0]?.roundIndex ?? -1;
		if (tier.some((c) => c.roundIndex !== roundIndex)) return false;
		const round = bracket.rounds[roundIndex];
		return (
			round !== undefined &&
			round.heats.length === 1 &&
			round.heats.every((h) =>
				h.slots.every(
					(slot) => slot.status !== undefined || slot.rank !== null,
				),
			)
		);
	};

	const standings: Standing[] = [];
	for (const tierKey of tierKeys) {
		const tier = [...(tiers.get(tierKey) ?? [])].sort(byPosition);
		const base = standings.length;
		if (isDistinct(tier)) {
			for (const c of tier) {
				standings.push(toStanding(c, base + 1 + tier.indexOf(c), false));
			}
			continue;
		}
		if (!options.separateWithinHeat) {
			for (const c of tier)
				standings.push(toStanding(c, base + 1, tier.length > 1));
			continue;
		}
		let start = 0;
		while (start < tier.length) {
			const head = tier[start] as Candidate;
			let end = start;
			while (end < tier.length && bySortKey(head, tier[end] as Candidate) === 0)
				end++;
			for (const c of tier.slice(start, end)) {
				standings.push(toStanding(c, base + start + 1, end - start > 1));
			}
			start = end;
		}
	}
	return standings;
}
