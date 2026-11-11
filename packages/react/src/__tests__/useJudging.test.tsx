import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useJudging, type UseJudgingParams } from "../index";
import {
	actAsync,
	makeScoredBracket,
	makeServer,
	sequence,
	type FakeServer,
} from "./judging-helpers";

const AT = "2030-01-01T10:05:00.000Z";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function settle(ms = 0) {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms);
	});
}

async function setup(
	server: FakeServer = makeServer(),
	extra: Partial<UseJudgingParams> = {},
) {
	const createId = sequence();
	const view = renderHook(() =>
		useJudging({
			bracket: makeScoredBracket(),
			heatId: "h1",
			judgeId: "j1",
			server,
			createId,
			now: () => AT,
			...extra,
		}),
	);
	await settle();
	return { ...view, server };
}

describe("useJudging notes", () => {
	it("adds, edits, deletes and undoes notes, sending the full set each time", async () => {
		const { result, server } = await setup();
		expect(result.current.status).toBe("synced");
		expect(result.current.canEdit).toBe(true);

		let id: string | null = null;
		await actAsync(() => {
			id = result.current.addNote({ riderId: "r1", type: "Wave", value: 7.5 });
		});
		await settle();
		expect(id).toBe("n1");
		expect(server.save).toHaveBeenLastCalledWith("h1", "j1", {
			rides: [{ id: "n1", riderId: "r1", type: "Wave", at: AT }],
			scores: [{ rideId: "n1", judgeId: "j1", value: 7.5, at: AT }],
		});

		await actAsync(() => {
			result.current.addNote({
				riderId: "r2",
				type: "Jump",
				figure: "B",
				value: 8,
			});
		});
		await settle();
		expect(server.remote.notes.rides.map((r) => r.id)).toEqual(["n1", "n2"]);
		expect(server.remote.notes.rides[1]?.figure).toBe("B");

		await actAsync(() => {
			result.current.editNote("n2", { value: 9, figure: null });
		});
		await settle();
		expect(server.remote.notes.scores[1]?.value).toBe(9);
		expect(server.remote.notes.rides[1]?.figure).toBeUndefined();

		await actAsync(() => {
			expect(result.current.undoLast()).toBe("n2");
		});
		await settle();
		expect(server.remote.notes.rides.map((r) => r.id)).toEqual(["n1"]);

		await actAsync(() => {
			result.current.deleteNote("n1");
		});
		await settle();
		expect(server.remote.notes).toEqual({ rides: [], scores: [] });
		expect(result.current.status).toBe("synced");
	});

	it("computes this judge's standing with the core", async () => {
		const { result } = await setup();
		await actAsync(() => {
			result.current.addNote({ riderId: "r1", type: "Wave", value: 6 });
			result.current.addNote({ riderId: "r2", type: "Wave", value: 8 });
		});
		await settle();
		const { standings } = result.current;
		expect(standings["r2"]?.rank).toBe(1);
		expect(standings["r1"]?.rank).toBe(2);
		expect(standings["r2"]?.total).toBe(8);
	});
});

describe("useJudging sync", () => {
	it("turns diverged on a failed save, then retries on the period", async () => {
		const server = makeServer();
		const { result } = await setup(server, { syncIntervalMs: 5000 });
		server.failing.value = "network";
		await actAsync(() => {
			result.current.addNote({ riderId: "r1", type: "Wave", value: 5 });
		});
		await settle();
		expect(result.current.status).toBe("diverged");
		expect((result.current.error as Error).message).toBe("offline");
		expect(result.current.notes.rides).toHaveLength(1);

		server.failing.value = false;
		await settle(5000);
		expect(result.current.status).toBe("synced");
		expect(result.current.error).toBeNull();
		expect(server.remote.notes.rides).toHaveLength(1);
	});

	it("reloads the remote notes when nothing is pending", async () => {
		const server = makeServer();
		const { result } = await setup(server, { syncIntervalMs: 5000 });
		server.remote.notes = {
			rides: [{ id: "x1", riderId: "r3", type: "Wave", at: AT }],
			scores: [{ rideId: "x1", judgeId: "j1", value: 4, at: AT }],
		};
		await settle(5000);
		expect(result.current.notes.rides.map((r) => r.id)).toEqual(["x1"]);
	});

	it("disables editing and stops sending once the session is revoked", async () => {
		const server = makeServer();
		const { result } = await setup(server, { syncIntervalMs: 5000 });
		server.failing.value = "revoked";
		await actAsync(() => {
			result.current.addNote({ riderId: "r1", type: "Wave", value: 5 });
		});
		await settle();
		expect(result.current.status).toBe("revoked");
		expect(result.current.canEdit).toBe(false);
		expect(result.current.disabledReason).toBe("revoked");
		expect(
			result.current.addNote({ riderId: "r2", type: "Wave", value: 3 }),
		).toBeNull();

		const calls = server.save.mock.calls.length;
		await settle(20000);
		expect(server.save.mock.calls.length).toBe(calls);
	});

	it("refuses notes until the first load and when the heat is not running", async () => {
		const server = makeServer();
		const pending = renderHook(() =>
			useJudging({
				bracket: makeScoredBracket(),
				heatId: "h1",
				judgeId: "j1",
				server,
			}),
		);
		expect(pending.result.current.disabledReason).toBe("loading");
		expect(
			pending.result.current.addNote({
				riderId: "r1",
				type: "Wave",
				value: 5,
			}),
		).toBeNull();
		await settle();
		expect(pending.result.current.disabledReason).toBeNull();

		const idle = renderHook(() =>
			useJudging({
				bracket: makeScoredBracket(),
				heatId: "h2",
				judgeId: "j1",
				server,
			}),
		);
		await settle();
		expect(idle.result.current.disabledReason).toBe("notRunning");
	});
});
