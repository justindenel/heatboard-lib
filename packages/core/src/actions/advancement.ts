import type { ActionResult } from "../errors";
import { formatLocked } from "../internal/format";
import { fail, ok } from "../internal/result";
import type { Bracket, Link, Round } from "../model";
import { findHeat } from "../queries";
import { destructive, judgedHeats, markForReview } from "./review";

export function updateRound(
	bracket: Bracket,
	roundId: string,
	changes: { advancing?: number },
	confirm: boolean,
): ActionResult {
	const index = bracket.rounds.findIndex((r) => r.id === roundId);
	const round = bracket.rounds[index];
	if (!round) {
		return fail("UNKNOWN_ROUND", `Unknown round "${roundId}"`, { roundId });
	}
	const { advancing } = changes;
	if (
		advancing !== undefined &&
		(!Number.isInteger(advancing) || advancing < 1)
	) {
		return fail(
			"INVALID_ARGUMENT",
			`advancing must be an integer >= 1, got ${advancing}`,
			{ roundId, advancing },
		);
	}
	if (advancing === undefined || advancing === round.advancing) {
		return ok(bracket);
	}
	const locked = formatLocked(bracket, "updateRound");
	if (locked) return locked;
	const judged = judgedHeats(bracket, roundId);
	if (judged.length > 0 && !confirm) return destructive(judged.length);
	const next: Round = { ...round, advancing };
	const updated: Bracket = {
		...bracket,
		rounds: bracket.rounds.map((r, i) => (i === index ? next : r)),
	};
	if (judged.length === 0) return ok(updated);
	return ok(
		markForReview(updated, new Set(judged.map((h) => h.id)), new Set()),
	);
}

function linkKey(link: Link): string {
	return JSON.stringify([
		link.from.heatId,
		link.from.rank,
		link.to === "eliminated" ? null : link.to.heatId,
	]);
}

function checkLinks(bracket: Bracket, links: Link[]): ActionResult | undefined {
	for (const link of links) {
		const from = findHeat(bracket, link.from.heatId);
		if (!from) {
			return fail(
				"UNKNOWN_HEAT",
				`Link from unknown heat "${link.from.heatId}"`,
				{
					heatId: link.from.heatId,
				},
			);
		}
		if (!Number.isInteger(link.from.rank) || link.from.rank < 1) {
			return fail(
				"INVALID_LINK",
				`Link from heat "${link.from.heatId}" has invalid rank ${link.from.rank}`,
				{ heatId: link.from.heatId, rank: link.from.rank },
			);
		}
		if (link.to === "eliminated") continue;
		const to = findHeat(bracket, link.to.heatId);
		if (!to) {
			return fail("UNKNOWN_HEAT", `Link to unknown heat "${link.to.heatId}"`, {
				heatId: link.to.heatId,
			});
		}
		if (to.roundIndex <= from.roundIndex) {
			return fail(
				"INVALID_LINK",
				`Link from heat "${link.from.heatId}" targets heat "${link.to.heatId}" which is not in a later round`,
				{ fromHeatId: link.from.heatId, toHeatId: link.to.heatId },
			);
		}
	}
	return undefined;
}

/** Links present on only one side, compared as a multiset. */
function changedLinks(previous: Link[], next: Link[]): Link[] {
	const balance = new Map<string, { link: Link; count: number }>();
	for (const [links, delta] of [
		[previous, 1],
		[next, -1],
	] as const) {
		for (const link of links) {
			const key = linkKey(link);
			const entry = balance.get(key) ?? { link, count: 0 };
			entry.count += delta;
			balance.set(key, entry);
		}
	}
	return [...balance.values()].filter((e) => e.count !== 0).map((e) => e.link);
}

export function setLinks(
	bracket: Bracket,
	links: Link[],
	confirm: boolean,
): ActionResult {
	const refused = checkLinks(bracket, links);
	if (refused) return refused;
	const changed = changedLinks(bracket.links, links);
	if (changed.length === 0) return ok(bracket);
	const judgedIds = new Set(judgedHeats(bracket).map((h) => h.id));
	const concerned = changed.filter((l) => judgedIds.has(l.from.heatId));
	const sources = new Set(concerned.map((l) => l.from.heatId));
	if (sources.size > 0 && !confirm) return destructive(sources.size);
	const updated: Bracket = { ...bracket, links };
	if (sources.size === 0) return ok(updated);
	const targets = new Set(
		concerned.flatMap((l) => (l.to === "eliminated" ? [] : [l.to.heatId])),
	);
	return ok(markForReview(updated, sources, targets));
}
