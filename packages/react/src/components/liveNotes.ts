import {
	viewerHeatResult,
	scoringOf,
	type Bracket,
	type Heat,
	type HeatStatus,
	type ViewerHeatResult,
} from "@heatboard/core";
import type { BoardSettings } from "./settings";

const LIVE_STATUSES: ReadonlySet<HeatStatus> = new Set([
	"running",
	"judged",
	"locked",
]);

type ResultSource = Pick<
	BoardSettings,
	"mode" | "getHeatData" | "getHeatResult"
>;

/**
 * Display result of a started heat. A host-computed result (`getHeatResult`) is used as is: what it
 * lacks is not shown. Otherwise the result is computed from the host's raw notes, in full for an
 * admin and cut down to the bracket's viewer settings for a viewer.
 */
export function heatResult(
	bracket: Bracket,
	heat: Heat,
	source: ResultSource,
): ViewerHeatResult | undefined {
	if (!scoringOf(bracket, heat) || !LIVE_STATUSES.has(heat.status)) return;
	if (source.getHeatResult) return source.getHeatResult(heat.id);
	const data = source.getHeatData?.(heat.id);
	if (!data) return;
	return viewerHeatResult(
		bracket,
		heat.id,
		data,
		source.mode === "admin" ? "all" : undefined,
	);
}

/** True when the heat has started and the host has something to show for it. */
export function hasLiveNotes(
	bracket: Bracket,
	heat: Heat,
	source: ResultSource,
): boolean {
	return heatResult(bracket, heat, source) !== undefined;
}
