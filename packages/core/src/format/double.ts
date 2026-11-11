import { balancedSizes } from "./fill";
import type { FormatOutcome, FormatRound, FormatSettings } from "./model";
import { withDefaultNames, type FormatNames } from "./names";
import { MAX_FORMAT_HEATS, MAX_FORMAT_ROUNDS } from "./parse";

/** Group of the rounds a generated double side is made of. */
export const DOUBLE_GROUP = "double";

/** Highest rank `parseFormat` accepts; used as "every remaining place". */
const LAST_RANK = 100;

export type DoubleFinalMode = "duels" | "heats";

export type DoubleEliminationErrorCode =
	| "HAS_DOUBLE_ELIMINATION"
	| "NOT_SINGLE_ELIMINATION"
	| "UNEVEN_HEATS"
	| "FINAL_TOO_SMALL"
	| "NOTHING_ELIMINATED"
	| "KEY_CONFLICT"
	| "ROUND_LIMIT"
	| "HEAT_LIMIT";

export type DoubleEliminationResult =
	| { ok: true; format: FormatSettings }
	| { ok: false; code: DoubleEliminationErrorCode };

const isMain = (round: FormatRound) => (round.group ?? "main") === "main";

/** Works on a format and on a bracket: a double side is a `double` group among the rounds. */
export function hasDoubleElimination(source: {
	rounds: readonly { group?: string }[];
}): boolean {
	return source.rounds.some((r) => r.group === DOUBLE_GROUP);
}

/**
 * True for a plain single elimination: main group only, no optional round, each
 * round except the last sends its top ranks (from 1) to the next round and
 * nothing else, and the last round is a single heat.
 */
export function isSingleElimination(settings: FormatSettings): boolean {
	const { rounds } = settings;
	if (rounds.length < 2) return false;
	return rounds.every((round, i) => {
		if (!isMain(round) || round.optional) return false;
		const outcomes = round.outcomes ?? [];
		if (i === rounds.length - 1) {
			return outcomes.length === 0 && round.heats === 1;
		}
		const [outcome] = outcomes;
		return (
			outcomes.length === 1 &&
			outcome !== undefined &&
			outcome.ranks[0] === 1 &&
			outcome.ranks[1] < LAST_RANK &&
			outcome.to === rounds[i + 1]?.key
		);
	});
}

interface Plan {
	heats: number;
	/** Top ranks of each heat that go on. */
	qualifiers: number;
	/** Riders going on in total. */
	climbers: number;
}

/** Heats of at most `heatSize` riders, the top half of each going on. */
function plan(riders: number, heatSize: number): Plan {
	const heats = Math.max(1, Math.ceil(riders / heatSize));
	const sizes = balancedSizes(riders, heats);
	const qualifiers = Math.max(1, Math.floor(Math.min(...sizes) / 2));
	const climbers = sizes.reduce((sum, s) => sum + Math.min(qualifiers, s), 0);
	return { heats, qualifiers, climbers };
}

/**
 * Generates the double side of a plain single elimination. The
 * single runs first; the double side (group "double") then takes the eliminated
 * riders, and its results decide the final ranking.
 *
 * Rider counts are nominal: the heat size `s` is the single final's riders
 * (heats of the previous round times its qualifiers per heat), the first round
 * is assumed to have the heat size of the second, and every double round uses
 * heats of at most `s` riders, top half going on.
 *
 * Balancing rule: the riders eliminated from single round k (m of them) enter
 * the double side in an entry round, against the c climbers coming from the
 * previous double round. While c >= 2m, internal rounds (climbers only) halve c
 * so that climbers and newcomers are about as many in the entry round. The
 * first entry round has no climbers. At the end:
 * - "duels": internal rounds reduce the climbers to 1, then a ladder of duels
 *   against the single final's places s, s-1, ..., 1 (the last one is the
 *   double final), then an optional super final with the same two riders.
 * - "heats": the final's bottom half b = s - floor(s / 2) joins the climbers in
 *   an entry round (preceded by internal rounds while c >= 2b); internal
 *   rounds then bring the climbers down to at most b, and they play the final's
 *   top half in the double final.
 */
