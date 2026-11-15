import type { ActionResult } from "../errors";
import {
	findEntry,
	makeSlot,
	mapHeats,
	renumber,
	replaceHeat,
	roundHasRider,
} from "../internal/bracket";
import { fail, ok } from "../internal/result";
import type { Bracket, Heat, HeatSlot } from "../model";
import type { BracketOptions } from "../options";
import {
	advancementOf,
	awaitedRiders,
	findHeat,
	hasStarted,
	sourceFlows,
	type FoundHeat,
} from "../queries";

export function insertAt<T>(
	items: T[],
	item: T,
	index: number | undefined,
): T[] {
	const at = index ?? items.length;
	return [...items.slice(0, at), item, ...items.slice(at)];
}

export function checkIndex(
	index: number | undefined,
	length: number,
): ActionResult | undefined {
	if (index === undefined) return undefined;
	if (Number.isInteger(index) && index >= 0 && index <= length) {
		return undefined;
	}
	return fail(
		"INVALID_ARGUMENT",
		`Index ${index} is outside the valid range 0..${length}`,
		{ index, length },
	);
}

export function checkComposable(found: FoundHeat): ActionResult | undefined {
	const { heat } = found;
	if (heat.status === "locked") {
		return fail("HEAT_LOCKED", `Heat "${heat.id}" is locked`, {
			heatId: heat.id,
		});
	}
	if (heat.status !== "pending") {
		return fail(
			"HEAT_STARTED",
			`Heat "${heat.id}" is ${heat.status} and its composition cannot change`,
			{ heatId: heat.id },
		);
	}
	return undefined;
}

function unknownHeat(heatId: string): ActionResult {
	return fail("UNKNOWN_HEAT", `Unknown heat "${heatId}"`, { heatId });
}

function checkKnownRider(
	bracket: Bracket,
	riderId: string,
): ActionResult | undefined {
	if (findEntry(bracket, riderId)) return undefined;
	return fail("UNKNOWN_RIDER", `Unknown rider "${riderId}"`, { riderId });
}

export function checkRoom(
	riderId: string,
	found: FoundHeat,
): ActionResult | undefined {
	const { round, heat } = found;
	if (roundHasRider(round, riderId)) {
		return fail(
			"RIDER_ALREADY_IN_ROUND",
			`Rider "${riderId}" is already in round "${round.id}"`,
			{ riderId, roundId: round.id },
		);
	}
	if (heat.slots.length >= round.maxPerHeat) {
		return fail(
			"HEAT_FULL",
			`Heat "${heat.id}" already holds ${round.maxPerHeat} riders`,
			{ heatId: heat.id, max: round.maxPerHeat },
		);
	}
	return undefined;
}

/**
 * True when the links would bring this rider into the heat, so it may take one of the places held
 * for qualifiers. From a judged or locked feeder, only the rider at the linked rank qualifies; from a
 * feeder not judged yet, any of its riders does, as long as fewer of them sit in the heat than its
 * links will deliver.
 */
function isAwaitedIn(
	bracket: Bracket,
	riderId: string,
	heatId: string,
): boolean {
	const flows = sourceFlows(bracket, heatId);
	return bracket.links.some((link) => {
		if (link.to === "eliminated" || link.to.heatId !== heatId) return false;
		const source = findHeat(bracket, link.from.heatId)?.heat;
		const slot = source?.slots.find((s) => s.riderId === riderId);
		if (!source || !slot || slot.status !== undefined) return false;
		if (source.status === "judged" || source.status === "locked") {
			return slot.rank === link.from.rank;
		}
		const flow = flows.find((f) => f.heatId === source.id);
		return flow !== undefined && flow.arrived < flow.expected;
	});
}

/**
 * Automatic advancement only: a place the links will fill for a qualifier cannot be taken by hand.
 * A rider the heat awaits takes its own reserved place, so it is not counted twice.
 */
function checkAwaitedRoom(
	bracket: Bracket,
	riderId: string,
	found: FoundHeat,
): ActionResult | undefined {
	if (advancementOf(bracket) !== "auto") return undefined;
	const { round, heat } = found;
	if (isAwaitedIn(bracket, riderId, heat.id)) return undefined;
	if (heat.slots.length + awaitedRiders(bracket, heat.id) < round.maxPerHeat) {
		return undefined;
	}
	return fail(
		"HEAT_FULL",
		`Heat "${heat.id}" holds or awaits ${round.maxPerHeat} riders`,
		{ heatId: heat.id, max: round.maxPerHeat },
	);
}

/**
 * Number of seeds the stored format lets the round take directly (0 when it sets none). Undefined
 * without a stored format or when the format has no round with this id.
 */
export function seedSlotsOfRound(
	bracket: Bracket,
	roundId: string,
): number | undefined {
	const round = bracket.format?.settings.rounds.find((r) => r.key === roundId);
	return round ? (round.seedSlots ?? 0) : undefined;
}

