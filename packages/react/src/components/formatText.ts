import type { FormatSettings, FormatWarning } from "@heatboard/core";
import type { Labels } from "../labels";

export function roundName(format: FormatSettings, key: string): string {
	return format.rounds.find((r) => r.key === key)?.name ?? key;
}

/** `r1-2` is the second heat of round `r1`; its number counts the heats of the rounds before, as the built bracket does. */
function heatName(format: FormatSettings, labels: Labels, heatId: string) {
	const cut = heatId.lastIndexOf("-");
	const key = heatId.slice(0, cut);
	const before = format.rounds
		.slice(
			0,
			Math.max(
				0,
				format.rounds.findIndex((round) => round.key === key),
			),
		)
		.reduce((total, round) => total + round.heats, 0);
	return `${roundName(format, key)}, ${labels.heatTitle(before + Number(heatId.slice(cut + 1)))}`;
}

export function warningText(
	format: FormatSettings,
	labels: Labels,
	warning: FormatWarning,
): string {
	return warning.code === "REMATCH"
		? labels.formatWarningRematch(
				heatName(format, labels, warning.heatId),
				heatName(format, labels, warning.sourceHeatId),
			)
		: labels.formatWarningTooManyHeats(
				roundName(format, warning.roundId),
				warning.riders,
				warning.heats,
			);
}
