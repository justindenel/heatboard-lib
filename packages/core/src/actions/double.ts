import type { ActionResult } from "../errors";
import { buildFromFormat } from "../format/build";
import {
	DOUBLE_GROUP,
	generateDoubleElimination,
	hasDoubleElimination,
	removeDoubleElimination,
	type DoubleFinalMode,
} from "../format/double";
import type { FormatSettings } from "../format/model";
import { formatNamesOfDouble, type DoubleRoundNames } from "../format/names";
import {
	replaceHeat,
	requiredHeatsJudged,
	roundHasRider,
} from "../internal/bracket";
import { rideMeansProblem } from "../internal/judging";
import { fail, ok } from "../internal/result";
import type { Bracket, Link } from "../model";
import { findHeat } from "../queries";
import { checkComposable, checkEntryRound, checkRoom } from "./composition";

const linkKey = (link: Link) => `${link.from.heatId}#${link.from.rank}`;

/** The stored format describes the rounds and heats the bracket has, so that it can be trusted. */
function formatMatches(bracket: Bracket, settings: FormatSettings): boolean {
	return (
		settings.rounds.length === bracket.rounds.length &&
		settings.rounds.every((fr, i) => {
			const round = bracket.rounds[i];
			return round?.id === fr.key && round.heats.length === fr.heats;
		})
	);
}

function unavailable(reason: string, message: string): ActionResult {
	return fail("DOUBLE_UNAVAILABLE", message, { reason });
}

/**
 * Adds the double side generated from the stored format (rounds, heats and links
 * only): existing rounds, heats, results and manual placements are untouched, the
 * eliminated riders of judged heats are placed in the new heats right away and
 * the others follow when their heat is judged, through the links.
 */
export function openDoubleElimination(
	bracket: Bracket,
	mode: DoubleFinalMode,
	superFinal: boolean,
	names?: DoubleRoundNames,
): ActionResult {
	if (mode !== "duels" && mode !== "heats") {
		return fail(
			"INVALID_ARGUMENT",
			`mode must be "duels" or "heats", got ${String(mode)}`,
			{ mode: String(mode) },
		);
	}
	if (hasDoubleElimination(bracket)) {
		return fail("DOUBLE_OPEN", "The double elimination is already open");
	}
	const stored = bracket.format;
	if (!stored) {
		return unavailable("NO_FORMAT", "The bracket has no stored format");
	}
	if (!formatMatches(bracket, stored.settings)) {
		return unavailable(
			"FORMAT_MISMATCH",
			"The rounds no longer match the stored format",
		);
	}
	const planned = buildFromFormat(
		bracket,
		stored.settings,
		stored.drawSeed,
		stored.editor?.riders,
	);
	if (!planned.ok) {
		return fail(
			"UNKNOWN_ROUND",
			`Rider "${planned.riderId}" has entry round "${planned.entryRoundId}" which is not in the format`,
			{ riderId: planned.riderId, roundId: planned.entryRoundId },
		);
	}
	const generated = generateDoubleElimination(
		stored.settings,
		{ finalMode: mode, superFinal, sizes: planned.sizes },
		formatNamesOfDouble(names),
	);
	if (!generated.ok) {
		return unavailable(
			generated.code,
			`The double elimination cannot be generated: ${generated.code}`,
		);
	}
	if (!requiredHeatsJudged(bracket.rounds)) {
		return unavailable(
			"TABLE_NOT_FINISHED",
			"The double elimination opens once every heat of the first table is judged",
		);
	}
	const built = buildFromFormat(
		bracket,
		generated.format,
		stored.drawSeed,
		stored.editor?.riders,
	);
	if (!built.ok) {
		return fail(
			"UNKNOWN_ROUND",
			`Rider "${built.riderId}" has entry round "${built.entryRoundId}" which is not in the format`,
			{ riderId: built.riderId, roundId: built.entryRoundId },
		);
	}

	const added = built.rounds.filter((r) => r.group === DOUBLE_GROUP);
	const addedHeatIds = new Set(added.flatMap((r) => r.heats.map((h) => h.id)));
	const existing = new Map(bracket.links.map((l) => [linkKey(l), l]));
	const toDouble = (l: Link) =>
		l.to !== "eliminated" && addedHeatIds.has(l.to.heatId);

	// Links of the single side change only where they led nowhere ("eliminated").
	const rerouted = built.links.filter((l) => {
		if (!toDouble(l) || addedHeatIds.has(l.from.heatId)) return false;
		const before = existing.get(linkKey(l));
		return before === undefined || before.to === "eliminated";
	});
	const reroutedByKey = new Map(rerouted.map((l) => [linkKey(l), l]));
	const fromDouble = built.links.filter((l) => addedHeatIds.has(l.from.heatId));
	const links: Link[] = [
		...bracket.links.map((l) => reroutedByKey.get(linkKey(l)) ?? l),
		...rerouted.filter((l) => !existing.has(linkKey(l))),
		...fromDouble,
	];

	let current: Bracket = {
		...bracket,
		rounds: [...bracket.rounds, ...added],
		links,
	};
	for (const link of rerouted) {
		const source = findHeat(current, link.from.heatId);
		const target =
			link.to === "eliminated" ? undefined : findHeat(current, link.to.heatId);
		if (!source || !target) continue;
		if (source.heat.status !== "judged" && source.heat.status !== "locked") {
			continue;
		}
		const slot = source.heat.slots.find(
			(s) => s.rank === link.from.rank && s.status === undefined,
		);
		if (!slot || roundHasRider(target.round, slot.riderId)) continue;
		const refused =
			checkEntryRound(current, slot.riderId, target) ??
			checkComposable(target) ??
			checkRoom(slot.riderId, target);
		if (refused) return refused;
		current = replaceHeat(current, target, {
			...target.heat,
			slots: [...target.heat.slots, { riderId: slot.riderId, rank: null }],
		});
	}

	const unsupported = rideMeansProblem(current);
	if (unsupported) {
		return fail("INVALID_SCORING", unsupported.message, { field: "method" });
	}
	return ok(current);
}