/** Riders sitting in a heat of the round and in no heat of an earlier round; `except` is left out. */
export function directEntries(
	bracket: Bracket,
	roundIndex: number,
	except?: string,
): string[] {
	const earlier = new Set(
		bracket.rounds
			.slice(0, roundIndex)
			.flatMap((r) => r.heats.flatMap((h) => h.slots.map((s) => s.riderId))),
	);
	const direct = new Set<string>();
	for (const heat of bracket.rounds[roundIndex]?.heats ?? []) {
		for (const slot of heat.slots) {
			if (slot.riderId !== except && !earlier.has(slot.riderId)) {
				direct.add(slot.riderId);
			}
		}
	}
	return [...direct];
}

/**
 * Automatic advancement with a stored format only: a later round takes at most `seedSlots` riders
 * who sit in none of its earlier rounds. A rider still sitting in an earlier heat (a qualifier
 * copied up) or moving inside the round takes no such place. `from` is the heat the rider leaves:
 * a rider moved out of an earlier round does take a place.
 */
function checkSeedSlots(
	bracket: Bracket,
	riderId: string,
	to: FoundHeat,
	from?: FoundHeat,
): ActionResult | undefined {
	if (advancementOf(bracket) !== "auto" || to.roundIndex === 0) {
		return undefined;
	}
	if (from?.roundIndex === to.roundIndex) return undefined;
	const seedSlots = seedSlotsOfRound(bracket, to.round.id);
	if (seedSlots === undefined) return undefined;
	const playedBefore = bracket.rounds
		.slice(0, to.roundIndex)
		.some((r) =>
			r.heats.some(
				(h) => h !== from?.heat && h.slots.some((s) => s.riderId === riderId),
			),
		);
	if (playedBefore) return undefined;
	if (directEntries(bracket, to.roundIndex, riderId).length < seedSlots) {
		return undefined;
	}
	return fail(
		"SEED_SLOTS_FULL",
		`Round "${to.round.id}" already has its ${seedSlots} direct entries`,
		{ roundId: to.round.id, seedSlots },
	);
}

/**
 * Placing a rider in a later round leaves it in its earlier heat too, which is only meaningful once
 * that heat is judged or locked. Refused while that heat is running (no result yet) or pending (the
 * rider has to be moved out of it instead).
 */
function checkNotPlacedEarlier(
	bracket: Bracket,
	riderId: string,
	to: FoundHeat,
): ActionResult | undefined {
	for (const round of bracket.rounds.slice(0, to.roundIndex)) {
		for (const heat of round.heats) {
			if (!heat.slots.some((s) => s.riderId === riderId)) continue;
			if (heat.status === "running") {
				return fail(
					"SOURCE_HEAT_RUNNING",
					`Heat "${heat.id}" is running and its riders cannot be brought up yet`,
					{ heatId: heat.id },
				);
			}
			if (heat.status === "pending") {
				return fail(
					"RIDER_ALREADY_PLACED",
					`Rider "${riderId}" is already placed in heat "${heat.id}": move them instead`,
					{ riderId, heatId: heat.id },
				);
			}
		}
	}
	return undefined;
}

function placeIn(
	bracket: Bracket,
	riderId: string,
	heatId: string,
	index: number | undefined,
	guardEarlier: boolean,
): ActionResult {
	const found = findHeat(bracket, heatId);
	if (!found) return unknownHeat(heatId);
	const refused =
		checkKnownRider(bracket, riderId) ??
		checkComposable(found) ??
		checkRoom(riderId, found) ??
		checkAwaitedRoom(bracket, riderId, found) ??
		checkSeedSlots(bracket, riderId, found) ??
		(guardEarlier
			? checkNotPlacedEarlier(bracket, riderId, found)
			: undefined) ??
		checkIndex(index, found.heat.slots.length);
	if (refused) return refused;
	const slot = makeSlot(riderId, { rank: null });
	return ok(
		replaceHeat(bracket, found, {
			...found.heat,
			slots: insertAt(found.heat.slots, slot, index),
		}),
	);
}

export function place(
	bracket: Bracket,
	riderId: string,
	heatId: string,
	index: number | undefined,
): ActionResult {
	return placeIn(bracket, riderId, heatId, index, true);
}

export function removeSlot(heat: Heat, slot: HeatSlot): Heat {
	const slots = renumber(heat.slots.filter((s) => s !== slot));
	return { ...heat, slots };
}

/**
 * Removal is allowed in any round, including the first one, as long as the
 * heat is pending: registrations live in `entries`, not in heats.
 */
export function remove(
	bracket: Bracket,
	riderId: string,
	heatId: string,
): ActionResult {
	const found = findHeat(bracket, heatId);
	if (!found) return unknownHeat(heatId);
	const slot = found.heat.slots.find((s) => s.riderId === riderId);
	if (!slot) return notInHeat(riderId, heatId);
	const refused = checkComposable(found);
	if (refused) return refused;
	return ok(replaceHeat(bracket, found, removeSlot(found.heat, slot)));
}

