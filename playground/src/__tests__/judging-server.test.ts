import { describe, expect, it, vi } from "vitest";
import type { Ride, Score } from "@heatboard/core";
import { createDemoJudgingServer } from "../judging-server";

const at = "2030-01-01T10:00:00.000Z";
const ride = (id: string): Ride => ({ id, riderId: "r01", type: "Wave", at });
const score = (
	rideId: string,
	judgeId: string,
	value: number | null,
): Score => ({
	rideId,
	judgeId,
	value,
	at,
});

describe("demo judging server in head-judge mode", () => {
	it("serves the shared rides with the scores of the asking judge only", async () => {
		const server = createDemoJudgingServer("headJudge", 0);
		await server.saveRides?.("h", [ride("a")]);
		await server.save("h", "j1", { rides: [], scores: [score("a", "j1", 5)] });
		await server.save("h", "j2", {
			rides: [],
			scores: [score("a", "j2", null)],
		});
		expect(await server.load("h", "j1")).toEqual({
			rides: [ride("a")],
			scores: [score("a", "j1", 5)],
		});
		expect((await server.loadRides?.("h"))?.scores).toHaveLength(2);
	});

	it("ignores rides sent by a judge and scores of unknown rides", async () => {
		const server = createDemoJudgingServer("headJudge", 0);
		await server.saveRides?.("h", [ride("a")]);
		await server.save("h", "j1", {
			rides: [ride("sneaky")],
			scores: [score("a", "j1", 5), score("sneaky", "j1", 9)],
		});
		const heat = await server.loadRides?.("h");
		expect(heat?.rides.map((r) => r.id)).toEqual(["a"]);
		expect(heat?.scores.map((s) => s.rideId)).toEqual(["a"]);
	});

	it("drops every judge's scores of a retracted ride", async () => {
		const server = createDemoJudgingServer("headJudge", 0);
		await server.saveRides?.("h", [ride("a"), ride("b")]);
		await server.save("h", "j1", {
			rides: [],
			scores: [score("a", "j1", 5), score("b", "j1", 6)],
		});
		await server.save("h", "j2", { rides: [], scores: [score("a", "j2", 7)] });
		await server.saveRides?.("h", [ride("b")]);
		expect((await server.loadRides?.("h"))?.scores).toEqual([
			score("b", "j1", 6),
		]);
		expect(server.getSnapshot().heatData("h")?.scores).toEqual([
			score("b", "j1", 6),
		]);
	});

	it("notifies the subscribers of a heat, and only them", async () => {
		const server = createDemoJudgingServer("headJudge", 0);
		const here = vi.fn();
		const elsewhere = vi.fn();
		const store = vi.fn();
		const stop = server.subscribe?.("h", here);
		server.subscribe?.("other", elsewhere);
		server.subscribeSnapshot(store);
		await server.saveRides?.("h", [ride("a")]);
		expect(here).toHaveBeenCalledTimes(1);
		expect(elsewhere).not.toHaveBeenCalled();
		expect(store).toHaveBeenCalledTimes(1);
		stop?.();
		await server.save("h", "j1", { rides: [], scores: [score("a", "j1", 5)] });
		expect(here).toHaveBeenCalledTimes(1);
	});
});

describe("demo judging server in free mode", () => {
	it("keeps each judge's own notes", async () => {
		const server = createDemoJudgingServer("free", 0);
		await server.save("h", "j1", {
			rides: [ride("a")],
			scores: [score("a", "j1", 5)],
		});
		expect((await server.load("h", "j2")).rides).toEqual([]);
		expect(server.getSnapshot().heatData("h")?.rides).toEqual([ride("a")]);
	});
});
