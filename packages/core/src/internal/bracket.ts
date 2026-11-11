import type { Bracket, Entry, Heat, HeatSlot, Round } from "../model";

/** Applies `fn` to every heat; unchanged heats and rounds keep their reference. */
export function mapHeats(
	bracket: Bracket,
	fn: (heat: Heat, round: Round, roundIndex: number, heatIndex: number) => Heat,
): Bracket {
	let changed = false;
	const rounds = bracket.rounds.map((round, roundIndex) => {
		let roundChanged = false;
		const heats = round.heats.map((heat, heatIndex) => {
			const next = fn(heat, round, roundIndex, heatIndex);
			if (next !== heat) roundChanged = true;
			return next;
		});
		if (!roundChanged) return round;
		changed = true;
		return { ...round, heats };
	});
	return changed ? { ...bracket, rounds } : bracket;
}

/** Replaces the heat at the given position, never by id. */
export function replaceHeat(
	bracket: Bracket,
	at: { roundIndex: number; heatIndex: number },
	next: Heat,
): Bracket {
	return mapHeats(bracket, (heat, _round, roundIndex, heatIndex) =>
		roundIndex === at.roundIndex && heatIndex === at.heatIndex ? next : heat,
	);
}

export function roundHasRider(round: Round, riderId: string): boolean {
	return round.heats.some((heat) =>
		heat.slots.some((slot) => slot.riderId === riderId),
	);
}

export function findEntry(
	bracket: Bracket,
	riderId: string,
): Entry | undefined {
	return bracket.entries.find((entry) => entry.riderId === riderId);
}

/** Index of the round where the entry joins, or -1 when `entryRoundId` is unknown. */
export function entryRoundIndex(bracket: Bracket, entry: Entry): number {
	if (entry.entryRoundId === undefined) return 0;
	return bracket.rounds.findIndex((round) => round.id === entry.entryRoundId);
}

export function makeSlot(
	riderId: string,
	fields: Pick<HeatSlot, "rank" | "status" | "overridden">,
): HeatSlot {
	const slot: HeatSlot = { riderId, rank: fields.rank };
	if (fields.status !== undefined) slot.status = fields.status;
	if (fields.overridden) slot.overridden = true;
	return slot;
}

/** Returns `prev` itself when `next` carries the same values. */
export function reuseSlot(prev: HeatSlot, next: HeatSlot): HeatSlot {
	return prev.rank === next.rank &&
		prev.status === next.status &&
		(prev.overridden ?? false) === (next.overridden ?? false)
		? prev
		: next;
}

/** Returns `heat` itself when every slot is the same reference. */
export function withSlots(heat: Heat, slots: HeatSlot[]): Heat {
	const same =
		slots.length === heat.slots.length &&
		slots.every((slot, i) => slot === heat.slots[i]);
	if (same) return heat;
	const { order, ...rest } = heat;
	const kept =
		order && slots.every((s) => s.rank === null)
			? order.filter((id) =>
					slots.some((s) => s.riderId === id && s.status === undefined),
				)
			: [];
	return kept.length > 0 ? { ...rest, slots, order: kept } : { ...rest, slots };
}

/** Renumbers ranked slots 1..n keeping their relative order. */
export function renumber(slots: HeatSlot[]): HeatSlot[] {
	const order = slots
		.filter((slot) => slot.rank !== null)
		.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
	return slots.map((slot) => {
		if (slot.rank === null) return slot;
		return reuseSlot(
			slot,
			makeSlot(slot.riderId, { ...slot, rank: order.indexOf(slot) + 1 }),
		);
	});
}

/** A heat has started as soon as it leaves `pending`. */
export function isStarted(heat: Heat): boolean {
	return heat.status !== "pending";
}

export function isJudged(heat: Heat): boolean {
	return heat.status === "judged" || heat.status === "locked";
}

/** Every heat of the non-optional rounds is judged or locked; false when there is no such heat. */
export function requiredHeatsJudged(rounds: Round[]): boolean {
	const heats = rounds.filter((r) => !r.optional).flatMap((r) => r.heats);
	return heats.length > 0 && heats.every(isJudged);
}

export function roundStarted(round: Round): boolean {
	return round.heats.some(isStarted);
}
