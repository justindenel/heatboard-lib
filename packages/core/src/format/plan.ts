import { deepEqual } from "../internal/equal";
import { balancedSizes } from "./fill";
import type {
	FormatEditorState,
	FormatFill,
	FormatOutcome,
	FormatPlacement,
	FormatRound,
	FormatSettings,
} from "./model";
import { withDefaultNames, type FormatNames } from "./names";
import { MAX_FORMAT_HEATS, MAX_FORMAT_ROUNDS } from "./parse";

export interface RepechagePlan {
	heats: number;
	/** Top ranks of every repechage heat that rejoin the main bracket. */
	advance: number;
	/** Heats and qualifiers follow the source round; a modified repechage keeps both as set. */
	auto: boolean;
	/** Defaults to "branch". */
	placement?: FormatPlacement;
}

export interface RoundPlan {
	heats: number;
	/** Top ranks of every heat that move on; 0 on the final. */
	advance: number;
	/** A modified round is never removed or resized by a recalculation. Meaningless on round 1. */
	auto: boolean;
	/** How riders arriving in this round are placed. Defaults to "branch". */
	placement?: FormatPlacement;
	/** Seeds that join this round directly, on top of the qualifiers; absent or 0 for none, ignored on round 1. */
	seedSlots?: number;
	repechage?: RepechagePlan;
}

export interface FormatPlan {
	riders: number;
	/** Main rounds in order; the last one is the final (1 heat, no qualifiers). */
	rounds: RoundPlan[];
	/** Optional heat for the riders eliminated in the round before the final. */
	smallFinal: boolean;
	/** How round 1 is filled: by seed or by draw. */
	fill: FormatFill;
}

export interface DefaultPlanInput {
	riders: number;
	/** Heats of round 1. */
	heats: number;
	advance: number;
	/** Whether a repechage follows round 1. */
	repechage: boolean;
	smallFinal?: boolean;
}

export interface RepechageFlow {
	incoming: number;
	sizes: number[];
	qualifiers: number;
}

export interface RoundFlow {
	incoming: number;
	/** Part of `incoming` that comes from the repechage of the previous round. */
	fromRepechage: number;
	/** Part of `incoming` made of seeds joining this round directly. */
	seedSlots: number;
	sizes: number[];
	qualifiers: number;
	/** Riders that do not qualify; they go to the repechage, the small final or home. */
	eliminated: number;
	repechage?: RepechageFlow;
}

export interface PlanFlow {
	rounds: RoundFlow[];
	/** Riders of the small final; absent without one. */
	smallFinal?: number;
}

export type PlanProblemCode =
	| "EMPTY_HEAT"
	| "NO_FINAL"
	| "TOO_MANY_ROUNDS"
	| "TOO_MANY_HEATS"
	| "SINGLE_RIDER_HEAT"
	| "LARGE_HEAT"
	| "ADVANCE_ALL"
	| "LARGE_FINAL"
	| "SHIFTED_ROUND"
	| "TOO_MANY_SEED_SLOTS";

export interface PlanProblem {
	code: PlanProblemCode;
	severity: "error" | "warning";
	/** Index of the round, or of the source round for a repechage and the small final. */
	round: number;
	target: "round" | "repechage" | "smallFinal";
}

const LAST_RANK = 100;
const MAX_COMFORTABLE_HEAT = 8;
/** Heats per round assumed when a format comes without a rider count. */
const NOMINAL_HEAT_SIZE = 4;
const MAX_REFILL_PASSES = 4;
const REPECHAGE_GROUP = "repechage";
const SMALL_FINAL_KEY = "small-final";

const ceilDiv = (a: number, b: number) => Math.ceil(a / Math.max(1, b));

const sizesOf = (riders: number, heats: number) =>
	heats < 1 ? [] : balancedSizes(riders, heats);

const qualifiersOf = (sizes: number[], advance: number) =>
	sizes.reduce((sum, size) => sum + Math.min(size, advance), 0);

/** Seeds joining round `index` directly; round 1 has none. */
const seedSlotsOf = (round: RoundPlan | undefined, index: number) =>
	index === 0 ? 0 : Math.max(0, Math.floor(round?.seedSlots ?? 0));

const totalSeedSlots = (rounds: readonly RoundPlan[]) =>
	rounds.reduce((sum, round, i) => sum + seedSlotsOf(round, i), 0);

