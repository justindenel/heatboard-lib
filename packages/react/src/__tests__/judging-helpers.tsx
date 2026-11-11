import type { Bracket, Ride, ScoringConfig, Score } from "@heatboard/core";
import { scoringPresets } from "@heatboard/core";
import { act } from "@testing-library/react";
import { vi, type Mock } from "vitest";
import {
	JudgingRevokedError,
	type JudgeNotes,
	type JudgingServer,
} from "../index";
import { makeRaceBracket } from "./admin-helpers";

export const STARTED_AT = "2030-01-01T10:00:00.000Z";

/** The wave scoring ranked by placings, for tests of the secondary method. */
export const placingsWave: ScoringConfig = {
	...scoringPresets.windsurfWave,
	method: "placings",
	priorityType: "Wave",
};

/** Heat h1 (Ann, Bob, Cy) running with the windsurf wave scoring and a 12 minute round. */
export function makeScoredBracket(overrides: Partial<Bracket> = {}): Bracket {
	const base = makeRaceBracket({
		status: "running",
		scoring: scoringPresets.windsurfWave,
		...overrides,
	});
	const [round, ...rest] = base.rounds;
	const [heat, ...heats] = round!.heats;
	return {
		...base,
		timing: { heatDurationSec: 720 },
		rounds: [
			{
				...round!,
				heats: [
					{ ...heat!, status: "running", startedAt: STARTED_AT },
					...heats,
				],
			},
			...rest,
		],
	};
}

export interface FakeServer extends JudgingServer {
	remote: { notes: JudgeNotes };
	failing: { value: false | "network" | "revoked" };
	load: Mock<JudgingServer["load"]>;
	save: Mock<JudgingServer["save"]>;
}

export function makeServer(initial: JudgeNotes = { rides: [], scores: [] }) {
	const server = {
		remote: { notes: initial },
		failing: { value: false },
	} as FakeServer;
	server.load = vi.fn<JudgingServer["load"]>(() =>
		Promise.resolve(server.remote.notes),
	);
	server.save = vi.fn<JudgingServer["save"]>((_heatId, _judgeId, notes) => {
		if (server.failing.value === "network") {
			return Promise.reject(new Error("offline"));
		}
		if (server.failing.value === "revoked") {
			return Promise.reject(new JudgingRevokedError());
		}
		server.remote.notes = notes;
		return Promise.resolve();
	});
	return server;
}

export function sequence(prefix = "n"): () => string {
	let n = 0;
	return () => `${prefix}${++n}`;
}

/** `act` for synchronous work whose promise callbacks must settle before the next assertion. */
export async function actAsync(fn: () => void): Promise<void> {
	await act(async () => {
		fn();
		await Promise.resolve();
	});
}

/** Heat h1 running in head-judge mode with the ride means method. */
export function makeHeadJudgeBracket(
	overrides: Partial<Bracket> = {},
): Bracket {
	return makeScoredBracket({
		judgingMode: "headJudge",
		scoring: { ...scoringPresets.windsurfWave, method: "rideMeans" },
		...overrides,
	});
}

export interface FakeHeadServer extends JudgingServer {
	remote: { rides: Ride[]; scores: Score[] };
	failing: { value: false | "network" | "revoked" };
	listeners: Set<() => void>;
	load: Mock<JudgingServer["load"]>;
	save: Mock<JudgingServer["save"]>;
	loadRides: Mock<NonNullable<JudgingServer["loadRides"]>>;
	saveRides: Mock<NonNullable<JudgingServer["saveRides"]>>;
	/** Changes the remote state as another device would, then notifies subscribers. */
	push: (change: (remote: FakeHeadServer["remote"]) => void) => void;
}

/** In-memory server of one heat: shared rides, every judge's scores, scores of vanished rides dropped. */
export function makeHeadServer(
	initial: { rides?: Ride[]; scores?: Score[] } = {},
): FakeHeadServer {
	const server = {
		remote: { rides: initial.rides ?? [], scores: initial.scores ?? [] },
		failing: { value: false },
		listeners: new Set<() => void>(),
	} as FakeHeadServer;
	const failure = (): Error | undefined => {
		if (server.failing.value === "network") return new Error("offline");
		if (server.failing.value === "revoked") return new JudgingRevokedError();
		return undefined;
	};
	const prune = () => {
		const ids = new Set(server.remote.rides.map((r) => r.id));
		server.remote.scores = server.remote.scores.filter((s) =>
			ids.has(s.rideId),
		);
	};
	server.load = vi.fn<JudgingServer["load"]>((_heatId, judgeId) =>
		Promise.resolve({
			rides: server.remote.rides,
			scores: server.remote.scores.filter((s) => s.judgeId === judgeId),
		}),
	);
	server.save = vi.fn<JudgingServer["save"]>((_heatId, judgeId, notes) => {
		const error = failure();
		if (error) return Promise.reject(error);
		server.remote.scores = [
			...server.remote.scores.filter((s) => s.judgeId !== judgeId),
			...notes.scores.filter((s) => s.judgeId === judgeId),
		];
		prune();
		return Promise.resolve();
	});
	server.loadRides = vi.fn(() =>
		Promise.resolve({
			rides: server.remote.rides,
			scores: server.remote.scores,
		}),
	);
	server.saveRides = vi.fn((_heatId: string, rides: Ride[]) => {
		const error = failure();
		if (error) return Promise.reject(error);
		server.remote.rides = rides;
		prune();
		return Promise.resolve();
	});
	server.subscribe = (_heatId, onChange) => {
		server.listeners.add(onChange);
		return () => server.listeners.delete(onChange);
	};
	server.push = (change) => {
		change(server.remote);
		for (const listener of server.listeners) listener();
	};
	return server;
}
