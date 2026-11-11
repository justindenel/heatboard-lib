import { makeSlot } from "../internal/bracket";
import { createRandom, shuffle } from "../internal/random";
import type { Bracket, Entry, HeatSlot, Link } from "../model";
import { balancedSizes, branchBlocks, dealAcross } from "./fill";
import { assignSeedRounds, orderByPriority } from "./seeds";
import type {
	BuildFormatResult,
	BuiltRound,
	FormatRound,
	FormatSettings,
	FormatWarning,
} from "./model";

interface Ticket {
	rank: number;
	roundIndex: number;
	heatIndex: number;
	sourceHeatId?: string;
	fromRepechage: boolean;
	/** Target heat indexes this ticket may go to; any heat when absent. */
	allowedHeats?: number[];
}

function byTicketOrder(a: Ticket, b: Ticket): number {
	return (
		a.rank - b.rank || a.roundIndex - b.roundIndex || a.heatIndex - b.heatIndex
	);
}

function groupOf(format: FormatSettings, key: string): string {
	return format.rounds.find((r) => r.key === key)?.group ?? "main";
}

/**
 * Target heat of a rank that no rider holds yet (the heat is smaller than the largest
 * of its round), so that a rider added later still follows the outcome covering that rank:
 * the heat where the last planned rank of the same outcome goes, else the target round's first heat.
 */
function extraRankTarget(
	source: FormatRound,
	heatId: string,
	rank: number,
	size: number,
	destinations: Map<string, string>,
): string | undefined {
	const outcome = source.outcomes?.find(
		(o) => o.ranks[0] <= rank && rank <= o.ranks[1],
	);
	if (!outcome) return undefined;
	for (let r = Math.min(size, outcome.ranks[1]); r >= outcome.ranks[0]; r--) {
		const known = destinations.get(`${heatId}#${r}`);
		if (known !== undefined) return known;
	}
	return `${outcome.to}-1`;
}

/**
 * Generates rounds, heats, slots (riders entering at each round) and links
 * from format settings. Pure and deterministic for a given draw seed; reads only
 * the entries and the existing rounds (to keep the durations the format does not set, and the judging modes).
 * With fewer entries than `plannedRiders`, the first round is sized as if the missing
 * riders were there (capacities and links), so that they can be added afterwards.
 */