export function notInHeat(riderId: string, heatId: string): ActionResult {
	return fail(
		"RIDER_NOT_IN_HEAT",
		`Rider "${riderId}" is not in heat "${heatId}"`,
		{ riderId, heatId },
	);
}

export function move(
	bracket: Bracket,
	riderId: string,
	fromHeatId: string,
	toHeatId: string,
	index: number | undefined,
	options: Required<BracketOptions>,
): ActionResult {
	const from = findHeat(bracket, fromHeatId);
	if (!from) return unknownHeat(fromHeatId);
	const to = findHeat(bracket, toHeatId);
	if (!to) return unknownHeat(toHeatId);
	const slot = from.heat.slots.find((s) => s.riderId === riderId);
	if (!slot) return notInHeat(riderId, fromHeatId);

	if (from.roundIndex === to.roundIndex && from.heatIndex === to.heatIndex) {
		const rest = from.heat.slots.filter((s) => s !== slot);
		const refused = checkComposable(from) ?? checkIndex(index, rest.length);
		if (refused) return refused;
		const slots = insertAt(rest, slot, index);
		const unchanged = slots.every((s, i) => s === from.heat.slots[i]);
		if (unchanged) return ok(bracket);
		return ok(replaceHeat(bracket, from, { ...from.heat, slots }));
	}

	const crossRound = from.roundIndex !== to.roundIndex;
	const crossRoundAllowed =
		options.allowCrossRoundMove ||
		!hasStarted(bracket) ||
		advancementOf(bracket) === "manual";
	if (crossRound && !crossRoundAllowed) {
		return fail(
			"CROSS_ROUND_MOVE",
			`Moving rider "${riderId}" from round "${from.round.id}" to round "${to.round.id}" is not allowed`,
			{ riderId, fromRoundId: from.round.id, toRoundId: to.round.id },
		);
	}
	const refused =
		checkComposable(from) ??
		checkComposable(to) ??
		(crossRound ? checkKnownRider(bracket, riderId) : undefined);
	if (refused) return refused;

	const fullOrDuplicate = crossRound
		? checkRoom(riderId, to)
		: to.heat.slots.length >= to.round.maxPerHeat
			? fail(
					"HEAT_FULL",
					`Heat "${to.heat.id}" already holds ${to.round.maxPerHeat} riders`,
					{ heatId: to.heat.id, max: to.round.maxPerHeat },
				)
			: undefined;
	if (fullOrDuplicate) return fullOrDuplicate;
	// Check awaited places and seed slots as if the rider had already left its source heat: when that
	// heat feeds the target, the rider must no longer count as one of the riders the target awaits.
	const without = replaceHeat(bracket, from, removeSlot(from.heat, slot));
	const badIndex =
		checkAwaitedRoom(without, riderId, to) ??
		checkSeedSlots(without, riderId, to, from) ??
		checkIndex(index, to.heat.slots.length);
	if (badIndex) return badIndex;

	const moved = makeSlot(riderId, {
		rank: null,
		status: slot.status,
		overridden: slot.status !== undefined && slot.overridden,
	});
	return ok(
		mapHeats(bracket, (heat, _round, roundIndex, heatIndex) => {
			if (roundIndex === from.roundIndex && heatIndex === from.heatIndex) {
				return removeSlot(heat, slot);
			}
			if (roundIndex === to.roundIndex && heatIndex === to.heatIndex) {
				return { ...heat, slots: insertAt(heat.slots, moved, index) };
			}
			return heat;
		}),
	);
}

/**
 * Brings a rider to a later round. From a judged or locked heat the rider is copied and keeps its
 * result there; from a pending heat it is moved. Refused when the source heat is running or the
 * target round does not come after the source round.
 */
export function advance(
	bracket: Bracket,
	riderId: string,
	fromHeatId: string,
	toHeatId: string,
	index: number | undefined,
	options: Required<BracketOptions>,
): ActionResult {
	const from = findHeat(bracket, fromHeatId);
	if (!from) return unknownHeat(fromHeatId);
	const to = findHeat(bracket, toHeatId);
	if (!to) return unknownHeat(toHeatId);
	if (to.roundIndex <= from.roundIndex) {
		return fail(
			"NOT_LATER_ROUND",
			`Round "${to.round.id}" does not come after round "${from.round.id}"`,
			{ riderId, fromRoundId: from.round.id, toRoundId: to.round.id },
		);
	}
	if (!from.heat.slots.some((s) => s.riderId === riderId)) {
		return notInHeat(riderId, fromHeatId);
	}
	if (from.heat.status === "running") {
		return fail(
			"SOURCE_HEAT_RUNNING",
			`Heat "${from.heat.id}" is running and its riders cannot be brought up yet`,
			{ heatId: from.heat.id },
		);
	}
	if (from.heat.status === "pending") {
		return move(bracket, riderId, fromHeatId, toHeatId, index, options);
	}
	return placeIn(bracket, riderId, toHeatId, index, false);
}
