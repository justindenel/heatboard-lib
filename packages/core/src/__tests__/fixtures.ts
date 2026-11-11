import { expect } from "vitest";
import { applyAction, type Action } from "../actions";
import type { BracketOptions } from "../options";
import type {
	Bracket,
	BracketStatus,
	Entry,
	Heat,
	HeatSlot,
	Link,
	ParticipantStatus,
	Round,
	Visibility,
} from "../model";

export type SlotSpec =
	string | { id: string; rank?: number; status?: ParticipantStatus };

export function heat(
	id: string,
	slots: SlotSpec[] = [],
	extra: Partial<Heat> = {},
): Heat {
	return {
		id,
		status: "pending",
		slots: slots.map((spec): HeatSlot => {
			if (typeof spec === "string") return { riderId: spec, rank: null };
			const slot: HeatSlot = { riderId: spec.id, rank: spec.rank ?? null };
			if (spec.status) slot.status = spec.status;
			return slot;
		}),
		...extra,
	};
}

export function round(
	id: string,
	heats: Heat[],
	extra: Partial<Round> = {},
): Round {
	return {
		id,
		name: id,
		group: "main",
		maxPerHeat: 4,
		advancing: 2,
		heats,
		...extra,
	};
}

/** Builds a bracket; entries default to every rider found in a slot. */
export function bracket(
	rounds: Round[],
	extra: {
		links?: Link[];
		entries?: Entry[];
		status?: BracketStatus;
		visibility?: Visibility;
	} = {},
): Bracket {
	const ids = new Set<string>();
	for (const r of rounds)
		for (const h of r.heats) for (const s of h.slots) ids.add(s.riderId);
	const entries =
		extra.entries ??
		[...ids].map((riderId) => ({ riderId, displayName: riderId }));
	return {
		id: "b",
		name: "Bracket",
		entries,
		rounds,
		links: extra.links ?? [],
		status: extra.status ?? "draft",
		visibility: extra.visibility ?? "private",
	};
}

export function link(heatId: string, rank: number, to: string): Link {
	return {
		from: { heatId, rank },
		to: to === "eliminated" ? ("eliminated" as const) : { heatId: to },
	};
}

/** Two heats of four feeding a semi, then a final. */
export function sampleBracket(status?: BracketStatus): Bracket {
	return bracket(
		[
			round("r1", [
				heat("h1", ["a", "b", "c", "d"]),
				heat("h2", ["e", "f", "g", "h"]),
			]),
			round("r2", [heat("h3")]),
			round("r3", [heat("h4")]),
		],
		{
			links: [
				link("h1", 1, "h3"),
				link("h1", 2, "h3"),
				link("h1", 3, "eliminated"),
				link("h2", 1, "h3"),
				link("h2", 2, "h3"),
				link("h3", 1, "h4"),
				link("h3", 2, "h4"),
			],
			entries: [
				..."abcdefgh"
					.split("")
					.map((riderId) => ({ riderId, displayName: riderId })),
				{ riderId: "seed", displayName: "seed", entryRoundId: "r2" },
			],
			...(status ? { status } : {}),
		},
	);
}

export function run(b: Bracket, action: Action, options: BracketOptions = {}) {
	const before = structuredClone(b);
	const result = applyAction(b, action, options);
	expect(b).toEqual(before);
	return result;
}

export function okBracket(
	b: Bracket,
	action: Action,
	options: BracketOptions = {},
): Bracket {
	const result = run(b, action, options);
	if (!result.ok) throw new Error(result.error.message);
	return result.bracket;
}

export function errorCode(
	b: Bracket,
	action: Action,
	options: BracketOptions = {},
) {
	const result = run(b, action, options);
	return result.ok ? "ok" : result.error.code;
}

/** Ranks the riders of a heat in the given order without going through actions, which only rank running heats. */
export function withRanks(
	b: Bracket,
	heatId: string,
	riderIds: string[],
): Bracket {
	return {
		...b,
		rounds: b.rounds.map((r) => ({
			...r,
			heats: r.heats.map((h) =>
				h.id === heatId
					? {
							...h,
							slots: h.slots.map((s) => ({
								...s,
								rank: riderIds.indexOf(s.riderId) + 1 || null,
							})),
						}
					: h,
			),
		})),
	};
}

/** Puts a rider in a heat (a heat with no rider cannot start). */
export function withRider(
	b: Bracket,
	heatId: string,
	riderId = "seed",
): Bracket {
	return {
		...b,
		rounds: b.rounds.map((r) => ({
			...r,
			heats: r.heats.map((h) =>
				h.id === heatId
					? { ...h, slots: [...h.slots, { riderId, rank: null }] }
					: h,
			),
		})),
	};
}

/** Walks a heat through running, judged and (optionally) locked, ranking it first. */
export function advanceHeat(
	b: Bracket,
	heatId: string,
	final: "running" | "judged" | "locked",
): Bracket {
	const path = { running: 1, judged: 2, locked: 3 }[final];
	let current =
		b.status === "draft" ? { ...b, status: "published" as const } : b;
	for (const status of (["running", "judged", "locked"] as const).slice(
		0,
		path,
	)) {
		current = okBracket(current, { type: "setHeatStatus", heatId, status });
		if (status === "running" && path > 1) {
			current = okBracket(current, { type: "rankByPosition", heatId });
		}
	}
	return current;
}
