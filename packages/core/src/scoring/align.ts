import { fromCents } from "./cents";
import type {
	AlignedGroup,
	AlignedNote,
	AlignedRider,
	Ride,
	Score,
	ScoringConfig,
} from "./model";
import { compareAt, sanitize } from "./validate";

export const DEFAULT_ALIGN_WINDOW_SEC = 30;

interface Note {
	judgeId: string;
	rideId: string;
	type: string;
	at: string;
	time: number;
	cents: number;
	figure: string | undefined;
}

interface Group {
	type: string;
	notes: Note[];
	time: number;
}

const timeKey = (time: number) => (Number.isFinite(time) ? time : Infinity);

function makeGroup(type: string, notes: Note[]): Group {
	const times = notes.map((n) => n.time);
	return {
		type,
		notes,
		time: times.reduce((a, b) => a + b, 0) / times.length,
	};
}

function sortGroups(groups: Group[]): Group[] {
	return groups.sort((a, b) => {
		const ta = timeKey(a.time);
		const tb = timeKey(b.time);
		return ta < tb ? -1 : ta > tb ? 1 : 0;
	});
}

/**
 * Order-preserving alignment (Needleman-Wunsch) of one judge's notes onto the current groups.
 * A note may only join a group of its type within `maxGapMs`; the cost of a match is the time gap
 * and leaving a note or a group alone costs `maxGapMs`, so close notes are preferred to be merged.
 */
function alignJudge(groups: Group[], notes: Note[], maxGapMs: number): Group[] {
	const n = groups.length;
	const m = notes.length;
	const cost: number[][] = Array.from({ length: n + 1 }, () =>
		new Array<number>(m + 1).fill(0),
	);
	const op: Array<Array<"match" | "group" | "note">> = Array.from(
		{ length: n + 1 },
		() => new Array<"match" | "group" | "note">(m + 1).fill("group"),
	);
	for (let i = 1; i <= n; i++) {
		cost[i]![0] = i * maxGapMs;
		op[i]![0] = "group";
	}
	for (let j = 1; j <= m; j++) {
		cost[0]![j] = j * maxGapMs;
		op[0]![j] = "note";
	}
	for (let i = 1; i <= n; i++) {
		for (let j = 1; j <= m; j++) {
			const group = groups[i - 1]!;
			const note = notes[j - 1]!;
			let best = cost[i - 1]![j]! + maxGapMs;
			let chosen: "match" | "group" | "note" = "group";
			const alone = cost[i]![j - 1]! + maxGapMs;
			if (alone < best) {
				best = alone;
				chosen = "note";
			}
			const gap = Math.abs(group.time - note.time);
			if (group.type === note.type && gap <= maxGapMs) {
				const joined = cost[i - 1]![j - 1]! + gap;
				if (joined <= best) {
					best = joined;
					chosen = "match";
				}
			}
			cost[i]![j] = best;
			op[i]![j] = chosen;
		}
	}

	const result: Group[] = [];
	let i = n;
	let j = m;
	while (i > 0 || j > 0) {
		const chosen = op[i]![j]!;
		if (chosen === "match") {
			const group = groups[i - 1]!;
			result.push(makeGroup(group.type, [...group.notes, notes[j - 1]!]));
			i--;
			j--;
		} else if (chosen === "group") {
			result.push(groups[i - 1]!);
			i--;
		} else {
			const note = notes[j - 1]!;
			result.push(makeGroup(note.type, [note]));
			j--;
		}
	}
	return sortGroups(result.reverse());
}

function describe(group: Group, totalJudges: number): AlignedGroup {
	const counts = new Map<string, number>();
	for (const note of group.notes) {
		if (note.figure === undefined) continue;
		counts.set(note.figure, (counts.get(note.figure) ?? 0) + 1);
	}
	const top = Math.max(0, ...counts.values());
	const leaders = [...counts].filter(([, count]) => count === top);
	const figure = leaders.length === 1 ? leaders[0]![0] : undefined;
	const sum = group.notes.reduce((acc, note) => acc + note.cents, 0);
	const notes: AlignedNote[] = group.notes.map((note) => ({
		judgeId: note.judgeId,
		rideId: note.rideId,
		value: fromCents(note.cents),
		...(note.figure === undefined ? {} : { figure: note.figure }),
	}));
	return {
		type: group.type,
		at: Number.isFinite(group.time)
			? new Date(Math.round(group.time)).toISOString()
			: group.notes[0]!.at,
		notes,
		mean: fromCents(Math.round(sum / group.notes.length)),
		judges: group.notes.length,
		of: totalJudges,
		...(figure === undefined ? {} : { figure }),
		figureAgreement: counts.size <= 1,
		complete: group.notes.length === totalJudges,
	};
}

/**
 * Best-effort grouping of the notes the judges gave to the same move of a rider, for display only:
 * ranking never depends on it. The judge with the most notes for a rider is the reference; the
 * others are aligned onto it one by one (see `alignJudge`). Deterministic for a given input.
 */
export function alignRides(
	config: ScoringConfig,
	rides: Ride[],
	scores: Score[],
	options: { riderIds?: string[] } = {},
): AlignedRider[] {
	const riderIds = options.riderIds ?? [
		...new Set(rides.map((ride) => ride.riderId)),
	];
	const input = sanitize(config, riderIds, rides, scores);
	const scoreByRide = new Map(input.scores.map((s) => [s.rideId, s]));
	const totalJudges = new Set(input.scores.map((s) => s.judgeId)).size;
	const maxGapMs = (config.alignWindowSec ?? DEFAULT_ALIGN_WINDOW_SEC) * 1000;

	return riderIds.map((riderId) => {
		const byJudge = new Map<string, Note[]>();
		for (const ride of input.rides) {
			const score = scoreByRide.get(ride.id);
			if (ride.riderId !== riderId || !score) continue;
			const list = byJudge.get(score.judgeId) ?? [];
			list.push({
				judgeId: score.judgeId,
				rideId: ride.id,
				type: ride.type,
				at: ride.at,
				time: Date.parse(ride.at),
				cents: score.cents,
				figure: ride.figure,
			});
			byJudge.set(score.judgeId, list);
		}
		const judges = [...byJudge.values()].map((notes) =>
			notes.sort(
				(a, b) => compareAt(a.at, b.at) || (a.rideId < b.rideId ? -1 : 1),
			),
		);
		judges.sort(
			(a, b) =>
				b.length - a.length ||
				compareAt(a[0]!.at, b[0]!.at) ||
				(a[0]!.judgeId < b[0]!.judgeId ? -1 : 1),
		);
		const [reference, ...others] = judges;
		let groups = (reference ?? []).map((note) => makeGroup(note.type, [note]));
		for (const notes of others) groups = alignJudge(groups, notes, maxGapMs);
		return { riderId, groups: groups.map((g) => describe(g, totalJudges)) };
	});
}