/** Removes the double side while none of its heats has started; the single side gets its "eliminated" links back. */
export function closeDoubleElimination(bracket: Bracket): ActionResult {
	if (!hasDoubleElimination(bracket)) {
		return fail("DOUBLE_NOT_OPEN", "There is no double elimination to close");
	}
	const doubleRounds = bracket.rounds.filter((r) => r.group === DOUBLE_GROUP);
	const started = doubleRounds
		.flatMap((r) => r.heats)
		.find((h) => h.status !== "pending");
	if (started) {
		return fail(
			"DOUBLE_STARTED",
			`Heat "${started.id}" of the double elimination has started`,
			{ heatId: started.id },
		);
	}
	const roundIds = new Set(doubleRounds.map((r) => r.id));
	const referencing = bracket.entries.find(
		(e) => e.entryRoundId !== undefined && roundIds.has(e.entryRoundId),
	);
	if (referencing) {
		return fail(
			"ROUND_REFERENCED",
			`A round of the double elimination is the entry round of rider "${referencing.riderId}"`,
			{
				roundId: referencing.entryRoundId ?? "",
				riderId: referencing.riderId,
			},
		);
	}
	const heatIds = new Set(
		doubleRounds.flatMap((r) => r.heats.map((h) => h.id)),
	);
	const links = bracket.links
		.filter((l) => !heatIds.has(l.from.heatId))
		.map((l): Link =>
			l.to !== "eliminated" && heatIds.has(l.to.heatId)
				? { from: l.from, to: "eliminated" }
				: l,
		);
	const remaining = bracket.rounds.filter((r) => !roundIds.has(r.id));
	const next: Bracket = {
		...bracket,
		rounds: remaining,
		links,
	};
	if (bracket.format && hasDoubleElimination(bracket.format.settings)) {
		next.format = {
			...bracket.format,
			settings: removeDoubleElimination(bracket.format.settings),
		};
	}
	return ok(next);
}
