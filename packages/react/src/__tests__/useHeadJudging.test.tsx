import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ride } from "@heatboard/core";
import { useHeadJudging } from "../index";
import {
	actAsync,
	makeHeadJudgeBracket,
	makeHeadServer,
	sequence,
	type FakeHeadServer,
} from "./judging-helpers";

const AT = "2030-01-01T10:05:00.000Z";
const T1 = "2030-01-01T10:01:00.000Z";
const ride = (id: string, riderId: string, at = T1): Ride => ({
	id,
	riderId,
	type: "Wave",
	at,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function settle(ms = 0) {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms);
	});
}

async function setup(server: FakeHeadServer, judgeCount?: number) {
	const createId = sequence("ride");
	const view = renderHook(() =>
		useHeadJudging({
			bracket: makeHeadJudgeBracket(),
			heatId: "h1",
			server,
			createId,
			now: () => AT,
			syncIntervalMs: 5000,
			...(judgeCount !== undefined && { judgeCount }),
		}),
	);
	await settle();
	return view;
}

describe("useHeadJudging", () => {
	it("announces a ride dated now and sends the whole list", async () => {
		const server = makeHeadServer();
		const { result } = await setup(server);
		expect(result.current.status).toBe("synced");
		let id: string | null = null;
		await actAsync(() => {
			id = result.current.announceRide({
				riderId: "r1",
				type: "Jump",
				figure: "B",
			});
		});
		await settle();
		expect(id).toBe("ride1");
		expect(server.saveRides).toHaveBeenLastCalledWith("h1", [
			{ id: "ride1", riderId: "r1", type: "Jump", figure: "B", at: AT },
		]);
		expect(result.current.rides.map((r) => r.id)).toEqual(["ride1"]);
		expect(result.current.status).toBe("synced");
	});

	it("retracts a ride together with every judge's scores on it", async () => {
		const server = makeHeadServer({
			rides: [ride("a", "r1"), ride("b", "r2")],
			scores: [
				{ rideId: "a", judgeId: "j1", value: 5, at: T1 },
				{ rideId: "a", judgeId: "j2", value: null, at: T1 },
				{ rideId: "b", judgeId: "j1", value: 6, at: T1 },
			],
		});
		const { result } = await setup(server);
		expect(result.current.scores).toHaveLength(3);
		await actAsync(() => {
			expect(result.current.retractRide("a")).toBe(true);
		});
		await settle();
		expect(result.current.rides.map((r) => r.id)).toEqual(["b"]);
		expect(result.current.scores.map((s) => s.rideId)).toEqual(["b"]);
		expect(server.remote.scores.map((s) => s.rideId)).toEqual(["b"]);
		expect(result.current.retractRide("a")).toBe(false);
	});

	it("reports the progress of each ride", async () => {
		const server = makeHeadServer({
			rides: [ride("a", "r1")],
			scores: [
				{ rideId: "a", judgeId: "j1", value: 5, at: T1 },
				{ rideId: "a", judgeId: "j2", value: 6, at: T1 },
				{ rideId: "a", judgeId: "j3", value: null, at: T1 },
			],
		});
		const { result } = await setup(server);
		expect(result.current.progress["a"]).toEqual({
			noted: 2,
			unseen: 1,
			judges: 3,
		});
	});

	it("uses the judge count when the host gives it", async () => {
		const server = makeHeadServer({
			rides: [ride("a", "r1")],
			scores: [{ rideId: "a", judgeId: "j1", value: 5, at: T1 }],
		});
		const { result } = await setup(server, 3);
		expect(result.current.progress["a"]?.judges).toBe(3);
	});

	it("receives scores through subscribe", async () => {
		const server = makeHeadServer({ rides: [ride("a", "r1")] });
		const { result } = await setup(server);
		await act(async () => {
			server.push((remote) =>
				remote.scores.push({ rideId: "a", judgeId: "j1", value: 7, at: T1 }),
			);
			await Promise.resolve();
		});
		expect(result.current.scores).toHaveLength(1);
	});

	it("applies a subscribe notification received during a save without waiting for the tick", async () => {
		const server = makeHeadServer();
		const { result } = await setup(server);
		let release = () => {};
		server.saveRides.mockImplementationOnce(
			(_heatId, rides) =>
				new Promise<void>((resolve) => {
					release = () => {
						server.remote.rides = [...server.remote.rides, ...rides];
						resolve();
					};
				}),
		);
		await actAsync(() => {
			result.current.announceRide({ riderId: "r1", type: "Wave" });
		});
		await act(async () => {
			server.push((remote) =>
				remote.scores.push({
					rideId: "ride1",
					judgeId: "j1",
					value: 7,
					at: T1,
				}),
			);
			await Promise.resolve();
		});
		expect(result.current.scores).toHaveLength(0);
		await act(async () => {
			release();
			await Promise.resolve();
		});
		await settle();
		expect(result.current.scores).toHaveLength(1);
	});

	it("pulls on the next tick after a failed save, keeping the local rides", async () => {
		const server = makeHeadServer();
		const { result } = await setup(server);
		server.failing.value = "network";
		await actAsync(() => {
			result.current.announceRide({ riderId: "r1", type: "Wave" });
		});
		await settle();
		expect(result.current.status).toBe("diverged");
		server.remote.scores = [
			{ rideId: "ride1", judgeId: "j1", value: 7, at: T1 },
		];
		await settle(5000);
		expect(result.current.scores).toHaveLength(1);
		expect(result.current.rides.map((r) => r.id)).toEqual(["ride1"]);
		expect(result.current.status).toBe("diverged");
	});

	it("turns diverged on a failed save then retries, and stops once revoked", async () => {
		const server = makeHeadServer();
		const { result } = await setup(server);
		server.failing.value = "network";
		await actAsync(() => {
			result.current.announceRide({ riderId: "r1", type: "Wave" });
		});
		await settle();
		expect(result.current.status).toBe("diverged");
		server.failing.value = false;
		await settle(5000);
		expect(result.current.status).toBe("synced");
		expect(server.remote.rides).toHaveLength(1);

		server.failing.value = "revoked";
		await actAsync(() => {
			result.current.announceRide({ riderId: "r2", type: "Wave" });
		});
		await settle();
		expect(result.current.status).toBe("revoked");
		expect(result.current.canEdit).toBe(false);
		expect(
			result.current.announceRide({ riderId: "r3", type: "Wave" }),
		).toBeNull();
	});
});
