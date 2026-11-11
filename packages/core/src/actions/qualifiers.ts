import type { ActionResult } from "../errors";
import { replaceHeat, roundHasRider } from "../internal/bracket";
import { fail, ok } from "../internal/result";
import type { Bracket, Heat } from "../model";
import { findHeat } from "../queries";
import { checkComposable, checkEntryRound, checkRoom } from "./composition";

/** Target heats of the links leaving `heatId`, without the eliminated outcome. */
function targetHeatIds(bracket: Bracket, heatId: string): string[] {
	const ids = new Set<string>();
	for (const link of bracket.links) {
		if (link.from.heatId === heatId && link.to !== "eliminated") {
			ids.add(link.to.heatId);
		}
	}
	return [...ids];
}

/**
 * Puts the qualifiers of a judged heat into the heats its links lead to, all
 * or nothing. A rider already anywhere in the target round is left alone, so
 * placing twice changes nothing and a manual placement is not overridden.
 */
export function placeQualifiers(
	bracket: Bracket,
	heatId: string,
): ActionResult {
	const source = findHeat(bracket, heatId);
	if (!source) {
		return fail("UNKNOWN_HEAT", `Unknown heat "${heatId}"`, { heatId });
	}
	const links = bracket.links.filter((l) => l.from.heatId === heatId);
	for (const link of links) {
		if (link.to === "eliminated") continue;
		const target = findHeat(bracket, link.to.heatId);
		if (!target) {
			return fail("UNKNOWN_HEAT", `Unknown heat "${link.to.heatId}"`, {
				heatId: link.to.heatId,
			});
		}
		if (target.roundIndex <= source.roundIndex) {
			return fail(
				"INVALID_LINK",
				`Link from heat "${heatId}" targets heat "${target.heat.id}" which is not in a later round`,
				{ fromHeatId: heatId, toHeatId: target.heat.id },
			);
		}
	}

	let current = bracket;
	for (const link of links) {
		if (link.to === "eliminated") continue;
		const slot = source.heat.slots.find(
			(s) => s.rank === link.from.rank && s.status === undefined,
		);
		let target = findHeat(current, link.to.heatId);
		if (!slot || !target) continue;
		if (roundHasRider(target.round, slot.riderId)) continue;
		// The links come from the stored format, which decided this rider goes there: the heat grows.
		if (current.format && target.heat.slots.length >= target.round.maxPerHeat) {
			const roundIndex = target.roundIndex;
			current = {
				...current,
				rounds: current.rounds.map((r, i) =>
					i === roundIndex ? { ...r, maxPerHeat: r.maxPerHeat + 1 } : r,
				),
			};
			target = findHeat(current, link.to.heatId) ?? target;
		}
		const refused =
			checkEntryRound(current, slot.riderId, target) ??
			checkComposable(target) ??
			checkRoom(slot.riderId, target);
		if (refused) return refused;
		const added: Heat = {
			...target.heat,
			slots: [...target.heat.slots, { riderId: slot.riderId, rank: null }],
		};
		current = replaceHeat(current, target, added);
	}
	return ok(current);
}

/**
 * Takes the riders of a heat back out of the heats its links lead to, ahead of
 * a reopening. Callers have already checked that no target has started.
 */
export function withdrawQualifiers(bracket: Bracket, heatId: string): Bracket {
	const source = findHeat(bracket, heatId);
	if (!source) return bracket;
	const riderIds = new Set(source.heat.slots.map((s) => s.riderId));
	let current = bracket;
	for (const targetId of targetHeatIds(bracket, heatId)) {
		const target = findHeat(current, targetId);
		if (!target || !target.heat.slots.some((s) => riderIds.has(s.riderId))) {
			continue;
		}
		const withdrawn: Heat = {
			...target.heat,
			slots: target.heat.slots.filter((s) => !riderIds.has(s.riderId)),
		};
		current = replaceHeat(current, target, withdrawn);
	}
	return current;
}