export function generateDoubleElimination(
	settings: FormatSettings,
	options: {
		finalMode: DoubleFinalMode;
		/** Duels mode only; the optional super final is generated unless `false`. */
		superFinal?: boolean;
		/**
		 * Planned riders per heat of each round key (`buildFromFormat(...).sizes`). Given,
		 * the eliminated counts come from them and uneven heats are accepted; absent,
		 * counts are nominal and uneven heats are refused.
		 */
		sizes?: Record<string, number[]>;
	},
	names?: Partial<FormatNames>,
): DoubleEliminationResult {
	const roundNames = withDefaultNames(names);
	if (hasDoubleElimination(settings)) {
		return { ok: false, code: "HAS_DOUBLE_ELIMINATION" };
	}
	if (!isSingleElimination(settings)) {
		return { ok: false, code: "NOT_SINGLE_ELIMINATION" };
	}
	const singles = settings.rounds;
	const last = singles.length - 1;

	const qualifiersOf = (k: number) => singles[k]?.outcomes?.[0]?.ranks[1] ?? 0;
	let heatSize: number;
	let eliminated: (k: number) => number;
	const { sizes } = options;
	if (sizes) {
		// Real heat sizes: a heat smaller than its qualifiers sends everyone on.
		const sizesOf = (k: number) => sizes[singles[k]?.key ?? ""] ?? [];
		heatSize = sizesOf(last).reduce((sum, size) => sum + size, 0);
		eliminated = (k) =>
			sizesOf(k).reduce(
				(sum, size) => sum + Math.max(0, size - qualifiersOf(k)),
				0,
			);
	} else {
		// entering[k]: nominal riders entering single round k.
		const entering: number[] = [];
		entering[1] = (singles[0]?.heats ?? 0) * qualifiersOf(0);
		for (let k = 1; k < last; k++) {
			entering[k + 1] = (singles[k]?.heats ?? 0) * qualifiersOf(k);
		}
		heatSize = entering[last] as number;
		const first =
			((singles[0]?.heats ?? 0) * entering[1]) / (singles[1]?.heats ?? 1);
		if (heatSize >= 2 && !Number.isInteger(first)) {
			return { ok: false, code: "UNEVEN_HEATS" };
		}
		entering[0] = first;
		eliminated = (k) =>
			Math.max(0, (entering[k] as number) - (entering[k + 1] as number));
	}
	if (heatSize < 2) return { ok: false, code: "FINAL_TOO_SMALL" };
	if (eliminated(0) === 0) return { ok: false, code: "NOTHING_ELIMINATED" };

	const doubles: FormatRound[] = [];
	let tail: { round: FormatRound; qualifiers: number } | undefined;
	let count = 0;
	let climbers = 0;
	const push = (round: FormatRound, qualifiers: number) => {
		if (tail) {
			tail.round.outcomes = [{ ranks: [1, tail.qualifiers], to: round.key }];
		}
		doubles.push(round);
		tail = { round, qualifiers };
	};
	const make = (key: string, name: string, heats: number): FormatRound => ({
		key,
		name,
		group: DOUBLE_GROUP,
		heats,
		placement: "spread",
	});
	const numbered = () => {
		count += 1;
		return { key: `d${count}`, name: roundNames.double(count) };
	};
	const internal = () => {
		const p = plan(climbers, heatSize);
		const { key, name } = numbered();
		push(make(key, name, p.heats), p.qualifiers);
		climbers = p.climbers;
	};
	const entry = (newcomers: number): string => {
		const p = plan(climbers + newcomers, heatSize);
		const { key, name } = numbered();
		push(make(key, name, p.heats), p.qualifiers);
		climbers = p.climbers;
		return key;
	};

	/** Outcomes the single rounds get towards the double side. */
	const sends: FormatOutcome[][] = singles.map(() => []);
	for (let k = 0; k < last; k++) {
		const m = eliminated(k);
		if (m === 0) continue;
		while (climbers >= 2 * m) internal();
		sends[k]?.push({
			ranks: [qualifiersOf(k) + 1, LAST_RANK],
			to: entry(m),
		});
	}

	const finalSends = sends[last] as FormatOutcome[];
	if (options.finalMode === "duels") {
		while (climbers > 1) internal();
		for (let place = heatSize; place >= 1; place--) {
			const { key, name } =
				place === 1
					? { key: "double-final", name: roundNames.doubleFinal }
					: numbered();
			push(make(key, name, 1), place === 1 ? 2 : 1);
			finalSends.push({ ranks: [place, place], to: key });
		}
		finalSends.reverse();
		if (options.superFinal !== false) {
			push(
				{
					...make("super-final", roundNames.superFinal, 1),
					optional: true,
				},
				0,
			);
		}
	} else {
		const top = Math.floor(heatSize / 2);
		const bottom = heatSize - top;
		while (climbers >= 2 * bottom) internal();
		const entryKey = entry(bottom);
		while (climbers > bottom) internal();
		const p = plan(climbers + top, heatSize);
		push(make("double-final", roundNames.doubleFinal, p.heats), 0);
		finalSends.push(
			{ ranks: [1, top], to: "double-final" },
			{ ranks: [top + 1, LAST_RANK], to: entryKey },
		);
	}

	const used = new Set(singles.map((r) => r.key));
	if (doubles.some((r) => used.has(r.key))) {
		return { ok: false, code: "KEY_CONFLICT" };
	}
	if (singles.length + doubles.length > MAX_FORMAT_ROUNDS) {
		return { ok: false, code: "ROUND_LIMIT" };
	}
	if (doubles.some((r) => r.heats > MAX_FORMAT_HEATS)) {
		return { ok: false, code: "HEAT_LIMIT" };
	}

	const rounds: FormatRound[] = [
		...singles.map((round, k) => {
			const added = sends[k] ?? [];
			return added.length === 0
				? round
				: { ...round, outcomes: [...(round.outcomes ?? []), ...added] };
		}),
		...doubles,
	];
	return { ok: true, format: { ...settings, rounds } };
}

/** Removes the double side and the outcomes leading to it. */
export function removeDoubleElimination(
	settings: FormatSettings,
): FormatSettings {
	const removed = new Set(
		settings.rounds.filter((r) => r.group === DOUBLE_GROUP).map((r) => r.key),
	);
	const rounds = settings.rounds
		.filter((r) => !removed.has(r.key))
		.map((round) => {
			const before = round.outcomes ?? [];
			const outcomes = before.filter((o) => !removed.has(o.to));
			if (outcomes.length === before.length) return round;
			const copy = { ...round };
			if (outcomes.length === 0) delete copy.outcomes;
			else copy.outcomes = outcomes;
			return copy;
		});
	return { ...settings, rounds };
}
