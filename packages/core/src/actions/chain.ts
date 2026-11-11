import type { ActionResult } from "../errors";
import { withChain } from "../internal/chain";
import { fail, ok } from "../internal/result";
import { isIsoDate } from "../internal/time";
import { settleChain, timerRunningAt } from "../lifecycle/chain";
import type { Bracket } from "../model";
import { raceFormatOf } from "../queries";

function invalidAt(at: string): ActionResult {
	return fail("INVALID_ARGUMENT", `"${at}" is not an ISO date`, { at });
}

/** Without a clock (optimistic local apply), a running heat is one that has a timer and no end stamped yet. */
function timedHeatRunning(bracket: Bracket): boolean {
	return bracket.rounds.some((round) =>
		round.heats.some(
			(heat) =>
				heat.status === "running" &&
				heat.endedAt === undefined &&
				raceFormatOf(bracket, heat).timing.heatDurationSec !== undefined,
		),
	);
}

/**
 * Stops the chain without cancelling any heat. While a timed heat runs it goes on to the end of its
 * timer and the chain stops after it; otherwise the chain stops now, dropping a break under way.
 */
export function pauseRace(bracket: Bracket, at?: string): ActionResult {
	if (at !== undefined && !isIsoDate(at)) return invalidAt(at);
	const settled = at === undefined ? bracket : settleChain(bracket, at);
	if (settled.chain?.pause !== undefined) return ok(settled);
	const running =
		at === undefined ? timedHeatRunning(settled) : timerRunningAt(settled, at);
	return ok(withChain(settled, { pause: running ? "requested" : "paused" }));
}

/** Undoes a pause requested during a heat; anything else is left as is. */
export function cancelPauseRequest(bracket: Bracket): ActionResult {
	if (bracket.chain?.pause !== "requested") return ok(bracket);
	return ok(withChain(bracket, {}));
}

/** Restarts the chain with a full break before the next heat, whatever time the pause lasted. */
export function resumeRace(bracket: Bracket, at?: string): ActionResult {
	if (at !== undefined && !isIsoDate(at)) return invalidAt(at);
	const settled = at === undefined ? bracket : settleChain(bracket, at);
	if (settled.chain?.pause !== "paused") return ok(settled);
	// Without a clock the break is left to the server, which stamps it.
	return ok(
		withChain(
			settled,
			at === undefined
				? {}
				: {
						break: {
							startedAt: at,
							durationSec: settled.timing?.breakSec ?? 0,
						},
					},
		),
	);
}
