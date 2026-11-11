import { act } from "@testing-library/react";
import type { Bracket } from "@heatboard/core";
import { vi } from "vitest";
import type { BracketController } from "../useBracket";

export function makeBracket(name = "Open"): Bracket {
	return {
		id: "b1",
		name,
		entries: [{ riderId: "r1", displayName: "Rider One" }],
		rounds: [
			{
				id: "round1",
				name: "Round 1",
				group: "main",
				maxPerHeat: 4,
				advancing: 2,
				heats: [{ id: "heat1", status: "pending", slots: [] }],
			},
		],
		links: [],
		status: "draft",
		visibility: "private",
	};
}

export interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason?: unknown) => void;
}

export function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

/** Runs `fn` inside `act`, then lets pending promise callbacks settle. */
export async function flush(fn: () => unknown): Promise<void> {
	await act(async () => {
		fn();
		await Promise.resolve();
	});
}

/** Two rounds: a judged heat with DNF/DSQ/DNS riders, a pending heat, and an empty final. */
export function makeDisplayBracket(): Bracket {
	const names = ["Ann", "Bob", "Cy", "Dee", "Eve", "Fay", "Gus", "Hal"];
	return {
		id: "display",
		name: "Display Open",
		entries: names.map((displayName, i) => ({
			riderId: `r${i + 1}`,
			displayName,
		})),
		rounds: [
			{
				id: "round1",
				name: "Round 1",
				group: "main",
				maxPerHeat: 4,
				advancing: 2,
				heats: [
					{
						id: "h1",
						status: "judged",
						needsReview: true,
						slots: [
							{ riderId: "r1", rank: 1 },
							{ riderId: "r2", rank: 2 },
							{ riderId: "r3", rank: null, status: "DNF" },
							{ riderId: "r4", rank: null, status: "DSQ" },
						],
					},
					{
						id: "h2",
						name: "Special heat",
						status: "pending",
						slots: [
							{ riderId: "r5", rank: null },
							{ riderId: "r6", rank: null, status: "DNS" },
						],
					},
				],
			},
			{
				id: "round2",
				name: "Final",
				group: "main",
				maxPerHeat: 4,
				advancing: 1,
				heats: [{ id: "h3", status: "pending", slots: [] }],
			},
		],
		links: [],
		status: "running",
		visibility: "public",
	};
}

export function makeController(
	bracket: Bracket = makeDisplayBracket(),
): BracketController {
	return {
		bracket,
		dispatch: vi.fn(),
		canApply: vi.fn(() => ({ ok: true as const, bracket })),
		pending: false,
		error: null,
		clearError: vi.fn(),
	};
}
