import type { Penalty, Ride, Score, ScoringConfig } from "../model";

export const config = (extra: Partial<ScoringConfig> = {}): ScoringConfig => ({
	method: "points",
	scale: { min: 0, max: 10, step: 0.1 },
	categories: [{ type: "wave", counted: 2 }],
	aggregation: "mean",
	...extra,
});

export const halfStepScale = { min: 0, max: 10, step: 0.5 };

let clock = 0;
const stamp = () => new Date(Date.UTC(2026, 0, 1, 0, 0, clock++)).toISOString();

export function ride(
	id: string,
	riderId: string,
	type = "wave",
	extra: Partial<Ride> = {},
): Ride {
	return { id, riderId, type, at: stamp(), ...extra };
}

export function score(
	rideId: string,
	judgeId: string,
	value: number,
	at = stamp(),
): Score {
	return { rideId, judgeId, value, at };
}

/** One ride per judge and entry: `notes[i][j]` is the note of judge j+1 on its own i-th ride. */
export function scored(
	riderId: string,
	type: string,
	notes: number[][],
	prefix = riderId + type,
): { rides: Ride[]; scores: Score[] } {
	const rides: Ride[] = [];
	const scores: Score[] = [];
	notes.forEach((perJudge, i) => {
		perJudge.forEach((v, j) => {
			const id = `${prefix}${i}-j${j + 1}`;
			rides.push(ride(id, riderId, type));
			scores.push(score(id, `j${j + 1}`, v));
		});
	});
	return { rides, scores };
}

/** Rides created and scored by a single judge. */
export function byJudge(
	judgeId: string,
	riderId: string,
	type: string,
	values: number[],
): { rides: Ride[]; scores: Score[] } {
	const rides: Ride[] = [];
	const scores: Score[] = [];
	values.forEach((v, i) => {
		const id = `${judgeId}-${riderId}-${type}${i}`;
		rides.push(ride(id, riderId, type));
		scores.push(score(id, judgeId, v));
	});
	return { rides, scores };
}

export function merge(...parts: Array<{ rides: Ride[]; scores: Score[] }>) {
	return {
		rides: parts.flatMap((p) => p.rides),
		scores: parts.flatMap((p) => p.scores),
	};
}

export const penalty = (
	riderId: string,
	kind: Penalty["kind"],
	type = "wave",
): Penalty => ({ riderId, type, kind });
