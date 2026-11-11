import type { ActionResult } from "../errors";
import { mapHeats, replaceHeat } from "../internal/bracket";
import { withChain } from "../internal/chain";
import { fail, ok } from "../internal/result";
import { isIsoDate } from "../internal/time";
import type { Bracket, Heat, HeatStatus } from "../model";
import {
	currentRaceFormat,
	findHeat,
	raceFormatOf,
	type FoundHeat,
} from "../queries";
import { placeQualifiers, withdrawQualifiers } from "./qualifiers";

const ALLOWED_TRANSITIONS: Record<HeatStatus, HeatStatus[]> = {
	pending: ["running"],
	running: ["pending", "judged"],
	judged: ["running", "locked"],
	locked: ["judged"],
};

/** First later heat that holds one of the heat's riders and has already started. */
function startedDownstream(
	bracket: Bracket,
	found: FoundHeat,
): Heat | undefined {
	const riderIds = new Set(found.heat.slots.map((s) => s.riderId));
	for (const round of bracket.rounds.slice(found.roundIndex + 1)) {
		const blocking = round.heats.find(
			(heat) =>
				heat.status !== "pending" &&
				heat.slots.some((s) => riderIds.has(s.riderId)),
		);
		if (blocking) return blocking;
	}
	return undefined;
}

/** A start ends the break that led to it; stopping a timed heat by hand halts the chain, so it never restarts that heat by itself. */
function chainAfterStatusChange(
	bracket: Bracket,
	found: FoundHeat,
	from: HeatStatus,
	to: HeatStatus,
): Bracket {
	const chain = bracket.chain ?? {};
	if (from === "pending" && to === "running") {
		const { pause } = chain;
		return withChain(bracket, pause === undefined ? {} : { pause });
	}
	if (
		from === "running" &&
		to === "pending" &&
		raceFormatOf(bracket, found.heat).timing.heatDurationSec !== undefined
	) {
		return withChain(bracket, { pause: "paused" });
	}
	return bracket;
}

export function setHeatStatus(
	bracket: Bracket,
	heatId: string,
	status: HeatStatus,
	at?: string,
): ActionResult {
	const found = findHeat(bracket, heatId);
	if (!found) {
		return fail("UNKNOWN_HEAT", `Unknown heat "${heatId}"`, { heatId });
	}
	const from = found.heat.status;
	if (from === status) return ok(bracket);
	if (!ALLOWED_TRANSITIONS[from].includes(status)) {
		return fail(
			"INVALID_STATUS_TRANSITION",
			`Heat "${heatId}" cannot go from ${from} to ${status}`,
			{ heatId, from, to: status },
		);
	}
	if (at !== undefined && !isIsoDate(at)) {
		return fail("INVALID_ARGUMENT", `"${at}" is not an ISO date`, { at });
	}
	if (status === "running" && bracket.status === "draft") {
		return fail(
			"BRACKET_NOT_PUBLISHED",
			`Heat "${heatId}" cannot start: the bracket is a draft`,
			{ heatId },
		);
	}
	if (status === "running" && from === "pending" && !found.heat.slots.length) {
		return fail(
			"HEAT_EMPTY",
			`Heat "${heatId}" cannot start: no rider is known yet`,
			{ heatId },
		);
	}
	if (status === "judged") {
		const unranked = found.heat.slots.find(
			(s) => s.status === undefined && s.rank === null,
		);
		if (unranked) {
			return fail(
				"HEAT_NOT_RANKED",
				`Heat "${heatId}" cannot be judged: rider "${unranked.riderId}" has no rank or status`,
				{ heatId, riderId: unranked.riderId },
			);
		}
	}
	if (from === "running" && status === "pending") {
		const ranked = found.heat.slots.find((s) => s.rank !== null);
		if (ranked) {
			return fail(
				"HEAT_HAS_RANKS",
				`Heat "${heatId}" cannot go back to pending: rider "${ranked.riderId}" is ranked`,
				{ heatId, riderId: ranked.riderId },
			);
		}
	}
	const reopens =
		(from === "locked" && status === "judged") ||
		(from === "judged" && status === "running");
	if (reopens) {
		const blocking = startedDownstream(bracket, found);
		if (blocking) {
			return fail(
				"DOWNSTREAM_STARTED",
				`Heat "${heatId}" cannot be reopened: heat "${blocking.id}" of a later round has started`,
				{ heatId, blockingHeatId: blocking.id },
			);
		}
	}
	const riderIds = new Set(found.heat.slots.map((s) => s.riderId));
	const updated: Heat = { ...found.heat, status };
	if (status !== "running") delete updated.order;
	if (from === "pending" && at !== undefined) updated.startedAt = at;
	if (from === "running" && status === "judged") {
		// Only a heat that is running without a snapshot (it predates snapshots) is filled in here.
		const current = currentRaceFormat(bracket);
		updated.timing ??= current.timing;
		updated.judgingMode ??= current.judgingMode;
		if (current.scoring) updated.scoring ??= current.scoring;
	}
	if (from === "pending" && status === "running") {
		const current = currentRaceFormat(bracket);
		updated.timing = current.timing;
		updated.judgingMode = current.judgingMode;
		if (current.scoring) updated.scoring = current.scoring;
	}
	if (from === "pending" && status === "running") delete updated.endedAt;
	if (status === "pending") {
		delete updated.endedAt;
		delete updated.startedAt;
		delete updated.penalties;
		delete updated.scoring;
		delete updated.timing;
		delete updated.judgingMode;
	}
	const withdrawing = from === "judged" && status === "running";
	const source = withdrawing ? withdrawQualifiers(bracket, heatId) : bracket;
	const started: Bracket =
		status === "running" &&
		(source.status === "published" || source.status === "finished")
			? { ...source, status: "running" }
			: source;
	const base = chainAfterStatusChange(started, found, from, status);
	const next = mapHeats(base, (heat, _round, roundIndex, heatIndex) => {
		if (roundIndex === found.roundIndex && heatIndex === found.heatIndex) {
			return updated;
		}
		if (!reopens || roundIndex <= found.roundIndex || heat.needsReview) {
			return heat;
		}
		const affected = heat.slots.some((s) => riderIds.has(s.riderId));
		return affected ? { ...heat, needsReview: true } : heat;
	});
	return from === "running" && status === "judged"
		? placeQualifiers(next, heatId)
		: ok(next);
}

export function clearReview(bracket: Bracket, heatId: string): ActionResult {
	const found = findHeat(bracket, heatId);
	if (!found) {
		return fail("UNKNOWN_HEAT", `Unknown heat "${heatId}"`, { heatId });
	}
	if (!found.heat.needsReview) return ok(bracket);
	const cleared: Heat = { ...found.heat };
	delete cleared.needsReview;
	return ok(replaceHeat(bracket, found, cleared));
}
