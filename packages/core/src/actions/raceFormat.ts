import type { ActionResult } from "../errors";
import { mapHeats } from "../internal/bracket";
import { deepEqual } from "../internal/equal";
import { rideMeansProblem } from "../internal/judging";
import { raceProblem } from "../internal/race";
import { fail, ok } from "../internal/result";
import type { Bracket, JudgingMode, RaceTiming } from "../model";
import { currentRaceFormat } from "../queries";
import type { ScoringConfig } from "../scoring/model";
import { scoringProblem } from "../scoring/validate";

export interface RaceFormatChanges {
	/** Replaces the whole race timing; an empty object clears it. */
	timing?: RaceTiming;
	/** `null` goes back to manual ranking. */
	scoring?: ScoringConfig | null;
	judgingMode?: JudgingMode;
}

/** Started heats without a snapshot (older data) keep the format in force until now. */
function freezeStartedHeats(bracket: Bracket): Bracket {
	const current = currentRaceFormat(bracket);
	return mapHeats(bracket, (heat) => {
		if (heat.status === "pending") return heat;
		if (
			heat.timing !== undefined &&
			heat.judgingMode !== undefined &&
			(heat.scoring !== undefined || bracket.scoring === undefined)
		) {
			return heat;
		}
		const frozen = { ...heat };
		frozen.timing ??= current.timing;
		frozen.judgingMode ??= current.judgingMode;
		if (current.scoring) frozen.scoring ??= current.scoring;
		return frozen;
	});
}

/** Never blocked by heats that ran or are running: it only applies to heats that start afterwards. */
export function setRaceFormat(
	bracket: Bracket,
	changes: RaceFormatChanges,
): ActionResult {
	const { timing, scoring, judgingMode } = changes;
	if (timing !== undefined) {
		const problem = raceProblem(timing);
		if (problem) return fail("INVALID_ARGUMENT", problem, { field: "timing" });
	}
	if (
		judgingMode !== undefined &&
		judgingMode !== "free" &&
		judgingMode !== "headJudge"
	) {
		return fail(
			"INVALID_ARGUMENT",
			`Unknown judging mode "${String(judgingMode)}"`,
			{ mode: String(judgingMode) },
		);
	}
	if (scoring) {
		const problem = scoringProblem(scoring);
		if (problem) {
			return fail("INVALID_SCORING", problem.message, { field: problem.field });
		}
	}

	const next: Bracket = { ...freezeStartedHeats(bracket) };
	if (timing !== undefined) {
		const cleaned: RaceTiming = {};
		if (timing.heatDurationSec !== undefined) {
			cleaned.heatDurationSec = timing.heatDurationSec;
		}
		if (timing.breakSec !== undefined) cleaned.breakSec = timing.breakSec;
		if (Object.keys(cleaned).length === 0) delete next.timing;
		else next.timing = cleaned;
	}
	if (scoring === null) delete next.scoring;
	else if (scoring !== undefined) next.scoring = scoring;
	if (judgingMode === "free") delete next.judgingMode;
	else if (judgingMode !== undefined) next.judgingMode = judgingMode;

	const unsupported = rideMeansProblem(next);
	if (unsupported) {
		return fail("INVALID_SCORING", unsupported.message, { field: "method" });
	}
	const unchanged =
		deepEqual(next.timing, bracket.timing) &&
		deepEqual(next.scoring, bracket.scoring) &&
		(next.judgingMode ?? "free") === (bracket.judgingMode ?? "free");
	return unchanged ? ok(bracket) : ok(next);
}
