import type { Bracket } from "../model";

/** `rideMeans` scoring needs the head judge to enter the shared ride scores. */
export function rideMeansProblem(
	bracket: Bracket,
): { message: string } | undefined {
	if (bracket.scoring?.method !== "rideMeans") return undefined;
	if ((bracket.judgingMode ?? "free") === "headJudge") return undefined;
	return {
		message:
			'Scoring method "rideMeans" requires head-judge mode, but the bracket is in free mode',
	};
}
