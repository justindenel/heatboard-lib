import {
	buildFromFormat,
	formatFromPlan,
	type Entry,
	type FormatNames,
	type FormatPlacement,
	type FormatPlan,
	type FormatSettings,
	type Link,
} from "@heatboard/core";

/** Bounds the placeholder entries of a build made only to read its links. */
const MAX_RIDERS = 5000;

export interface PlacementAssign {
	lane: "main" | "repechage";
	/** 0-based heat of the source round. */
	heat: number;
	rank: number;
	/** 0-based heat of the target round. */
	target: number;
}

/** How the qualifiers of round `round - 1` (and of its repechage) reach the heats of round `round`. */
export interface PlacementTransition {
	round: number;
	sourceHeats: number;
	repechageHeats: number;
	targetHeats: number;
	branch: PlacementAssign[];
	spread: PlacementAssign[];
	/** Whether choosing branch or spread changes where somebody goes. */
	differs: boolean;
	/** Qualifiers from the repechage of the previous round arrive in this round. */
	hasRepechage: boolean;
}

const splitHeatId = (heatId: string) => {
	const cut = heatId.lastIndexOf("-");
	return {
		key: heatId.slice(0, cut),
		index: Number(heatId.slice(cut + 1)) - 1,
	};
};

const mainKeys = (format: FormatSettings) =>
	format.rounds
		.filter((r) => (r.group ?? "main") === "main" && r.optional !== true)
		.map((r) => r.key);

function assignsOf(
	plan: FormatPlan,
	format: FormatSettings,
	links: readonly Link[],
	sizes: Record<string, number[]>,
): Map<number, PlacementAssign[]> {
	const keys = mainKeys(format);
	const result = new Map<number, PlacementAssign[]>();
	for (let i = 1; i < keys.length; i++) result.set(i, []);
	const indexOfKey = new Map(keys.map((key, i) => [key, i]));
	for (const link of links) {
		if (link.to === "eliminated") continue;
		const to = splitHeatId(link.to.heatId);
		const target = indexOfKey.get(to.key);
		if (target === undefined || target < 1) continue;
		const from = splitHeatId(link.from.heatId);
		const source = plan.rounds[target - 1];
		let lane: PlacementAssign["lane"] | undefined;
		let advance = 0;
		if (from.key === keys[target - 1]) {
			lane = "main";
			advance = source?.advance ?? 0;
		} else if (from.key === `rep-r${target}`) {
			lane = "repechage";
			advance = source?.repechage?.advance ?? 0;
		}
		if (lane === undefined) continue;
		const size = sizes[from.key]?.[from.index] ?? 0;
		if (link.from.rank > advance || link.from.rank > size) continue;
		result.get(target)?.push({
			lane,
			heat: from.index,
			rank: link.from.rank,
			target: to.index,
		});
	}
	return result;
}

function linksFor(
	plan: FormatPlan,
	names: Partial<FormatNames>,
	placement: FormatPlacement,
) {
	const forced: FormatPlan = {
		...plan,
		rounds: plan.rounds.map((round) => ({ ...round, placement })),
	};
	const format = formatFromPlan(forced, names);
	const count = Math.max(0, Math.min(Math.floor(plan.riders), MAX_RIDERS));
	const entries: Entry[] = Array.from({ length: count }, (_, i) => ({
		riderId: `p${i + 1}`,
		displayName: `p${i + 1}`,
	}));
	const built = buildFromFormat({ entries, rounds: [] }, format, 0);
	return built.ok ? assignsOf(plan, format, built.links, built.sizes) : null;
}

const sameAssigns = (a: PlacementAssign[], b: PlacementAssign[]) => {
	const key = (x: PlacementAssign) =>
		`${x.lane}:${x.heat}:${x.rank}>${x.target}`;
	const left = a.map(key).sort();
	const right = b.map(key).sort();
	return left.length === right.length && left.every((k, i) => k === right[i]);
};

/** One entry per round after the first, with the links built under both placements. */
export function placementStudy(
	plan: FormatPlan,
	names: Partial<FormatNames> = {},
): PlacementTransition[] {
	if (plan.rounds.length < 2) return [];
	const branch = linksFor(plan, names, "branch");
	const spread = linksFor(plan, names, "spread");
	if (!branch || !spread) return [];
	const transitions: PlacementTransition[] = [];
	for (let round = 1; round < plan.rounds.length; round++) {
		const source = plan.rounds[round - 1];
		const target = plan.rounds[round];
		if (!source || !target) continue;
		const b = branch.get(round) ?? [];
		const s = spread.get(round) ?? [];
		transitions.push({
			round,
			sourceHeats: source.heats,
			repechageHeats: source.repechage?.heats ?? 0,
			targetHeats: target.heats,
			branch: b,
			spread: s,
			differs: !sameAssigns(b, s),
			hasRepechage: b.some((a) => a.lane === "repechage"),
		});
	}
	return transitions;
}

/**
 * The transition the explanation zooms on: the first where the placement
 * changes something, else the first receiving repechage qualifiers, else the
 * first with several target heats.
 */
export function focusTransition(
	transitions: readonly PlacementTransition[],
): PlacementTransition | undefined {
	return (
		transitions.find((t) => t.differs) ??
		transitions.find((t) => t.targetHeats >= 2 && t.hasRepechage) ??
		transitions.find((t) => t.targetHeats >= 2)
	);
}