export function buildFromFormat(
	bracket: Pick<Bracket, "entries" | "rounds">,
	format: FormatSettings,
	drawSeed: number,
	plannedRiders = 0,
): BuildFormatResult {
	const entryIndexes = new Map<string, number>();
	for (const entry of bracket.entries) {
		const index =
			entry.entryRoundId === undefined
				? 0
				: format.rounds.findIndex((r) => r.key === entry.entryRoundId);
		if (index === -1) {
			return {
				ok: false,
				code: "UNKNOWN_ROUND",
				riderId: entry.riderId,
				entryRoundId: entry.entryRoundId as string,
			};
		}
		entryIndexes.set(entry.riderId, index);
	}
	const seedSlots = format.rounds.map((r) => r.seedSlots ?? 0);
	const seedRounds = assignSeedRounds(
		bracket.entries.filter((e) => e.entryRoundId === undefined),
		seedSlots,
		drawSeed,
	);
	for (const [riderId, index] of seedRounds) entryIndexes.set(riderId, index);
	// Places of a seed that no entered rider fills yet: planned riders keep their round sized.
	const missingSeedSlots = seedSlots.map((places, i) =>
		i === 0 || plannedRiders === 0
			? 0
			: places - [...seedRounds.values()].filter((index) => index === i).length,
	);
	const missingSeedSlotsTotal = missingSeedSlots.reduce((sum, n) => sum + n, 0);

	const warnings: FormatWarning[] = [];
	const rounds: BuiltRound[] = [];
	const sizes: number[][] = [];
	/** `${sourceHeatId}#${rank}` -> target heat id */
	const destinations = new Map<string, string>();

	format.rounds.forEach((fr, i) => {
		const entering = bracket.entries.filter(
			(e) => entryIndexes.get(e.riderId) === i,
		);
		const riders = orderByPriority(entering, createRandom(drawSeed + i));

		let tickets: Ticket[] = [];
		format.rounds.slice(0, i).forEach((source, j) => {
			const sourceKey = source.key;
			// A single block spanning every target heat is the same as no restriction.
			const blocks =
				fr.placement === "spread"
					? []
					: branchBlocks(source.heats, fr.heats).filter(
							(block) => block.target.length < fr.heats,
						);
			source.outcomes?.forEach((outcome) => {
				if (outcome.to !== fr.key) return;
				(sizes[j] ?? []).forEach((size, heatIndex) => {
					const allowedHeats = blocks.find((block) =>
						block.source.includes(heatIndex),
					)?.target;
					for (
						let rank = outcome.ranks[0];
						rank <= outcome.ranks[1] && rank <= size;
						rank++
					) {
						tickets.push({
							rank,
							roundIndex: j,
							heatIndex,
							sourceHeatId: `${sourceKey}-${heatIndex + 1}`,
							fromRepechage: source.group === "repechage",
							...(allowedHeats && { allowedHeats }),
						});
					}
				});
			});
		});
		tickets =
			format.fill === "draw"
				? shuffle(tickets, createRandom(drawSeed + 1000 + i))
				: tickets.sort(byTicketOrder);
		// Repechage qualifiers are dealt first and in a cycle: ordered by rank after the main-round
		// tickets, they would pile up in the first heats while the last ones get none.
		tickets = [
			...tickets.filter((t) => t.fromRepechage),
			...tickets.filter((t) => !t.fromRepechage),
		];

		const placeholders =
			i === 0
				? Math.max(
						0,
						plannedRiders - bracket.entries.length - missingSeedSlotsTotal,
					)
				: (missingSeedSlots[i] ?? 0);
		const total = riders.length + placeholders + tickets.length;
		const roundSizes = balancedSizes(total, fr.heats);
		sizes.push(roundSizes);
		if (total < fr.heats) {
			warnings.push({
				code: "TOO_MANY_HEATS",
				roundId: fr.key,
				riders: total,
				heats: fr.heats,
			});
		}

		type Item = { rider: Entry } | { ticket: Ticket } | { placeholder: true };
		const items: Item[] = [
			...riders.map((rider) => ({ rider })),
			...Array.from({ length: placeholders }, () => ({
				placeholder: true as const,
			})),
			...tickets.map((ticket) => ({ ticket })),
		];
		const { heatOf, rematches } = dealAcross(
			items,
			roundSizes,
			(item) => ("ticket" in item ? item.ticket.sourceHeatId : undefined),
			(item) => ("ticket" in item ? item.ticket.allowedHeats : undefined),
			(item) => "ticket" in item && item.ticket.fromRepechage,
		);

		const heatIds = roundSizes.map((_, h) => `${fr.key}-${h + 1}`);
		const slots: HeatSlot[][] = roundSizes.map(() => []);
		items.forEach((item, k) => {
			const h = heatOf[k] as number;
			const heatId = heatIds[h] as string;
			if ("rider" in item) {
				slots[h]?.push(makeSlot(item.rider.riderId, { rank: null }));
				return;
			}
			if ("placeholder" in item) return;
			const { ticket } = item;
			destinations.set(`${ticket.sourceHeatId}#${ticket.rank}`, heatId);
		});
		// A single heat gathers everyone: a rematch there cannot be avoided.
		for (const k of fr.heats === 1 ? [] : rematches) {
			const item = items[k] as Item;
			if ("ticket" in item && item.ticket.sourceHeatId) {
				warnings.push({
					code: "REMATCH",
					roundId: fr.key,
					heatId: heatIds[heatOf[k] as number] as string,
					sourceHeatId: item.ticket.sourceHeatId,
				});
			}
		}

		const group = fr.group ?? "main";
		// "All remaining places" outcomes use a very high upper rank: cap it at what a heat can hold.
		const largestHeat = Math.max(1, ...roundSizes);
		const allTargets = (fr.outcomes ?? []).map((o) => ({
			group: groupOf(format, o.to),
			optional: format.rounds.find((r) => r.key === o.to)?.optional === true,
			max: Math.min(o.ranks[1], largestHeat),
		}));
		// An optional target (a small final) takes the eliminated riders, it does not count as advancing.
		const required = allTargets.filter((t) => !t.optional);
		const targetsOf = required.length > 0 ? required : allTargets;
		const sameGroup = targetsOf
			.filter((t) => t.group === group)
			.map((t) => t.max);
		// No outgoing destination (a final, a small final): nobody qualifies.
		const advancing =
			sameGroup.length > 0
				? Math.max(...sameGroup)
				: targetsOf.length > 0
					? Math.max(...targetsOf.map((t) => t.max))
					: 0;

		const round: BuiltRound = {
			id: fr.key,
			name: fr.name,
			group,
			maxPerHeat: Math.max(1, Math.ceil(total / fr.heats)),
			advancing,
			heats: heatIds.map((id, h) => ({
				id,
				status: "pending",
				slots: slots[h] ?? [],
			})),
		};
		if (fr.optional) round.optional = true;
		rounds.push(round);
	});

	const links: Link[] = [];
	format.rounds.forEach((fr, j) => {
		const roundSizes = sizes[j] ?? [];
		const largest = Math.max(0, ...roundSizes);
		roundSizes.forEach((size, heatIndex) => {
			const heatId = `${fr.key}-${heatIndex + 1}`;
			for (let rank = 1; rank <= largest; rank++) {
				let to = destinations.get(`${heatId}#${rank}`);
				if (to === undefined && rank > size) {
					to = extraRankTarget(fr, heatId, rank, size, destinations);
				}
				links.push({
					from: { heatId, rank },
					to: to === undefined ? "eliminated" : { heatId: to },
				});
			}
		});
	});

	return {
		ok: true,
		rounds,
		links,
		sizes: Object.fromEntries(
			format.rounds.map((fr, j) => [fr.key, sizes[j] ?? []]),
		),
		warnings,
	};
}
