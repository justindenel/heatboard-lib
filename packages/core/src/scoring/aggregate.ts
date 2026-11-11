import type {
	Aggregation,
	Penalty,
	ScoringCategory,
	ScoringConfig,
} from "./model";

export interface ValuedRide {
	rideId: string;
	type: string;
	value: number;
	/** Base figure of the ride; its family decides which rides may count together. */
	figure?: string | undefined;
}

export interface Retained {
	total: number;
	byType: Map<string, number>;
	kept: ValuedRide[];
}

/** Value of one ride from its notes, all in integer hundredths. */
export function aggregateNotes(
	aggregation: Aggregation,
	notes: number[],
): number {
	if (notes.length === 0) return 0;
	const sum = (values: number[]) => values.reduce((acc, v) => acc + v, 0);
	if (aggregation === "sum") return sum(notes);
	if (aggregation === "trimmedMean" && notes.length >= 3) {
		const sorted = [...notes].sort((a, b) => a - b);
		const inner = sorted.slice(1, -1);
		return Math.round(sum(inner) / inner.length);
	}
	return Math.round(sum(notes) / notes.length);
}

function applyPenalties(values: number[], penalties: Penalty[]): number[] {
	return penalties.reduce((current, { kind }) => {
		const index = kind === "zeroBest" ? 0 : 1;
		if (index >= current.length) return current;
		return current.map((v, i) => {
			if (i !== index) return v;
			return kind === "halfSecondBest" ? Math.round(v / 2) : 0;
		});
	}, values);
}

/**
 * Best `counted` rides of a category. With `distinctFamilies` only the best ride of each
 * family can count (a ride without a known family is never excluded), which is the optimal
 * set: rides of one family are interchangeable, so the best one dominates the others.
 * Ties go to the earliest ride; `rides` must be ordered by date.
 */
function bestRides(
	category: ScoringCategory,
	rides: ValuedRide[],
): ValuedRide[] {
	const sorted = [...rides].sort((a, b) => b.value - a.value);
	const limit = Math.max(0, Math.floor(category.counted));
	if (
		category.distinctFamilies !== true ||
		(category.families?.length ?? 0) < 2
	) {
		return sorted.slice(0, limit);
	}
	const familyOf = new Map(
		(category.figures ?? []).map((f) => [f.code, f.family]),
	);
	const seen = new Set<string>();
	const eligible = sorted.filter((r) => {
		const family = r.figure === undefined ? undefined : familyOf.get(r.figure);
		if (family === undefined) return true;
		if (seen.has(family)) return false;
		seen.add(family);
		return true;
	});
	return eligible.slice(0, limit);
}

/** Keeps the best `counted` rides per category; `rides` must be ordered by date. */
export function retain(
	config: ScoringConfig,
	rides: ValuedRide[],
	penalties: Penalty[],
): Retained {
	const byType = new Map<string, number>();
	const kept: ValuedRide[] = [];
	let total = 0;
	for (const category of config.categories) {
		const best = bestRides(
			category,
			rides.filter((r) => r.type === category.type),
		);
		const values = applyPenalties(
			best.map((r) => r.value),
			penalties.filter((p) => p.type === category.type),
		);
		best.forEach((r, i) => kept.push({ ...r, value: values[i] ?? 0 }));
		const milli = Math.round((category.coefficient ?? 1) * 1000);
		const categoryTotal = Math.floor(
			(values.reduce((acc, v) => acc + v, 0) * milli + 500) / 1000,
		);
		byType.set(category.type, categoryTotal);
		total += categoryTotal;
	}
	return { total, byType, kept };
}

/**
 * Aggregates the judges' own retained totals, per type and overall. Kept rides
 * of every judge are pooled so the tie-break sees each single note.
 */
export function combineJudges(
	config: ScoringConfig,
	perJudge: Retained[],
): Retained {
	return {
		total: aggregateNotes(
			config.aggregation,
			perJudge.map((r) => r.total),
		),
		byType: new Map(
			config.categories.map((c) => [
				c.type,
				aggregateNotes(
					config.aggregation,
					perJudge.map((r) => r.byType.get(c.type) ?? 0),
				),
			]),
		),
		kept: perJudge.flatMap((r) => r.kept),
	};
}

function bestOfType(retained: Retained, type: string): number | undefined {
	const values = retained.kept.filter((r) => r.type === type);
	return values.length === 0
		? undefined
		: Math.max(...values.map((r) => r.value));
}

function compareLists(a: number[], b: number[]): number {
	const shared = Math.min(a.length, b.length);
	for (let i = 0; i < shared; i++) {
		const diff = (a[i] ?? 0) - (b[i] ?? 0);
		if (diff !== 0) return diff;
	}
	return a.length - b.length;
}

/** Positive when `a` beats `b` on kept ride values alone (no total). */
export function compareTieBreak(
	config: ScoringConfig,
	a: Retained,
	b: Retained,
): number {
	if (config.priorityType !== undefined) {
		const bestA = bestOfType(a, config.priorityType);
		const bestB = bestOfType(b, config.priorityType);
		if (bestA !== bestB) {
			if (bestA === undefined) return -1;
			if (bestB === undefined) return 1;
			return bestA - bestB;
		}
	}
	const sorted = (r: Retained) =>
		r.kept.map((k) => k.value).sort((x, y) => y - x);
	return compareLists(sorted(a), sorted(b));
}

/** Positive when `a` ranks ahead of `b` by total, then by tie-break. */
export function comparePoints(
	config: ScoringConfig,
	a: Retained,
	b: Retained,
): number {
	return a.total - b.total || compareTieBreak(config, a, b);
}

export interface Group<T> {
	items: T[];
	position: number;
}

/** Sorts best first (`compare` > 0 means first argument wins) and groups equal items. */
export function groupRanked<T>(
	items: T[],
	compare: (a: T, b: T) => number,
): Group<T>[] {
	const sorted = [...items].sort((a, b) => compare(b, a));
	const groups: Group<T>[] = [];
	sorted.forEach((item, index) => {
		const last = groups[groups.length - 1];
		const first = last?.items[0];
		if (last && first !== undefined && compare(first, item) === 0) {
			last.items.push(item);
		} else {
			groups.push({ items: [item], position: index + 1 });
		}
	});
	return groups;
}
