import type { ActionResult } from "../errors";
import {
	entryRoundIndex,
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
import { findHeat, type FoundHeat } from "../queries";

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

export function checkEntryRound(
	bracket: Bracket,
	riderId: string,
	found: FoundHeat,
): ActionResult | undefined {
	const entry = findEntry(bracket, riderId);
	if (!entry) {
		return fail("UNKNOWN_RIDER", `Unknown rider "${riderId}"`, { riderId });
	}
	const entryIndex = entryRoundIndex(bracket, entry);
	if (entryIndex === -1) {
		return fail(
			"UNKNOWN_ROUND",
			`Rider "${riderId}" has unknown entry round "${entry.entryRoundId ?? ""}"`,
			{ riderId, roundId: entry.entryRoundId ?? "" },
		);
	}
	if (found.roundIndex < entryIndex) {
		return fail(
			"BEFORE_ENTRY_ROUND",
			`Rider "${riderId}" cannot be placed in round "${found.round.id}" before entering at round "${entry.entryRoundId ?? ""}"`,
			{ riderId, roundId: found.round.id },
		);
	}
	return undefined;
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

export function place(
	bracket: Bracket,
	riderId: string,
	heatId: string,
	index: number | undefined,
): ActionResult {
	const found = findHeat(bracket, heatId);
	if (!found) return unknownHeat(heatId);
	const refused =
		checkEntryRound(bracket, riderId, found) ??
		checkComposable(found) ??
		checkRoom(riderId, found) ??
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
	if (crossRound && !options.allowCrossRoundMove) {
		return fail(
			"CROSS_ROUND_MOVE",
			`Moving rider "${riderId}" from round "${from.round.id}" to round "${to.round.id}" is not allowed`,
			{ riderId, fromRoundId: from.round.id, toRoundId: to.round.id },
		);
	}
	const refused =
		checkComposable(from) ??
		checkComposable(to) ??
		(crossRound ? checkEntryRound(bracket, riderId, to) : undefined);
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
	const badIndex = checkIndex(index, to.heat.slots.length);
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
