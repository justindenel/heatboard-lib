import { defaultPlan, type FormatPlan } from "./format/plan";
import type { JudgingMode, RaceTiming } from "./model";
import type { ScoringConfig } from "./scoring/model";
import { scoringPresets } from "./scoring/presets";

/** Round-1 inputs of `defaultPlan`, before the rider count is known. */
export interface TemplateFormat {
	/** Riders per heat the round-1 heats are sized for. */
	heatSize: number;
	/** Top ranks of every heat that move on. */
	advance: number;
	/** Whether a repechage follows round 1. */
	repechage: boolean;
}

export interface BracketTemplate {
	id: string;
	format: TemplateFormat;
	/** `null` is manual ranking: no judge scoring. */
	scoring: ScoringConfig | null;
	/** Judging mode the scoring needs; absent means the default. */
	judgingMode?: JudgingMode;
	/** Initial race timing of the bracket built from this template. */
	timing?: RaceTiming;
}

const heats = (
	heatSize: number,
	advance: number,
	repechage = false,
): TemplateFormat => ({ heatSize, advance, repechage });

export const bracketTemplates: BracketTemplate[] = [
	{
		id: "windsurfWave",
		format: heats(4, 2, true),
		scoring: scoringPresets.windsurfWave,
		timing: { heatDurationSec: 600, breakSec: 120 },
	},
	{
		id: "windsurfFreestyle",
		format: heats(4, 2),
		scoring: scoringPresets.windsurfFreestyle,
		timing: { heatDurationSec: 480, breakSec: 120 },
	},
	{
		id: "surf",
		format: heats(4, 2),
		scoring: scoringPresets.surf,
		judgingMode: "headJudge",
		timing: { heatDurationSec: 1200, breakSec: 180 },
	},
	{
		id: "kiteFreestyle",
		format: heats(4, 2),
		scoring: scoringPresets.kiteFreestyle,
		timing: { heatDurationSec: 480, breakSec: 120 },
	},
	{
		id: "slalom",
		format: heats(8, 4),
		scoring: null,
		timing: { breakSec: 300 },
	},
	{ id: "custom", format: heats(4, 2), scoring: null },
];

/** Default plan of a template for a rider count: round 1 has as many heats as the heat size needs. */
export function templatePlan(
	template: BracketTemplate,
	riders: number,
): FormatPlan {
	const { heatSize, advance, repechage } = template.format;
	return defaultPlan({
		riders,
		heats: Math.max(1, Math.ceil(riders / heatSize)),
		advance,
		repechage,
	});
}
