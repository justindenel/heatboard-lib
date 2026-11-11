import type { ActionResult } from "../errors";
import { ok } from "../internal/result";
import type { Bracket, ViewerDisplay } from "../model";

export function setViewerDisplay(
	bracket: Bracket,
	changes: ViewerDisplay,
): ActionResult {
	const merged: ViewerDisplay = { ...bracket.viewerDisplay, ...changes };
	for (const key of Object.keys(merged) as Array<keyof ViewerDisplay>) {
		if (merged[key] === undefined) delete merged[key];
	}
	const same =
		JSON.stringify(Object.entries(merged).sort()) ===
		JSON.stringify(Object.entries(bracket.viewerDisplay ?? {}).sort());
	if (same) return ok(bracket);
	return ok({ ...bracket, viewerDisplay: merged });
}
