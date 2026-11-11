import type { ActionResult } from "../errors";
import { buildFromFormat } from "../format/build";
import { hasDoubleElimination } from "../format/double";
import { editorStateProblem } from "../format/editor";
import type { FormatEditorState, FormatSettings } from "../format/model";
import { parseFormat } from "../format/parse";
import { rideMeansProblem } from "../internal/judging";
import { fail, ok } from "../internal/result";
import type { Bracket } from "../model";

/**
 * Upper bound on rounds a single format change may create and remove, so a host can commit them
 * in one bounded transaction.
 */
const MAX_FORMAT_CHANGED_ROUNDS = 97;

/** Replaces rounds, links and the placement of entering riders with what the format generates. */
export function applyFormat(
	bracket: Bracket,
	format: FormatSettings,
	drawSeed: number,
	editor?: FormatEditorState,
): ActionResult {
	if (!Number.isInteger(drawSeed)) {
		return fail(
			"INVALID_ARGUMENT",
			`Draw seed must be an integer, got ${drawSeed}`,
			{ drawSeed },
		);
	}
	if (editor !== undefined) {
		const problem = editorStateProblem(editor);
		if (problem) return fail("INVALID_ARGUMENT", problem, { field: "editor" });
	}
	const started = bracket.rounds
		.flatMap((r) => r.heats)
		.find((h) => h.status !== "pending");
	if (started) {
		return fail(
			"ROUND_STARTED",
			`Heat "${started.id}" has started, the format can no longer change`,
			{ heatId: started.id },
		);
	}
	const parsed = parseFormat(format);
	if (!parsed.ok) {
		const first = parsed.errors[0];
		return fail(
			"INVALID_FORMAT",
			`Invalid format at "${first?.path ?? ""}": ${first?.message ?? ""}`,
			{ path: first?.path ?? "" },
		);
	}
	// A double side opened by action is not in the stored format: rebuilding would erase it silently.
	if (hasDoubleElimination(bracket) && !hasDoubleElimination(parsed.format)) {
		return fail(
			"DOUBLE_OPEN",
			"The double elimination is open: close it before applying a format",
			{ reason: "APPLY_FORMAT" },
		);
	}
	const built = buildFromFormat(
		bracket,
		parsed.format,
		drawSeed,
		editor?.riders,
	);
	if (!built.ok) {
		return fail(
			"UNKNOWN_ROUND",
			`Rider "${built.riderId}" has entry round "${built.entryRoundId}" which is not in the format`,
			{ riderId: built.riderId, roundId: built.entryRoundId },
		);
	}
	const keptIds = new Set(built.rounds.map((r) => r.id));
	const removed = bracket.rounds.filter((r) => !keptIds.has(r.id)).length;
	const changed = built.rounds.length + removed;
	if (changed > MAX_FORMAT_CHANGED_ROUNDS) {
		return fail(
			"ROUND_LIMIT",
			`A format change can create and remove at most ${MAX_FORMAT_CHANGED_ROUNDS} rounds in total, this one needs ${changed}`,
			{ count: changed, max: MAX_FORMAT_CHANGED_ROUNDS },
		);
	}
	const next: Bracket = {
		...bracket,
		rounds: built.rounds,
		links: built.links,
		format: { settings: parsed.format, drawSeed, ...(editor && { editor }) },
	};
	const unsupported = rideMeansProblem(next);
	if (unsupported) {
		return fail("INVALID_SCORING", unsupported.message, { field: "method" });
	}
	return ok(next);
}