/** Riders that start in round 1: the planned riders minus the seeds entering later. */
export function firstRoundRiders(plan: FormatPlan): number {
	return Math.max(0, plan.riders - totalSeedSlots(plan.rounds));
}

/** A repechage is never offered on the round before the final, nor on the final. */
export function canHaveRepechage(plan: FormatPlan, index: number): boolean {
	return index >= 0 && index < plan.rounds.length - 2;
}

function withoutRepechage(round: RoundPlan): RoundPlan {
	const copy = { ...round };
	delete copy.repechage;
	return copy;
}

/**
 * Round 1 is the starting input; later rounds are computed by `refillPlan`.
 * Heats and qualifiers of the other rounds follow from the target heat size.
 */
export function defaultPlan(input: DefaultPlanInput): FormatPlan {
	const heats = Math.max(1, Math.floor(input.heats));
	const advance = Math.max(1, Math.floor(input.advance));
	const first: RoundPlan =
		heats === 1
			? { heats, advance: 0, auto: false }
			: {
					heats,
					advance,
					auto: false,
					...(input.repechage && {
						repechage: { heats: 1, advance, auto: true },
					}),
				};
	return refillPlan(
		{
			riders: Math.max(0, Math.floor(input.riders)),
			rounds: [first],
			smallFinal: input.smallFinal ?? false,
			fill: "serpentine",
		},
		0,
	);
}

interface AutoContext {
	targetSize: number;
	advance: number;
}

function autoRound(
	incoming: number,
	context: AutoContext,
	previous: RoundPlan | undefined,
	forceNonFinal: boolean,
): RoundPlan {
	const placement = previous?.placement;
	const seedSlots = previous?.seedSlots;
	const carried = {
		...(placement && { placement }),
		...(seedSlots && { seedSlots }),
	};
	if (!forceNonFinal && incoming <= context.targetSize) {
		return { heats: 1, advance: 0, auto: true, ...carried };
	}
	const heats = Math.max(1, ceilDiv(incoming, context.targetSize));
	const smallestHeat = Math.floor(incoming / heats);
	return {
		heats,
		advance: Math.min(context.advance, Math.max(1, smallestHeat - 1)),
		auto: true,
		...carried,
		...(previous?.repechage && { repechage: { ...previous.repechage } }),
	};
}

/**
 * Recomputes the rounds after `fromIndex`, which the caller has just changed.
 * Auto rounds are regenerated from the riders they receive (target heat size =
 * heats of round 1 over riders, qualifiers of round 1 capped at the smallest
 * heat minus 1); modified rounds are kept and an auto round placed before one
 * cannot become the final. Repechage checkboxes are kept by position; an auto
 * repechage follows the heats and qualifiers of its source round. Rounds up to
 * `fromIndex` keep their own values. The result ends with a final unless the
 * round limit is hit, which `planProblems` reports.
 */
export function refillPlan(plan: FormatPlan, fromIndex: number): FormatPlan {
	let firstRiders = firstRoundRiders(plan);
	let result = refillPass(plan, fromIndex, firstRiders);
	// Rounds the pass adds or drops carry their seeds along, which moves the riders starting in round 1.
	for (let pass = 0; pass < MAX_REFILL_PASSES; pass++) {
		const needed = Math.max(0, plan.riders - totalSeedSlots(result.rounds));
		if (needed === firstRiders) break;
		firstRiders = needed;
		result = refillPass(plan, fromIndex, firstRiders);
	}
	return result;
}

