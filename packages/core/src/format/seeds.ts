import { createRandom, shuffle } from "../internal/random";
import type { Entry } from "../model";

const NO_PRIORITY = Number.MAX_SAFE_INTEGER;
/** Keeps the draw of the seeds apart from the draws of the rounds, which use `drawSeed + index`. */
const SEED_SALT = 5000;

const priorityOf = (entry: Entry) => entry.seed ?? NO_PRIORITY;

/**
 * Entries by seed priority, 1 first; entries without a priority come last. Equal
 * priorities (and the entries without one) are drawn with `random`.
 */
export function orderByPriority(
	entries: readonly Entry[],
	random: () => number,
): Entry[] {
	return shuffle(entries, random).sort((a, b) => priorityOf(a) - priorityOf(b));
}

/**
 * Round index (from 1) where each seed enters directly, given how many seeds enter
 * each round (`seedSlots[i]`; round 0 is ignored). The best priorities go to the
 * latest rounds; when fewer priorities are set than places, the next entries in
 * the same order fill them. Reproducible for a given `drawSeed`.
 */
export function assignSeedRounds(
	candidates: readonly Entry[],
	seedSlots: readonly number[],
	drawSeed: number,
): Map<string, number> {
	const ordered = orderByPriority(
		candidates,
		createRandom(drawSeed + SEED_SALT),
	);
	const assigned = new Map<string, number>();
	let next = 0;
	for (let round = seedSlots.length - 1; round >= 1; round--) {
		const places = seedSlots[round] ?? 0;
		for (let k = 0; k < places && next < ordered.length; k++) {
			assigned.set((ordered[next] as Entry).riderId, round);
			next++;
		}
	}
	return assigned;
}
