import type { FormatRound, FormatSettings } from "./model";

function definedOnly(record: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(record).filter(([, value]) => value !== undefined),
	);
}

function orderedRound(round: FormatRound): Record<string, unknown> {
	return definedOnly({
		key: round.key,
		name: round.name,
		group: round.group,
		heats: round.heats,
		outcomes: round.outcomes?.map((o) => ({ ranks: [...o.ranks], to: o.to })),
		optional: round.optional,
		placement: round.placement,
		seedSlots: round.seedSlots,
	});
}

/** Indented JSON with a stable key order; rank ranges stay on one line. */
export function exportFormat(format: FormatSettings): string {
	const json = definedOnly({
		heatboardFormat: format.heatboardFormat,
		name: format.name,
		description: format.description,
		fill: format.fill,
		rounds: format.rounds.map(orderedRound),
	});
	return JSON.stringify(json, null, 2).replace(
		/\[\s+(\d+),\s+(\d+)\s+\]/g,
		"[$1, $2]",
	);
}
