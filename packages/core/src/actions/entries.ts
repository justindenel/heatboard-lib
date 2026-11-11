import type { ActionResult } from "../errors";
import { findEntry, mapHeats, roundStarted } from "../internal/bracket";
import { fail, ok } from "../internal/result";
import type { Bracket, Entry } from "../model";
import { removeSlot } from "./composition";

function unknownRider(riderId: string): ActionResult {
	return fail("UNKNOWN_RIDER", `Unknown rider "${riderId}"`, { riderId });
}

/** Joining a round that has started is only allowed while the bracket is still being prepared. */
function checkEntryRoundOpen(
	bracket: Bracket,
	riderId: string,
	entryRoundId: string | undefined,
): ActionResult | undefined {
	const index =
		entryRoundId === undefined
			? 0
			: bracket.rounds.findIndex((r) => r.id === entryRoundId);
	if (index === -1) {
		return fail(
			"UNKNOWN_ROUND",
			`Unknown entry round "${entryRoundId ?? ""}"`,
			{ riderId, roundId: entryRoundId ?? "" },
		);
	}
	const round = bracket.rounds[index];
	const preparing =
		bracket.status === "draft" || bracket.status === "published";
	if (round && roundStarted(round) && !preparing) {
		return fail(
			"ROUND_STARTED",
			`Rider "${riderId}" cannot join round "${round.id}": it has started`,
			{ riderId, roundId: round.id },
		);
	}
	return undefined;
}

export function addEntry(bracket: Bracket, entry: Entry): ActionResult {
	if (findEntry(bracket, entry.riderId)) {
		return fail("DUPLICATE_ID", `Duplicate entry id "${entry.riderId}"`, {
			id: entry.riderId,
		});
	}
	const refused = checkEntryRoundOpen(
		bracket,
		entry.riderId,
		entry.entryRoundId,
	);
	if (refused) return refused;
	return ok({ ...bracket, entries: [...bracket.entries, entry] });
}

/** All or nothing: the first invalid entry rejects the whole batch, with its position in `details.index`. */
export function addEntries(bracket: Bracket, entries: Entry[]): ActionResult {
	let current = bracket;
	for (const [index, entry] of entries.entries()) {
		const result = addEntry(current, entry);
		if (!result.ok) {
			return fail(result.error.code, result.error.message, {
				...result.error.details,
				index,
			});
		}
		current = result.bracket;
	}
	return ok(current);
}

export function updateEntry(
	bracket: Bracket,
	riderId: string,
	changes: {
		displayName?: string;
		seed?: number | null;
		entryRoundId?: string | null;
	},
): ActionResult {
	const entry = findEntry(bracket, riderId);
	if (!entry) return unknownRider(riderId);

	const next: Entry = { riderId, displayName: entry.displayName };
	if (changes.displayName !== undefined) next.displayName = changes.displayName;
	const seed = changes.seed === undefined ? entry.seed : changes.seed;
	if (seed !== undefined && seed !== null) next.seed = seed;
	const entryRoundId =
		changes.entryRoundId === undefined
			? entry.entryRoundId
			: changes.entryRoundId;
	if (entryRoundId !== undefined && entryRoundId !== null) {
		next.entryRoundId = entryRoundId;
	}

	if (next.entryRoundId !== entry.entryRoundId) {
		const refused = checkEntryRoundOpen(bracket, riderId, next.entryRoundId);
		if (refused) return refused;
		const newIndex =
			next.entryRoundId === undefined
				? 0
				: bracket.rounds.findIndex((r) => r.id === next.entryRoundId);
		const placedBefore = bracket.rounds.find(
			(round, i) =>
				i < newIndex &&
				round.heats.some((h) => h.slots.some((s) => s.riderId === riderId)),
		);
		if (placedBefore) {
			return fail(
				"BEFORE_ENTRY_ROUND",
				`Rider "${riderId}" is already placed in round "${placedBefore.id}", before the new entry round`,
				{ riderId, roundId: placedBefore.id },
			);
		}
	}

	const unchanged =
		next.displayName === entry.displayName &&
		next.seed === entry.seed &&
		next.entryRoundId === entry.entryRoundId;
	if (unchanged) return ok(bracket);
	return ok({
		...bracket,
		entries: bracket.entries.map((e) => (e === entry ? next : e)),
	});
}

export function removeEntry(bracket: Bracket, riderId: string): ActionResult {
	const entry = findEntry(bracket, riderId);
	if (!entry) return unknownRider(riderId);
	for (const round of bracket.rounds) {
		const started = round.heats.find(
			(h) =>
				h.status !== "pending" && h.slots.some((s) => s.riderId === riderId),
		);
		if (started) {
			return fail(
				"RIDER_IN_STARTED_HEAT",
				`Rider "${riderId}" is in heat "${started.id}" which has started`,
				{ riderId, heatId: started.id },
			);
		}
	}
	const withoutEntry: Bracket = {
		...bracket,
		entries: bracket.entries.filter((e) => e !== entry),
	};
	return ok(
		mapHeats(withoutEntry, (heat) => {
			const slot = heat.slots.find((s) => s.riderId === riderId);
			return slot ? removeSlot(heat, slot) : heat;
		}),
	);
}
