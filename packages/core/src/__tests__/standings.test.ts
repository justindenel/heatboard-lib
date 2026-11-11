import { describe, expect, test } from "vitest";
import { computeStandings } from "../standings";
import { bracket, heat, round, sampleBracket } from "./fixtures";

const places = (list: ReturnType<typeof computeStandings>) =>
	list.map((s) => `${s.riderId}:${s.place}${s.tied ? "=" : ""}`);

const singleElimination = () =>
	bracket([
		round("r1", [
			heat("h1", [
				{ id: "a", rank: 1 },
				{ id: "b", rank: 2 },
				{ id: "c", rank: 3 },
				{ id: "d", rank: 4 },
			]),
			heat("h2", [
				{ id: "e", rank: 1 },
				{ id: "f", rank: 2 },
				{ id: "g", rank: 3 },
				{ id: "h", status: "DNF" },
			]),
		]),
		round("r2", [
			heat("h3", [
				{ id: "a", rank: 1 },
				{ id: "e", rank: 2 },
				{ id: "b", rank: 3 },
				{ id: "f", rank: 4 },
			]),
		]),
		round("r3", [
			heat("h4", [
				{ id: "e", rank: 1 },
				{ id: "a", rank: 2 },
			]),
		]),
	]);

describe("computeStandings", () => {
	test("three-round single elimination, single-heat rounds are distinct, the two-heat round is a tied tier", () => {
		const standings = computeStandings(singleElimination());
		expect(places(standings)).toEqual([
			"e:1",
			"a:2",
			"b:3",
			"f:4",
			"c:5=",
			"g:5=",
			"d:5=",
			"h:5=",
		]);
		expect(standings.find((s) => s.riderId === "h")?.status).toBe("DNF");
		expect(standings.find((s) => s.riderId === "e")?.lastRoundId).toBe("r3");
	});

	test("separateWithinHeat orders tiers by rank then status", () => {
		const standings = computeStandings(singleElimination(), {
			separateWithinHeat: true,
		});
		expect(places(standings)).toEqual([
			"e:1",
			"a:2",
			"b:3",
			"f:4",
			"c:5=",
			"g:5=",
			"d:7",
			"h:8",
		]);
	});

	test("a seed entering at round 2 and eliminated there ranks with that tier", () => {
		const b = sampleBracket();
		b.rounds[0] = {
			...b.rounds[0]!,
			heats: [
				heat("h1", [
					{ id: "a", rank: 1 },
					{ id: "b", rank: 2 },
				]),
				heat("h2", [
					{ id: "e", rank: 1 },
					{ id: "f", rank: 2 },
				]),
			],
		};
		b.rounds[1] = {
			...b.rounds[1]!,
			heats: [
				heat("h3", [
					{ id: "a", rank: 1 },
					{ id: "e", rank: 2 },
					{ id: "seed", rank: 3 },
				]),
			],
		};
		b.rounds[2] = {
			...b.rounds[2]!,
			heats: [
				heat("h4", [
					{ id: "a", rank: 1 },
					{ id: "e", rank: 2 },
				]),
			],
		};
		const standings = computeStandings(b);
		expect(places(standings)).toEqual(["a:1", "e:2", "seed:3", "b:4=", "f:4="]);
		expect(standings.find((s) => s.riderId === "seed")?.lastRoundId).toBe("r2");
	});

	test("statuses and unranked riders in the final follow statusOrder", () => {
		const b = bracket([
			round(
				"r1",
				[
					heat("h1", [
						{ id: "dns", status: "DNS" },
						{ id: "dsq", status: "DSQ" },
						{ id: "dnf", status: "DNF" },
						{ id: "none" },
						{ id: "w", rank: 1 },
					]),
				],
				{ maxPerHeat: 6 },
			),
		]);
		expect(places(computeStandings(b, { separateWithinHeat: true }))).toEqual([
			"w:1",
			"none:2",
			"dnf:3",
			"dsq:4",
			"dns:5",
		]);
		expect(
			places(
				computeStandings(b, {
					statusOrder: ["DNS", "DSQ", "DNF"],
					separateWithinHeat: true,
				}),
			),
		).toEqual(["w:1", "none:2", "dns:3", "dsq:4", "dnf:5"]);
	});

	test("statuses missing from a custom statusOrder are placed after listed ones", () => {
		const b = bracket([
			round("r1", [
				heat("h1", [
					{ id: "dns", status: "DNS" },
					{ id: "dsq", status: "DSQ" },
					{ id: "dnf", status: "DNF" },
				]),
			]),
		]);
		expect(
			places(
				computeStandings(b, {
					statusOrder: ["DSQ"],
					separateWithinHeat: true,
				}),
			),
		).toEqual(["dsq:1", "dns:2", "dnf:3"]);
	});

	test("never placed riders are excluded, empty bracket gives nothing", () => {
		const empty = bracket([round("r1", [heat("h1")])], {
			entries: [{ riderId: "a", displayName: "a" }],
		});
		expect(computeStandings(empty)).toEqual([]);
	});

	test("single rider in an eliminated tier is not tied", () => {
		const b = bracket([
			round("r1", [
				heat("h1", [
					{ id: "a", rank: 1 },
					{ id: "b", rank: 2 },
				]),
			]),
			round("r2", [heat("h2", [{ id: "a", rank: 1 }])]),
		]);
		expect(places(computeStandings(b))).toEqual(["a:1", "b:2"]);
	});
});

describe("last round handling", () => {
	const finalists = [
		{ id: "a", rank: 1 },
		{ id: "b", rank: 2 },
	];
	const small = [
		{ id: "c", rank: 1 },
		{ id: "d", rank: 2 },
	];

	test("final and small final in the same round form a tier", () => {
		const b = bracket([
			round("r1", [heat("h1", [...finalists, ...small])], { maxPerHeat: 4 }),
			round("r2", [heat("f", finalists), heat("sf", small)]),
		]);
		expect(places(computeStandings(b))).toEqual([
			"a:1=",
			"c:1=",
			"b:1=",
			"d:1=",
		]);
		expect(places(computeStandings(b, { separateWithinHeat: true }))).toEqual([
			"a:1=",
			"c:1=",
			"b:3=",
			"d:3=",
		]);
	});

	test("the same case in two rounds gives distinct places", () => {
		const b = bracket([
			round("r1", [heat("h1", [...finalists, ...small])], { maxPerHeat: 4 }),
			round("r2", [heat("sf", small)]),
			round("r3", [heat("f", finalists)]),
		]);
		expect(places(computeStandings(b))).toEqual(["a:1", "b:2", "c:3", "d:4"]);
		expect(places(computeStandings(b, { separateWithinHeat: true }))).toEqual([
			"a:1",
			"b:2",
			"c:3",
			"d:4",
		]);
	});

	test("a single-heat round that is not fully ranked is a tier", () => {
		const b = bracket([
			round("r1", [heat("h1", [...finalists, ...small])], { maxPerHeat: 4 }),
			round("r2", [heat("sf", [{ id: "c", rank: 1 }, "d"])]),
			round("r3", [heat("f", finalists)]),
		]);
		expect(places(computeStandings(b))).toEqual(["a:1", "b:2", "c:3=", "d:3="]);
	});

	test("an unjudged final is a tier", () => {
		const b = bracket([
			round("r1", [heat("h1", [...finalists, ...small])], { maxPerHeat: 4 }),
			round("r2", [heat("f", ["a", "b"])]),
		]);
		expect(places(computeStandings(b))).toEqual(["a:1=", "b:1=", "c:3", "d:4"]);
	});
});
