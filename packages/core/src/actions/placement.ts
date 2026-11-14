import type { ActionResult } from "../errors";
import { assignSeedRounds, orderByPriority } from "../format/seeds";
import { editorFromPlan, planFromFormat } from "../format/plan";
import type { FormatEditorState, FormatSettings } from "../format/model";
import { makeSlot, mapHeats } from "../internal/bracket";
import { createRandom } from "../internal/random";
import { fail, ok } from "../internal/result";
import type { Bracket, Entry } from "../model";
import { awaitedRiders, hasStarted } from "../queries";
import { directEntries } from "./composition";
import { drawRound } from "./draw";
import { applyFormat } from "./format";

interface Rebuild {
	settings: FormatSettings;
	editor: FormatEditorState;
}

/**
 * The format recomputed for the current number of entries, when the heats must be rebuilt before
 * placing: the entries no longer match the count the format was planned for, or it has seed slots.
 * Undefined when the existing heats can be drawn as they are.
 */
function rebuildOf(bracket: Bracket): Rebuild | undefined {
	const { format } = bracket;
	const first = bracket.rounds[0];
	if (!format || !first) return undefined;
	const entered = bracket.entries.length;
	const planned =
		format.editor?.riders ?? first.heats.length * first.maxPerHeat;
	const mismatch = entered > 0 && entered !== planned;
	const hasSeedSlots = format.settings.rounds.some(
		(round) => (round.seedSlots ?? 0) > 0,
	);
	if (!mismatch && !hasSeedSlots) return undefined;
	const plan = planFromFormat(format.settings, format.editor);
	if (!plan) return undefined;
	const editor = editorFromPlan({ ...plan, riders: entered });
	// The draw seed only shuffles riders between heats and never decides whether the format fits, so
	// any value (0 here) is enough for this check.
	if (!applyFormat(bracket, format.settings, 0, editor).ok) return undefined;
	return { settings: format.settings, editor };
}

/**
 * What `placeAll` would do: "rebuild" applies the stored format again for the entered riders
 * (entry count differs from the planned one, or a round takes seeds), "draw" deals the first round.
 * Undefined when there is nothing to place or placing is impossible (no format, a heat has started).
 */
export function placeAllPlan(bracket: Bracket): "rebuild" | "draw" | undefined {
	if (
		!bracket.format ||
		bracket.rounds.length === 0 ||
		bracket.entries.length === 0 ||
		hasStarted(bracket)
	) {
		return undefined;
	}
	return rebuildOf(bracket) ? "rebuild" : "draw";
}

function checkDrawSeed(drawSeed: number): ActionResult | undefined {
	if (Number.isInteger(drawSeed)) return undefined;
	return fail(
		"INVALID_ARGUMENT",
		`Draw seed must be an integer, got ${drawSeed}`,
		{ drawSeed },
	);
}

function checkNotStarted(bracket: Bracket): ActionResult | undefined {
	for (const round of bracket.rounds) {
		const started = round.heats.find((h) => h.status !== "pending");
		if (started) {
			return fail(
				"ROUND_STARTED",
				`Heat "${started.id}" has started, placing is no longer possible`,
				{ roundId: round.id, heatId: started.id },
			);
		}
	}
	return undefined;
}

/** Destructive: places every entered rider again, the whole bracket included (see `placeAllPlan`). */
export function placeAll(bracket: Bracket, drawSeed: number): ActionResult {
	const refused = checkDrawSeed(drawSeed) ?? checkNotStarted(bracket);
	if (refused) return refused;
	const first = bracket.rounds[0];
	const plan = placeAllPlan(bracket);
	if (plan === "rebuild") {
		const rebuild = rebuildOf(bracket);
		if (rebuild) {
			return applyFormat(bracket, rebuild.settings, drawSeed, rebuild.editor);
		}
	}
	if (plan === "draw" && first) return drawRound(bracket, first.id, drawSeed);
	if (bracket.entries.length === 0) return ok(bracket);
	return fail(
		"INVALID_ARGUMENT",
		"Placing every rider needs a format applied and at least one round",
		{ field: "format" },
	);
}

function leastLoaded(loads: readonly number[], max: number): number {
	let best = -1;
	loads.forEach((load, h) => {
		if (load < max && (best === -1 || load < (loads[best] as number))) best = h;
	});
	return best;
}

/**
 * Returns the heat index of each of `count` riders, in priority order, and updates `loads`. Each
 * wave gives one rider to every heat at the lowest load that still has room, alternating direction
 * from one wave to the next: with heats of equal load this is a serpentine deal.
 */
