import {
	refillPlan,
	type FormatFill,
	type FormatPlan,
	type RoundPlan,
} from "@heatboard/core";

/** Qualifiers per heat of a round 1 that was a lone final and gets several heats. */
const DEFAULT_ADVANCE = 2;

const replaceRound = (
	plan: FormatPlan,
	index: number,
	change: (round: RoundPlan) => RoundPlan,
): FormatPlan => ({
	...plan,
	rounds: plan.rounds.map((round, i) => (i === index ? change(round) : round)),
});

function withoutRepechage(round: RoundPlan): RoundPlan {
	const copy = { ...round };
	delete copy.repechage;
	return copy;
}

export function withRiders(plan: FormatPlan, riders: number): FormatPlan {
	return refillPlan({ ...plan, riders: Math.max(0, Math.floor(riders)) }, 0);
}

/** Round 1 is the starting input: it is never "modified" and always drives the rounds after it. */
export function withFirstRound(
	plan: FormatPlan,
	change: { heats?: number; advance?: number; repechage?: boolean },
): FormatPlan {
	const next = replaceRound(plan, 0, (round) => {
		let copy: RoundPlan = { ...round };
		if (change.heats !== undefined) {
			copy.heats = Math.max(1, Math.floor(change.heats));
			if (copy.heats > 1 && copy.advance < 1) copy.advance = DEFAULT_ADVANCE;
		}
		if (change.advance !== undefined) {
			copy.advance = Math.max(1, Math.floor(change.advance));
		}
		if (change.repechage === false) copy = withoutRepechage(copy);
		if (change.repechage === true && !copy.repechage) {
			copy.repechage = {
				heats: 1,
				advance: Math.max(1, copy.advance),
				auto: true,
			};
		}
		return copy;
	});
	return refillPlan(next, 0);
}

/** A changed value turns the round "modified"; the auto rounds after it are recalculated. */
export function withRound(
	plan: FormatPlan,
	index: number,
	change: { heats?: number; advance?: number },
): FormatPlan {
	const next = replaceRound(plan, index, (round) => ({
		...round,
		...(change.heats !== undefined && {
			heats: Math.max(1, Math.floor(change.heats)),
		}),
		...(change.advance !== undefined && {
			advance: Math.max(1, Math.floor(change.advance)),
		}),
		auto: false,
	}));
	return refillPlan(next, index);
}

/**
 * Seed slots joining round `index` directly. Like the repechage checkbox it is a choice, not a
 * value: the round keeps its auto / modified state, and an auto round is resized for its new riders.
 * Round 1 takes none.
 */
export function withSeedSlots(
	plan: FormatPlan,
	index: number,
	seedSlots: number,
): FormatPlan {
	if (index < 1) return plan;
	const count = Math.max(0, Math.floor(seedSlots));
	const next = replaceRound(plan, index, (round) => {
		const copy = { ...round };
		if (count > 0) copy.seedSlots = count;
		else delete copy.seedSlots;
		return copy;
	});
	return refillPlan(next, index - 1);
}

/** The checkbox is a choice, not a value: the round keeps its auto / modified state. */
export function withRepechage(
	plan: FormatPlan,
	index: number,
	on: boolean,
): FormatPlan {
	const next = replaceRound(plan, index, (round) => {
		if (!on) return withoutRepechage(round);
		return {
			...round,
			repechage: round.repechage ?? {
				heats: 1,
				advance: Math.max(1, round.advance),
				auto: true,
			},
		};
	});
	return refillPlan(next, index);
}

export function withRepechageValues(
	plan: FormatPlan,
	index: number,
	change: { heats?: number; advance?: number },
): FormatPlan {
	const next = replaceRound(plan, index, (round) => {
		if (!round.repechage) return round;
		return {
			...round,
			repechage: {
				...round.repechage,
				...(change.heats !== undefined && {
					heats: Math.max(1, Math.floor(change.heats)),
				}),
				...(change.advance !== undefined && {
					advance: Math.max(1, Math.floor(change.advance)),
				}),
				auto: false,
			},
		};
	});
	return refillPlan(next, index);
}

/** "↺ suite": the rounds after `index` (and their repechages) follow the calculation again. */
export function resetFollowing(plan: FormatPlan, index: number): FormatPlan {
	const next: FormatPlan = {
		...plan,
		rounds: plan.rounds.map((round, i) => {
			if (i <= index) return round;
			return {
				...round,
				auto: true,
				...(round.repechage && {
					repechage: { ...round.repechage, auto: true },
				}),
			};
		}),
	};
	return refillPlan(next, index);
}

/** Round 1 and the final stay; the rounds after the removed one become "modified". */
export function removeRound(plan: FormatPlan, index: number): FormatPlan {
	if (index < 1 || index >= plan.rounds.length - 1) return plan;
	const rounds = plan.rounds
		.filter((_, i) => i !== index)
		.map((round, i) => (i >= index ? { ...round, auto: false } : round));
	return refillPlan({ ...plan, rounds }, index - 1);
}

/** Inserts a modified round right before the final; undefined when there is no round to add it after. */
export function addRound(plan: FormatPlan): FormatPlan | undefined {
	const count = plan.rounds.length;
	const previous = plan.rounds[count - 2];
	if (!previous) return undefined;
	const added: RoundPlan = {
		heats: Math.max(1, Math.ceil(previous.heats / 2)),
		advance: previous.advance > 0 ? previous.advance : DEFAULT_ADVANCE,
		auto: false,
	};
	const rounds = [...plan.rounds];
	rounds.splice(count - 1, 0, added);
	return refillPlan({ ...plan, rounds }, count - 1);
}

export function withSmallFinal(plan: FormatPlan, on: boolean): FormatPlan {
	return { ...plan, smallFinal: on };
}

export function withFill(plan: FormatPlan, fill: FormatFill): FormatPlan {
	return { ...plan, fill };
}

/** Rounds other than round 1, and repechages, that were set by hand. */
export function modifiedCount(plan: FormatPlan): number {
	return plan.rounds.reduce(
		(sum, round, i) =>
			sum +
			(i > 0 && !round.auto ? 1 : 0) +
			(round.repechage && !round.repechage.auto ? 1 : 0),
		0,
	);
}
