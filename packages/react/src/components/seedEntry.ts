import type { Bracket } from "@heatboard/core";

/**
 * Whether the rider sits in `roundId` as a seed that joins it directly: the format gives that
 * round seed places, the rider has no entry round of their own and no earlier round holds them.
 */
export function isSeedEntry(
	bracket: Bracket,
	roundId: string,
	riderId: string,
): boolean {
	const roundIndex = bracket.rounds.findIndex((r) => r.id === roundId);
	if (roundIndex < 1) return false;
	const places = bracket.format?.settings.rounds.find(
		(r) => r.key === roundId,
	)?.seedSlots;
	if (!places) return false;
	const entry = bracket.entries.find((e) => e.riderId === riderId);
	if (!entry || entry.entryRoundId !== undefined) return false;
	return !bracket.rounds
		.slice(0, roundIndex)
		.some((r) =>
			r.heats.some((h) => h.slots.some((s) => s.riderId === riderId)),
		);
}