function dealInWaves(count: number, loads: number[], max: number): number[] {
	const heatOf: number[] = [];
	for (let wave = 0; heatOf.length < count; wave++) {
		const open = loads.flatMap((load, h) => (load < max ? [h] : []));
		const lowest = Math.min(...open.map((h) => loads[h] as number));
		const level = open.filter((h) => loads[h] === lowest);
		if (wave % 2 === 1) level.reverse();
		// A wave that only tops up one heat does not count for the alternation: the next wave keeps the
		// same direction.
		if (level.length === 1) wave--;
		for (const h of level) {
			if (heatOf.length >= count) break;
			heatOf.push(h);
			loads[h] = (loads[h] as number) + 1;
		}
	}
	return heatOf;
}

/**
 * Non destructive: places the entered riders that sit in no heat and moves nobody else.
 * Free direct-entry places of the later rounds go to the best seed priorities, everyone else
 * is dealt over the least filled heats of their entry round (the first one by default).
 * Rounds are filled in order because the riders a heat still awaits depend on the earlier rounds.
 */
export function placeRest(bracket: Bracket, drawSeed: number): ActionResult {
	const refused = checkDrawSeed(drawSeed) ?? checkNotStarted(bracket);
	if (refused) return refused;
	const placed = new Set(
		bracket.rounds.flatMap((r) =>
			r.heats.flatMap((h) => h.slots.map((s) => s.riderId)),
		),
	);
	const toPlace = bracket.entries.filter((e) => !placed.has(e.riderId));
	if (toPlace.length === 0) return ok(bracket);

	const formatRounds = bracket.format?.settings.rounds ?? [];
	const roundIndexOfKey = formatRounds.map((fr) =>
		bracket.rounds.findIndex((r) => r.id === fr.key),
	);
	const freeSeedSlots = formatRounds.map((fr, k) => {
		const roundIndex = roundIndexOfKey[k] as number;
		return roundIndex > 0
			? Math.max(
					0,
					(fr.seedSlots ?? 0) - directEntries(bracket, roundIndex).length,
				)
			: 0;
	});
	const seeded = assignSeedRounds(
		toPlace.filter((e) => e.entryRoundId === undefined),
		freeSeedSlots,
		drawSeed,
	);
	const seedsOf = new Map<number, string[]>();
	for (const [riderId, k] of seeded) {
		const roundIndex = roundIndexOfKey[k] as number;
		seedsOf.set(roundIndex, [...(seedsOf.get(roundIndex) ?? []), riderId]);
	}
	const othersOf = new Map<number, Entry[]>();
	for (const entry of toPlace) {
		if (seeded.has(entry.riderId)) continue;
		const roundIndex =
			entry.entryRoundId === undefined
				? 0
				: bracket.rounds.findIndex((r) => r.id === entry.entryRoundId);
		if (roundIndex === -1) {
			return fail(
				"UNKNOWN_ROUND",
				`Rider "${entry.riderId}" has unknown entry round "${entry.entryRoundId ?? ""}"`,
				{ riderId: entry.riderId, roundId: entry.entryRoundId ?? "" },
			);
		}
		othersOf.set(roundIndex, [...(othersOf.get(roundIndex) ?? []), entry]);
	}

	let working = bracket;
	for (const [roundIndex, round] of bracket.rounds.entries()) {
		const seeds = seedsOf.get(roundIndex) ?? [];
		const others = othersOf.get(roundIndex) ?? [];
		const count = seeds.length + others.length;
		if (count === 0) continue;
		const loads = (working.rounds[roundIndex]?.heats ?? []).map(
			(h) => h.slots.length + awaitedRiders(working, h.id),
		);
		const capacity = loads.reduce(
			(sum, load) => sum + Math.max(0, round.maxPerHeat - load),
			0,
		);
		if (count > capacity) {
			return fail(
				"HEAT_FULL",
				`${count} riders do not fit in round "${round.id}" (room for ${capacity})`,
				{ roundId: round.id, riders: count, capacity },
			);
		}
		const added = loads.map(() => [] as string[]);
		for (const riderId of seeds) {
			const h = leastLoaded(loads, round.maxPerHeat);
			loads[h] = (loads[h] as number) + 1;
			added[h]?.push(riderId);
		}
		const ordered = orderByPriority(
			others,
			createRandom(drawSeed + roundIndex),
		);
		const heatOf = dealInWaves(ordered.length, loads, round.maxPerHeat);
		ordered.forEach((entry, k) =>
			added[heatOf[k] as number]?.push(entry.riderId),
		);
		working = mapHeats(working, (heat, _round, r, heatIndex) => {
			const riderIds = r === roundIndex ? (added[heatIndex] ?? []) : [];
			if (riderIds.length === 0) return heat;
			return {
				...heat,
				slots: [
					...heat.slots,
					...riderIds.map((id) => makeSlot(id, { rank: null })),
				],
			};
		});
	}
	return ok(working);
}
