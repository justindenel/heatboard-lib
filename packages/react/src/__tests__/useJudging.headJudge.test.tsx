import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ride } from "@heatboard/core";
import { useJudging } from "../index";
import {
	actAsync,
	makeScoredBracket,
	makeHeadJudgeBracket,
	makeHeadServer,
	type FakeHeadServer,
} from "./judging-helpers";

const AT = "2030-01-01T10:05:00.000Z";
const ride = (id: string, riderId: string, at: string, extra = {}): Ride => ({
	id,
	riderId,
	type: "Wave",
	at,
	...extra,
});
const T1 = "2030-01-01T10:01:00.000Z";
const T2 = "2030-01-01T10:02:00.000Z";
const T3 = "2030-01-01T10:03:00.000Z";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function settle(ms = 0) {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms);
	});
}

async function setup(server: FakeHeadServer, judgeId = "j1") {
	const view = renderHook(() =>
		useJudging({
			bracket: makeHeadJudgeBracket(),
			heatId: "h1",
			judgeId,
			server,
			now: () => AT,
			syncIntervalMs: 5000,
		}),
	);
	await settle();
	return view;
}

describe("useJudging in head-judge mode", () => {
	it("queues the announced rides without a score here, oldest first", async () => {
		const server = makeHeadServer({
			rides: [ride("c", "r3", T3), ride("a", "r1", T1), ride("b", "r2", T2)],
			scores: [{ rideId: "b", judgeId: "j1", value: 5, at: T2 }],
		});
		const { result } = await setup(server);
		expect(result.current.mode).toBe("headJudge");
		expect(result.current.queue.map((r) => r.id)).toEqual(["a", "c"]);
	});

	it("saves only its own scores and takes the ride out of the queue", async () => {
		const server = makeHeadServer({ rides: [ride("a", "r1", T1)] });
		const { result } = await setup(server);
		await actAsync(() => {
			expect(result.current.scoreRide("a", 7.5)).toBe(true);
		});
		await settle();
		expect(server.save).toHaveBeenLastCalledWith("h1", "j1", {
			rides: [],
			scores: [{ rideId: "a", judgeId: "j1", value: 7.5, at: AT }],
		});
		expect(result.current.queue).toEqual([]);
		expect(result.current.status).toBe("synced");
	});

	it("marks a ride as not seen with a null score", async () => {
		const server = makeHeadServer({ rides: [ride("a", "r1", T1)] });
		const { result } = await setup(server);
		await actAsync(() => {
			result.current.markUnseen("a");
		});
		await settle();
		expect(server.remote.scores).toEqual([
			{ rideId: "a", judgeId: "j1", value: null, at: AT },
		]);
		expect(result.current.queue).toEqual([]);
	});

	it("edits an existing score, to another value and to and from not seen", async () => {
		const server = makeHeadServer({ rides: [ride("a", "r1", T1)] });
		const { result } = await setup(server);
		for (const value of [6, null, 8]) {
			await actAsync(() => {
				result.current.scoreRide("a", value);
			});
			await settle();
			expect(server.remote.scores).toHaveLength(1);
			expect(server.remote.scores[0]?.value).toBe(value);
		}
	});

	it("refuses rides it does not know and creating notes of its own", async () => {
		const server = makeHeadServer({ rides: [ride("a", "r1", T1)] });
		const { result } = await setup(server);
		expect(result.current.scoreRide("zzz", 5)).toBe(false);
		expect(
			result.current.addNote({ riderId: "r1", type: "Wave", value: 5 }),
		).toBeNull();
	});

	it("receives a ride announced later at once through subscribe", async () => {
		const server = makeHeadServer();
		const { result } = await setup(server);
		expect(result.current.queue).toEqual([]);
		await act(async () => {
			server.push((remote) => remote.rides.push(ride("a", "r1", T1)));
			await Promise.resolve();
		});
		expect(result.current.queue.map((r) => r.id)).toEqual(["a"]);
	});

	it("applies a subscribe notification received during a save without waiting for the tick", async () => {
		const server = makeHeadServer({ rides: [ride("a", "r1", T1)] });
		const { result } = await setup(server);
		let release = () => {};
		server.save.mockImplementationOnce(
			(_heatId, _judgeId, notes) =>
				new Promise<void>((resolve) => {
					release = () => {
						server.remote.scores = notes.scores;
						resolve();
					};
				}),
		);
		await actAsync(() => {
			result.current.scoreRide("a", 5);
		});
		await act(async () => {
			server.push((remote) => remote.rides.push(ride("b", "r2", T2)));
			await Promise.resolve();
		});
		expect(result.current.queue.map((r) => r.id)).toEqual([]);
		await act(async () => {
			release();
			await Promise.resolve();
		});
		await settle();
		expect(result.current.queue.map((r) => r.id)).toEqual(["b"]);
	});

	it("pulls on the next tick after a failed save, keeping the local scores", async () => {
		const server = makeHeadServer({ rides: [ride("a", "r1", T1)] });
		const { result } = await setup(server);
		server.failing.value = "network";
		await actAsync(() => {
			result.current.scoreRide("a", 5);
		});
		await settle();
		expect(result.current.status).toBe("diverged");
		server.remote.rides = [ride("a", "r1", T1), ride("b", "r2", T2)];
		await settle(5000);
		expect(result.current.queue.map((r) => r.id)).toEqual(["b"]);
		expect(result.current.status).toBe("diverged");
		server.failing.value = false;
		await settle(5000);
		expect(result.current.status).toBe("synced");
		expect(server.remote.scores).toHaveLength(1);
	});

	it("falls back to the periodic reload without subscribe", async () => {
		const server = makeHeadServer();
		delete (server as { subscribe?: unknown }).subscribe;
		const { result } = await setup(server);
		server.remote.rides = [ride("a", "r1", T1)];
		await settle(5000);
		expect(result.current.queue.map((r) => r.id)).toEqual(["a"]);
	});

	it("drops the scores of a ride that was retracted", async () => {
		const server = makeHeadServer({
			rides: [ride("a", "r1", T1), ride("b", "r2", T2)],
			scores: [
				{ rideId: "a", judgeId: "j1", value: 5, at: T1 },
				{ rideId: "b", judgeId: "j1", value: 6, at: T2 },
			],
		});
		const { result } = await setup(server);
		expect(result.current.notes.scores).toHaveLength(2);
		await act(async () => {
			server.push((remote) => {
				remote.rides = remote.rides.filter((r) => r.id !== "a");
				remote.scores = remote.scores.filter((s) => s.rideId !== "a");
			});
			await Promise.resolve();
		});
		expect(result.current.notes.rides.map((r) => r.id)).toEqual(["b"]);
		expect(result.current.notes.scores.map((s) => s.rideId)).toEqual(["b"]);
	});
});

describe("useJudging in free mode", () => {
	it("has no queue and refuses scoreRide", async () => {
		const server = makeHeadServer();
		const { result } = renderHook(() =>
			useJudging({
				bracket: makeScoredBracket(),
				heatId: "h1",
				judgeId: "j1",
				server,
			}),
		);
		await settle();
		expect(result.current.mode).toBe("free");
		expect(result.current.queue).toEqual([]);
		expect(result.current.scoreRide("a", 5)).toBe(false);
	});
});
