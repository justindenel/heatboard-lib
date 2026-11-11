import type { RaceTiming } from "../model";

export function raceProblem(timing: RaceTiming): string | undefined {
	const { heatDurationSec, breakSec } = timing;
	if (
		heatDurationSec !== undefined &&
		(!Number.isInteger(heatDurationSec) || heatDurationSec < 1)
	) {
		return `heatDurationSec must be an integer >= 1, got ${heatDurationSec}`;
	}
	if (breakSec !== undefined && (!Number.isInteger(breakSec) || breakSec < 0)) {
		return `breakSec must be an integer >= 0, got ${breakSec}`;
	}
	return undefined;
}
