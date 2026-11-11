import type { ActionResult } from "../errors";
import { isStarted, roundStarted } from "../internal/bracket";
import { formatLocked } from "../internal/format";
import { fail, ok } from "../internal/result";
import type { Bracket, Heat, Link, Round } from "../model";
import { findHeat } from "../queries";
import { checkIndex, insertAt } from "./composition";
import { destructive, judgedHeats, markForReview } from "./review";

export interface NewRound {
	id: string;
	name: string;
	group: string;
	maxPerHeat: number;
	advancing: number;
}

/** Drops the links touching the removed heats; judged sources need confirmation and flag their other targets. */
function dropHeatLinks(
	bracket: Bracket,
	heatIds: Set<string>,
	confirm: boolean,
): ActionResult {
	const touches = (l: Link) =>
		heatIds.has(l.from.heatId) ||
		(l.to !== "eliminated" && heatIds.has(l.to.heatId));
	const dropped = bracket.links.filter(touches);
	if (dropped.length === 0) return ok(bracket);
	const judgedIds = new Set(judgedHeats(bracket).map((h) => h.id));
	const concerned = dropped.filter((l) => judgedIds.has(l.from.heatId));
	const sources = new Set(concerned.map((l) => l.from.heatId));
	if (sources.size > 0 && !confirm) return destructive(sources.size);
	const withoutLinks: Bracket = {
		...bracket,
		links: bracket.links.filter((l) => !touches(l)),
	};
	if (sources.size === 0) return ok(withoutLinks);
	const targets = new Set(
		concerned.flatMap((l) => (l.to === "eliminated" ? [] : [l.to.heatId])),
	);
	return ok(markForReview(withoutLinks, sources, targets));
}

export function addRound(
	bracket: Bracket,
	round: NewRound,
	index: number | undefined,
): ActionResult {
	const locked = formatLocked(bracket, "addRound");
	if (locked) return locked;
	if (bracket.rounds.some((r) => r.id === round.id)) {
		return fail("DUPLICATE_ID", `Duplicate round id "${round.id}"`, {
			id: round.id,
		});
	}
	if (!Number.isInteger(round.maxPerHeat) || round.maxPerHeat < 1) {
		return fail(
			"INVALID_MAX",
			`Max per heat must be an integer >= 1, got ${round.maxPerHeat}`,
			{ roundId: round.id, max: round.maxPerHeat },
		);
	}
	if (!Number.isInteger(round.advancing) || round.advancing < 1) {
		return fail(
			"INVALID_ARGUMENT",
			`advancing must be an integer >= 1, got ${round.advancing}`,
			{ roundId: round.id, advancing: round.advancing },
		);
	}
	const refused = checkIndex(index, bracket.rounds.length);
	if (refused) return refused;
	const lastStarted = bracket.rounds.findLastIndex(roundStarted);
	if (index !== undefined && index <= lastStarted) {
		return fail(
			"ROUND_STARTED",
			`Round "${round.id}" cannot be inserted at ${index}: round "${bracket.rounds[lastStarted]?.id ?? ""}" has started`,
			{ roundId: bracket.rounds[lastStarted]?.id ?? "", index },
		);
	}
	if (
		bracket.scoring?.method === "rideMeans" &&
		(bracket.judgingMode ?? "free") !== "headJudge"
	) {
		return fail(
			"INVALID_SCORING",
			`Scoring method "rideMeans" requires head-judge mode, but round "${round.id}" would be in free mode`,
			{ field: "method", roundId: round.id },
		);
	}
	const created: Round = {
		id: round.id,
		name: round.name,
		group: round.group,
		maxPerHeat: round.maxPerHeat,
		advancing: round.advancing,
		heats: [],
	};
	return ok({ ...bracket, rounds: insertAt(bracket.rounds, created, index) });
}

export function removeRound(
	bracket: Bracket,
	roundId: string,
	confirm: boolean,
): ActionResult {
	const locked = formatLocked(bracket, "removeRound");
	if (locked) return locked;
	const round = bracket.rounds.find((r) => r.id === roundId);
	if (!round) {
		return fail("UNKNOWN_ROUND", `Unknown round "${roundId}"`, { roundId });
	}
	if (roundStarted(round)) {
		return fail("ROUND_STARTED", `Round "${roundId}" has started`, {
			roundId,
		});
	}
	const referencing = bracket.entries.find((e) => e.entryRoundId === roundId);
	if (referencing) {
		return fail(
			"ROUND_REFERENCED",
			`Round "${roundId}" is the entry round of rider "${referencing.riderId}"`,
			{ roundId, riderId: referencing.riderId },
		);
	}
	const remaining: Bracket = {
		...bracket,
		rounds: bracket.rounds.filter((r) => r !== round),
	};
	return dropHeatLinks(
		remaining,
		new Set(round.heats.map((h) => h.id)),
		confirm,
	);
}

export function addHeat(
	bracket: Bracket,
	roundId: string,
	heat: { id: string; name?: string },
	index: number | undefined,
): ActionResult {
	const locked = formatLocked(bracket, "addHeat");
	if (locked) return locked;
	const roundIndex = bracket.rounds.findIndex((r) => r.id === roundId);
	const round = bracket.rounds[roundIndex];
	if (!round) {
		return fail("UNKNOWN_ROUND", `Unknown round "${roundId}"`, { roundId });
	}
	if (findHeat(bracket, heat.id)) {
		return fail("DUPLICATE_ID", `Duplicate heat id "${heat.id}"`, {
			id: heat.id,
		});
	}
	const refused = checkIndex(index, round.heats.length);
	if (refused) return refused;
	const created: Heat = { id: heat.id, status: "pending", slots: [] };
	if (heat.name !== undefined) created.name = heat.name;
	const updated: Round = {
		...round,
		heats: insertAt(round.heats, created, index),
	};
	return ok({
		...bracket,
		rounds: bracket.rounds.map((r, i) => (i === roundIndex ? updated : r)),
	});
}

export function removeHeat(
	bracket: Bracket,
	heatId: string,
	confirm: boolean,
): ActionResult {
	const locked = formatLocked(bracket, "removeHeat");
	if (locked) return locked;
	const found = findHeat(bracket, heatId);
	if (!found) {
		return fail("UNKNOWN_HEAT", `Unknown heat "${heatId}"`, { heatId });
	}
	if (isStarted(found.heat)) {
		return fail("HEAT_STARTED", `Heat "${heatId}" has started`, { heatId });
	}
	const updated: Round = {
		...found.round,
		heats: found.round.heats.filter((h) => h !== found.heat),
	};
	const remaining: Bracket = {
		...bracket,
		rounds: bracket.rounds.map((r, i) =>
			i === found.roundIndex ? updated : r,
		),
	};
	return dropHeatLinks(remaining, new Set([heatId]), confirm);
}