function refillPass(
	plan: FormatPlan,
	fromIndex: number,
	firstRiders: number,
): FormatPlan {
	const old = plan.rounds;
	const first = old[0];
	if (!first) return plan;
	const from = Math.min(Math.max(0, Math.floor(fromIndex)), old.length - 1);
	const context: AutoContext = {
		targetSize: Math.max(2, ceilDiv(firstRiders, first.heats)),
		advance: Math.max(1, first.advance),
	};

	const rounds: RoundPlan[] = [];
	let incoming = firstRiders;
	for (let p = 0; p < MAX_FORMAT_ROUNDS; p++) {
		const previous = old[p];
		incoming += seedSlotsOf(previous, p);
		let round: RoundPlan;
		if (p <= from && previous) {
			round = { ...previous };
		} else if (previous && !previous.auto) {
			round = { ...previous };
		} else {
			const modifiedAhead = old.slice(p + 1).some((r) => !r.auto);
			round = autoRound(incoming, context, previous, modifiedAhead);
		}

		const isFinal = p === 0 ? round.heats === 1 : round.advance === 0;
		if (isFinal) {
			rounds.push({ ...withoutRepechage(round), heats: 1, advance: 0 });
			break;
		}
		if (round.advance < 1) round.advance = 1;

		const sizes = sizesOf(incoming, round.heats);
		const qualifiers = qualifiersOf(sizes, round.advance);
		const eliminated = incoming - qualifiers;
		let fromRepechage = 0;
		if (round.repechage) {
			let repechage = round.repechage;
			if (repechage.auto) {
				const heats = Math.max(1, ceilDiv(eliminated, context.targetSize));
				const smallestHeat = Math.floor(eliminated / heats);
				repechage = {
					...repechage,
					heats,
					advance: Math.min(round.advance, Math.max(1, smallestHeat - 1)),
				};
				round.repechage = repechage;
			}
			fromRepechage = qualifiersOf(
				sizesOf(eliminated, repechage.heats),
				repechage.advance,
			);
		}
		rounds.push(round);
		incoming = qualifiers + fromRepechage;
	}

	const last = rounds[rounds.length - 1];
	const reachesFinal = last !== undefined && last.advance === 0;
	if (reachesFinal) {
		const beforeFinal = rounds.length - 2;
		const round = rounds[beforeFinal];
		if (round) rounds[beforeFinal] = withoutRepechage(round);
	}
	return {
		...plan,
		rounds,
	};
}

/** Riders per round, heat sizes, qualifiers and repechage inflow, from the planned rider count. */
export function planFlow(plan: FormatPlan): PlanFlow {
	const rounds: RoundFlow[] = [];
	let incoming = firstRoundRiders(plan);
	let fromRepechage = 0;
	plan.rounds.forEach((round, i) => {
		const isFinal = i === plan.rounds.length - 1;
		const seedSlots = seedSlotsOf(round, i);
		incoming += seedSlots;
		const sizes = sizesOf(incoming, round.heats);
		const qualifiers = isFinal ? 0 : qualifiersOf(sizes, round.advance);
		const eliminated = isFinal ? 0 : incoming - qualifiers;
		const flow: RoundFlow = {
			incoming,
			fromRepechage,
			seedSlots,
			sizes,
			qualifiers,
			eliminated,
		};
		fromRepechage = 0;
		if (round.repechage && canHaveRepechage(plan, i)) {
			const repechageSizes = sizesOf(eliminated, round.repechage.heats);
			flow.repechage = {
				incoming: eliminated,
				sizes: repechageSizes,
				qualifiers: qualifiersOf(repechageSizes, round.repechage.advance),
			};
			fromRepechage = flow.repechage.qualifiers;
		}
		rounds.push(flow);
		incoming = qualifiers + fromRepechage;
	});
	const beforeFinal = rounds[plan.rounds.length - 2];
	return {
		rounds,
		...(plan.smallFinal &&
			beforeFinal && { smallFinal: beforeFinal.eliminated }),
	};
}

