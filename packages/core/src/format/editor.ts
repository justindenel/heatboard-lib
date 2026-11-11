import type { FormatEditorState } from "./model";
import { MAX_FORMAT_ROUNDS } from "./parse";

const MAX_RIDERS = 100000;

/** First problem of untrusted editor state, or undefined; only its shape is checked. */
export function editorStateProblem(editor: unknown): string | undefined {
	if (typeof editor !== "object" || editor === null || Array.isArray(editor)) {
		return "Editor state must be an object";
	}
	const { riders, rounds } = editor as Partial<FormatEditorState>;
	if (
		!Number.isInteger(riders) ||
		(riders as number) < 0 ||
		(riders as number) > MAX_RIDERS
	) {
		return `Editor riders must be an integer between 0 and ${MAX_RIDERS}`;
	}
	if (!Array.isArray(rounds) || rounds.length > MAX_FORMAT_ROUNDS) {
		return `Editor rounds must be an array of at most ${MAX_FORMAT_ROUNDS}`;
	}
	for (const round of rounds as unknown[]) {
		if (typeof round !== "object" || round === null) {
			return "Each editor round must be an object";
		}
		const { auto, repechageAuto } = round as Record<string, unknown>;
		if (typeof auto !== "boolean") {
			return "Editor round auto must be a boolean";
		}
		if (repechageAuto !== undefined && typeof repechageAuto !== "boolean") {
			return "Editor round repechageAuto must be a boolean";
		}
	}
	return undefined;
}
