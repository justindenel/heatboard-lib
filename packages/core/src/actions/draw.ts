import type { ActionResult } from "../errors";
import { entryRoundIndex, makeSlot } from "../internal/bracket";
import { createRandom } from "../internal/random";
import { fail, ok } from "../internal/result";
import { serpentineIndex } from "../internal/serpentine";
import { orderByPriority } from "../format/seeds";
import type { Bracket } from "../model";

/**
 * Riders are dealt in serpentine order by seed priority (ties and riders without
 * a priority drawn from `drawSeed`). Slot statuses are dropped: a pending heat is
 * rebuilt from scratch.
 */
export function drawRound(
	bracket: Bracket,
	roundId: string,
	drawSeed: number,
): ActionResult {
	const roundIndex = bracket.rounds.findIndex((r) => r.id === roundId);
	const round = bracket.rounds[roundIndex];
	if (!round) {
		return fail("UNKNOWN_ROUND", `Unknown round "${roundId}"`, { roundId });
	}
	if (!Number.isInteger(drawSeed)) {
		return fail(
			"INVALID_ARGUMENT",
			`Draw seed must be an integer, got ${drawSeed}`,
			{ drawSeed },
		);
	}
	const started = bracket.rounds
		.flatMap((r) => r.heats)
		.find((h) => h.status !== "pending");
	if (started) {
		return fail(
			"ROUND_STARTED",
			`Heat "${started.id}" has started, the draw is no longer possible`,
			{ roundId, heatId: started.id },
		);
	}

	// Seeds already placed in a later round (see `seeds` in the format) must not be drawn again.
	const placedLater = new Set(
		bracket.rounds
			.slice(roundIndex + 1)
			.flatMap((r) => r.heats.flatMap((h) => h.slots.map((s) => s.riderId))),
	);
	const entering = bracket.entries.filter(
		(entry) =>
			entryRoundIndex(bracket, entry) === roundIndex &&
			!placedLater.has(entry.riderId),
	);
	const drawn = orderByPriority(entering, createRandom(drawSeed));

	const heatCount = round.heats.length;
	const capacity = heatCount * round.maxPerHeat;
	if (drawn.length > capacity) {
		return fail(
			"HEAT_FULL",
			`${drawn.length} riders do not fit in round "${roundId}" (capacity ${capacity})`,
			{ roundId, riders: drawn.length, capacity },
		);
	}

	const slots = round.heats.map(() => [] as ReturnType<typeof makeSlot>[]);
	drawn.forEach((entry, k) => {
		slots[serpentineIndex(k, heatCount)]?.push(
			makeSlot(entry.riderId, { rank: null }),
		);
	});
	const rounds = bracket.rounds.map((r, i) =>
		i === roundIndex
			? {
					...r,
					heats: r.heats.map((h, j) => {
						const next = { ...h, slots: slots[j] ?? [] };
						delete next.order;
						return next;
					}),
				}
			: r,
	);
	return ok({ ...bracket, rounds });
}
