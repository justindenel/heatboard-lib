import { serpentineIndex } from "../internal/serpentine";

/** Heat sizes for `n` riders over `heats` heats: the first `n % heats` heats get one more. */
export function balancedSizes(n: number, heats: number): number[] {
	const base = Math.floor(n / heats);
	const extra = n % heats;
	return Array.from({ length: heats }, (_, i) => base + (i < extra ? 1 : 0));
}

export interface Dealt {
	/** Heat index of each item, in input order. */
	heatOf: number[];
	/** Indexes of items placed next to another item from the same source heat. */
	rematches: number[];
}

export interface Block {
	/** Heat indexes of the source round, contiguous. */
	source: number[];
	/** Heat indexes of the target round, contiguous. */
	target: number[];
}

function range(from: number, to: number): number[] {
	return Array.from({ length: to - from }, (_, i) => from + i);
}

function gcd(a: number, b: number): number {
	return b === 0 ? a : gcd(b, a % b);
}

/**
 * Splits a source round of `sourceHeats` heats and a target round of
 * `targetHeats` heats into `d` blocks, `d` being the largest divisor of their
 * gcd that leaves at least 2 source heats per block (1 when none does).
 */
export function branchBlocks(
	sourceHeats: number,
	targetHeats: number,
): Block[] {
	const common = gcd(sourceHeats, targetHeats);
	let d = 1;
	for (let candidate = common; candidate > 1; candidate--) {
		if (common % candidate === 0 && sourceHeats / candidate >= 2) {
			d = candidate;
			break;
		}
	}
	const s = sourceHeats / d;
	const t = targetHeats / d;
	return Array.from({ length: d }, (_, b) => ({
		source: range(b * s, (b + 1) * s),
		target: range(b * t, (b + 1) * t),
	}));
}

/**
 * Deals items across heats of the given sizes: the k-th item goes to its
 * serpentine heat, otherwise to the next heat in serpentine order that has room
 * and no item from the same source. When no such heat exists the item goes to
 * the first heat with room and is reported as a rematch.
 * `sourceOf` returns the source heat of an item, or undefined when it has none.
 * `allowedOf` optionally restricts an item to a subset of heats: it is then
 * dealt serpentine within that subset, counting only the items sharing it, and
 * falls back to any heat with room when the subset is full.
 * Items for which `cyclicOf` is true are dealt one heat after the other in a
 * cycle (heat 0, 1, ..., last, 0, ...) instead of serpentine, so that however
 * few they are, no heat gets two before every heat of the range has one.
 */
export function dealAcross<T>(
	items: readonly T[],
	sizes: readonly number[],
	sourceOf: (item: T) => string | undefined,
	allowedOf: (item: T) => readonly number[] | undefined = () => undefined,
	cyclicOf: (item: T) => boolean = () => false,
): Dealt {
	const heats = sizes.length;
	const filled = sizes.map(() => 0);
	const sources = sizes.map(() => new Set<string>());
	const heatOf: number[] = [];
	const rematches: number[] = [];
	const dealtPerSubset = new Map<string, number>();
	let cyclicDealt = 0;

	items.forEach((item, k) => {
		const source = sourceOf(item);
		const allowed = allowedOf(item);
		const cyclic = cyclicOf(item);
		const order = (position: number, length: number) =>
			cyclic ? position % length : serpentineIndex(position, length);
		const globalPosition = cyclic ? cyclicDealt++ : k;
		const hasRoom = (h: number) => (filled[h] ?? 0) < (sizes[h] ?? 0);
		let target = -1;
		if (allowed && allowed.length > 0) {
			const subsetKey = allowed.join(",");
			const position = dealtPerSubset.get(subsetKey) ?? 0;
			dealtPerSubset.set(subsetKey, position + 1);
			for (let step = 0; step < 2 * allowed.length && target === -1; step++) {
				const h = allowed[order(position + step, allowed.length)] as number;
				if (hasRoom(h) && (source === undefined || !sources[h]?.has(source))) {
					target = h;
				}
			}
			// Staying in the branch matters more than avoiding a heat mate, and is not reported.
			for (let step = 0; step < 2 * allowed.length && target === -1; step++) {
				const h = allowed[order(position + step, allowed.length)] as number;
				if (hasRoom(h)) target = h;
			}
		}
		if (target === -1) {
			for (let step = 0; step < 2 * heats && target === -1; step++) {
				const h = order(globalPosition + step, heats);
				if (hasRoom(h) && (source === undefined || !sources[h]?.has(source))) {
					target = h;
				}
			}
		}
		if (target === -1) {
			target = sizes.findIndex((_, h) => hasRoom(h));
			if (target !== -1) rematches.push(k);
		}
		heatOf.push(target);
		if (target !== -1) {
			filled[target] = (filled[target] ?? 0) + 1;
			if (source !== undefined) sources[target]?.add(source);
		}
	});
	return { heatOf, rematches };
}
