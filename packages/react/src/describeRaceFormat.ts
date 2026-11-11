import type { RaceFormat } from "@heatboard/core";
import type { Labels } from "./labels";

/**
 * One-line summary of a race format: timing, what is counted, the method and, unless `judging` is
 * false (spectators), the judging mode. Absent parts are left out. `ran` describes a heat that
 * has been run: its duration alone, without the word "Heat" and without the break.
 */
export function describeRaceFormat(
	format: RaceFormat,
	labels: Labels,
	options: { judging?: boolean; ran?: boolean } = {},
): string {
	return describeRaceFormatParts(format, labels, options).join(" · ");
}

/** The parts of `describeRaceFormat`, before they are joined. */
export function describeRaceFormatParts(
	format: RaceFormat,
	labels: Labels,
	options: { judging?: boolean; ran?: boolean } = {},
): string[] {
	const { timing, scoring } = format;
	const words = labels.raceFormat;
	const parts: string[] = [];
	if (timing.heatDurationSec !== undefined) {
		const duration = words.duration(timing.heatDurationSec);
		parts.push(options.ran ? duration : words.heat(duration));
	}
	if (!options.ran && timing.breakSec !== undefined && timing.breakSec > 0) {
		parts.push(words.pause(words.duration(timing.breakSec)));
	}
	if (!scoring) {
		parts.push(labels.scoringMethods.manual);
	} else {
		const counted = scoring.categories
			.filter((category) => category.type.trim() !== "")
			.map((category) => words.counted(category.counted, category.type));
		if (counted.length > 0) parts.push(counted.join(" + "));
		parts.push(labels.scoringMethods[scoring.method]);
		if (options.judging !== false) {
			parts.push(words.judging[format.judgingMode]);
		}
	}
	return parts;
}