/** Blocking errors and warnings of a plan, in round order; display text is up to the caller. */
export function planProblems(plan: FormatPlan): PlanProblem[] {
	const problems: PlanProblem[] = [];
	const add = (
		code: PlanProblemCode,
		severity: PlanProblem["severity"],
		round: number,
		target: PlanProblem["target"] = "round",
	) => problems.push({ code, severity, round, target });

	const last = plan.rounds[plan.rounds.length - 1];
	if (!last || last.advance !== 0) {
		add("NO_FINAL", "error", Math.max(0, plan.rounds.length - 1));
	}

	if (totalSeedSlots(plan.rounds) > plan.riders) {
		const lastSeeded = plan.rounds.findLastIndex(
			(r, i) => seedSlotsOf(r, i) > 0,
		);
		add("TOO_MANY_SEED_SLOTS", "error", lastSeeded);
	}

	const flow = planFlow(plan);
	const repechageCount = flow.rounds.filter((f) => f.repechage).length;
	if (
		plan.rounds.length +
			repechageCount +
			(flow.smallFinal === undefined ? 0 : 1) >
		MAX_FORMAT_ROUNDS
	) {
		add("TOO_MANY_ROUNDS", "error", Math.max(0, plan.rounds.length - 1));
	}

	const checkSizes = (
		sizes: number[],
		round: number,
		kind: PlanProblem["target"],
		advance: number,
		isFinal: boolean,
		heats: number,
	) => {
		if (heats > MAX_FORMAT_HEATS) add("TOO_MANY_HEATS", "error", round, kind);
		if (sizes.some((s) => s === 0)) add("EMPTY_HEAT", "error", round, kind);
		if (sizes.some((s) => s === 1)) {
			add("SINGLE_RIDER_HEAT", "warning", round, kind);
		}
		if (sizes.some((s) => s > MAX_COMFORTABLE_HEAT)) {
			add(isFinal ? "LARGE_FINAL" : "LARGE_HEAT", "warning", round, kind);
		}
		if (!isFinal && sizes.some((s) => s >= 1 && s <= advance)) {
			add("ADVANCE_ALL", "warning", round, kind);
		}
	};

	plan.rounds.forEach((round, i) => {
		const f = flow.rounds[i];
		if (!f) return;
		const isFinal = i === plan.rounds.length - 1;
		checkSizes(f.sizes, i, "round", round.advance, isFinal, round.heats);
		if (i > 0 && !round.auto && f.incoming < 2 * round.heats) {
			add("SHIFTED_ROUND", "warning", i);
		}
		if (f.repechage && round.repechage) {
			checkSizes(
				f.repechage.sizes,
				i,
				"repechage",
				round.repechage.advance,
				false,
				round.repechage.heats,
			);
		}
	});
	if (flow.smallFinal !== undefined) {
		const at = plan.rounds.length - 2;
		checkSizes([flow.smallFinal], at, "smallFinal", 0, true, 1);
	}
	return problems.sort((a, b) => a.round - b.round);
}

/** Name of main round `index` by its distance from the final, in the given names. */
export function planRoundName(
	plan: FormatPlan,
	index: number,
	names?: Partial<FormatNames>,
): string {
	const roundNames = withDefaultNames(names);
	const count = plan.rounds.length;
	if (index === count - 1) return roundNames.final;
	if (index === count - 2 && plan.rounds[index]?.heats === 2) {
		return roundNames.semiFinals;
	}
	if (
		index === count - 3 &&
		plan.rounds[index]?.heats === 4 &&
		plan.rounds[index + 1]?.heats === 2
	) {
		return roundNames.quarterFinals;
	}
	return roundNames.round(index + 1);
}

const mainKey = (index: number, count: number) =>
	index === count - 1 ? "final" : `r${index + 1}`;
const repechageKey = (index: number) => `rep-r${index + 1}`;

/**
 * Format settings of a plan. Keys are positional (`r1`.., `rep-r<k>`,
 * `small-final`, `final`); a repechage follows its source round and takes every
 * place after the qualifiers, up to the last rank, so a rider added to a heat
 * later still goes there. The small final is an optional main round placed
 * before the final. A plan without a final (see `planProblems`) is written as if
 * its last round were one.
 */
export function formatFromPlan(
	plan: FormatPlan,
	names?: Partial<FormatNames>,
): FormatSettings {
	const roundNames = withDefaultNames(names);
	const count = plan.rounds.length;
	const withSmallFinal = plan.smallFinal && count >= 2;
	const rounds: FormatRound[] = [];
	let hasRepechage = false;

	plan.rounds.forEach((round, i) => {
		const isFinal = i === count - 1;
		const outcomes: FormatOutcome[] = [];
		const repechage =
			round.repechage && canHaveRepechage(plan, i)
				? round.repechage
				: undefined;
		if (!isFinal) {
			outcomes.push({ ranks: [1, round.advance], to: mainKey(i + 1, count) });
			const rest: [number, number] = [round.advance + 1, LAST_RANK];
			if (withSmallFinal && i === count - 2) {
				outcomes.push({ ranks: rest, to: SMALL_FINAL_KEY });
			}
			if (repechage) outcomes.push({ ranks: rest, to: repechageKey(i) });
		}
		const main: FormatRound = {
			key: mainKey(i, count),
			name: planRoundName(plan, i, names),
			heats: round.heats,
		};
		if (outcomes.length > 0) main.outcomes = outcomes;
		if (round.placement === "spread") main.placement = "spread";
		const seedSlots = seedSlotsOf(round, i);
		if (seedSlots > 0) main.seedSlots = seedSlots;
		rounds.push(main);

		if (repechage) {
			hasRepechage = true;
			const side: FormatRound = {
				key: repechageKey(i),
				name: roundNames.repechage(i + 1),
				group: REPECHAGE_GROUP,
				heats: repechage.heats,
				outcomes: [
					{ ranks: [1, repechage.advance], to: mainKey(i + 1, count) },
				],
			};
			if (repechage.placement === "spread") side.placement = "spread";
			rounds.push(side);
		}
		if (withSmallFinal && i === count - 2) {
			rounds.push({
				key: SMALL_FINAL_KEY,
				name: roundNames.smallFinal,
				heats: 1,
				optional: true,
			});
		}
	});

	return {
		heatboardFormat: 1,
		name: hasRepechage ? "Repechage" : "Single elimination",
		fill: plan.fill,
		rounds,
	};
}

