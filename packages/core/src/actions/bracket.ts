import type { ActionResult } from "../errors";
import { replaceHeat } from "../internal/bracket";
import { fail, ok } from "../internal/result";
import type { Bracket, BracketStatus, Heat, Round, Visibility } from "../model";
import { findHeat } from "../queries";

const ALLOWED_TRANSITIONS: Record<BracketStatus, BracketStatus[]> = {
	draft: ["published"],
	published: ["draft", "running"],
	running: [],
	finished: ["validated"],
	validated: ["finished"],
};

export function setBracketStatus(
	bracket: Bracket,
	status: BracketStatus,
): ActionResult {
	const from = bracket.status;
	if (from === status) return ok(bracket);
	if (status === "finished" && (from === "running" || from === "published")) {
		return fail(
			"INVALID_STATUS_TRANSITION",
			"Bracket cannot be set to finished: it follows its heats",
			{ from, to: status, reason: "AUTOMATIC" },
		);
	}
	if (from === "finished" && status === "running") {
		return fail(
			"INVALID_STATUS_TRANSITION",
			"Bracket cannot be set to running: it follows its heats",
			{ from, to: status, reason: "AUTOMATIC" },
		);
	}
	if (!ALLOWED_TRANSITIONS[from].includes(status)) {
		return fail(
			"INVALID_STATUS_TRANSITION",
			`Bracket cannot go from ${from} to ${status}`,
			{ from, to: status },
		);
	}
	return ok({ ...bracket, status });
}

export function setVisibility(
	bracket: Bracket,
	visibility: Visibility,
): ActionResult {
	if (bracket.visibility === visibility) return ok(bracket);
	return ok({ ...bracket, visibility });
}

export function renameBracket(bracket: Bracket, name: string): ActionResult {
	if (bracket.name === name) return ok(bracket);
	return ok({ ...bracket, name });
}

export function renameRound(
	bracket: Bracket,
	roundId: string,
	name: string,
): ActionResult {
	const index = bracket.rounds.findIndex((r) => r.id === roundId);
	const round = bracket.rounds[index];
	if (!round) {
		return fail("UNKNOWN_ROUND", `Unknown round "${roundId}"`, { roundId });
	}
	if (round.name === name) return ok(bracket);
	const renamed: Round = { ...round, name };
	return ok({
		...bracket,
		rounds: bracket.rounds.map((r, i) => (i === index ? renamed : r)),
	});
}

/** An `undefined` name removes the heat name. */
export function renameHeat(
	bracket: Bracket,
	heatId: string,
	name: string | undefined,
): ActionResult {
	const found = findHeat(bracket, heatId);
	if (!found) {
		return fail("UNKNOWN_HEAT", `Unknown heat "${heatId}"`, { heatId });
	}
	if (found.heat.name === name) return ok(bracket);
	const renamed: Heat = { ...found.heat };
	if (name === undefined) delete renamed.name;
	else renamed.name = name;
	return ok(replaceHeat(bracket, found, renamed));
}
