import type { ActionResult } from "../errors";
import type { Bracket } from "../model";
import { fail } from "./result";

/** A stored format owns the structure of the rounds: manual edits would leave it describing another bracket. */
export function formatLocked(
	bracket: Bracket,
	type: string,
): ActionResult | undefined {
	if (!bracket.format) return undefined;
	return fail(
		"FORMAT_LOCKED",
		`Action "${type}" is not allowed: the structure follows the stored format, change the rounds in the format editor`,
		{ type },
	);
}