/** Keys and names left out: only the structure of the rounds counts. */
function shapeOf(settings: FormatSettings) {
	const indexOf = new Map(settings.rounds.map((r, i) => [r.key, i]));
	return {
		fill: settings.fill,
		rounds: settings.rounds.map((r) => ({
			group: r.group ?? "main",
			heats: r.heats,
			optional: r.optional === true,
			placement: r.placement ?? "branch",
			seedSlots: r.seedSlots ?? 0,
			outcomes: (r.outcomes ?? []).map((o) => [
				o.ranks[0],
				o.ranks[1],
				indexOf.get(o.to),
			]),
		})),
	};
}

const isMain = (round: FormatRound) => (round.group ?? "main") === "main";

/**
 * The plan that `formatFromPlan` writes as `settings` (names and keys ignored),
 * or null when the format cannot be written as rows (destinations by place,
 * double elimination, other optional rounds...): it is then shown read-only.
 * Without editor state every round is "modified". The rider count is, in order,
 * `riders`, the one in the editor state, or a nominal one.
 */
export function planFromFormat(
	settings: FormatSettings,
	editor?: FormatEditorState,
	riders?: number,
): FormatPlan | null {
	const all = settings.rounds;
	const beforeLast = all[all.length - 2];
	const smallRound = beforeLast?.optional ? beforeLast : undefined;
	if (smallRound && !isMain(smallRound)) return null;
	const mains = all.filter((r) => isMain(r) && r !== smallRound);
	const finalRound = mains[mains.length - 1];
	if (!finalRound || finalRound.heats !== 1) return null;

	const usable =
		editor && editor.rounds.length === mains.length ? editor : undefined;
	const rounds: RoundPlan[] = [];
	for (const [i, round] of mains.entries()) {
		const flags = usable?.rounds[i];
		const placement =
			round.placement === "spread" ? { placement: "spread" as const } : {};
		const seedSlots =
			i > 0 && round.seedSlots ? { seedSlots: round.seedSlots } : {};
		if (i === mains.length - 1) {
			rounds.push({
				heats: 1,
				advance: 0,
				auto: flags?.auto ?? false,
				...placement,
				...seedSlots,
			});
			continue;
		}
		const next = mains[i + 1] as FormatRound;
		const toNext = round.outcomes?.find(
			(o) => o.ranks[0] === 1 && o.to === next.key,
		);
		if (!toNext) return null;
		const plan: RoundPlan = {
			heats: round.heats,
			advance: toNext.ranks[1],
			auto: i === 0 ? false : (flags?.auto ?? false),
			...placement,
			...seedSlots,
		};
		const side = all.find(
			(r) =>
				r.group === REPECHAGE_GROUP &&
				round.outcomes?.some((o) => o.to === r.key),
		);
		if (side) {
			const through = side.outcomes?.[0];
			if (!through) return null;
			plan.repechage = {
				heats: side.heats,
				advance: through.ranks[1],
				auto: flags?.repechageAuto ?? false,
				...(side.placement === "spread" && { placement: "spread" as const }),
			};
		}
		rounds.push(plan);
	}

	const plan: FormatPlan = {
		riders:
			riders ?? editor?.riders ?? NOMINAL_HEAT_SIZE * (mains[0]?.heats ?? 1),
		rounds,
		smallFinal: smallRound !== undefined,
		fill: settings.fill,
	};
	return deepEqual(shapeOf(formatFromPlan(plan)), shapeOf(settings))
		? plan
		: null;
}

/** The part of a plan that is stored next to the format of a bracket. */
export function editorFromPlan(plan: FormatPlan): FormatEditorState {
	return {
		riders: plan.riders,
		rounds: plan.rounds.map((round) => ({
			auto: round.auto,
			...(round.repechage && { repechageAuto: round.repechage.auto }),
		})),
	};
}
