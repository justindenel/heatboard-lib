import type { ActionResult, BracketError, BracketErrorCode } from "../errors";
import type { Bracket } from "../model";

export function ok(bracket: Bracket): ActionResult {
	return { ok: true, bracket };
}

export function makeError(
	code: BracketErrorCode,
	message: string,
	details?: BracketError["details"],
): BracketError {
	return details ? { code, message, details } : { code, message };
}

export function fail(
	code: BracketErrorCode,
	message: string,
	details?: BracketError["details"],
): ActionResult {
	return { ok: false, error: makeError(code, message, details) };
}
