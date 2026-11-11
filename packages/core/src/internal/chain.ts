import type { Bracket, RaceChain } from "../model";

/** Returns the bracket with `chain` stored, or without any chain when it is empty; same reference when nothing changes. */
export function withChain(bracket: Bracket, chain: RaceChain): Bracket {
	const empty =
		chain.pause === undefined &&
		chain.break === undefined &&
		chain.waiting === undefined;
	if (empty) {
		if (bracket.chain === undefined) return bracket;
		const rest = { ...bracket };
		delete rest.chain;
		return rest;
	}
	return { ...bracket, chain };
}
