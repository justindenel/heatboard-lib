import { describe, expect, test } from "vitest";
import { applyAction } from "../../actions";
import { placeQualifiers } from "../../actions/qualifiers";
import type { Bracket, Link } from "../../model";
import { bracket, heat, link, round } from "../../__tests__/fixtures";
import { simulateAdvancementChange } from "../advancement";

/** h1 and h0 are judged; h2 and h3 are the pending targets of the next round. */
const fixture = (
	h2Status: "pending" | "running" = "pending",
	h0Status: "pending" | "judged" = "judged",
): Bracket =>
	bracket(
		[
			round("r1", [
				heat(
					"h1",
					[
						{ id: "a", rank: 1 },
						{ id: "b", rank: 2 },
						{ id: "c", rank: 3 },
						{ id: "d", status: "DNF" },
					],
					{ status: "judged" },
				),
				heat(
					"h0",
					[
						{ id: "x", rank: 1 },
						{ id: "y", rank: 2 },
					],
					{ status: h0Status },
				),
			]),
			round("r2", [heat("h2", [], { status: h2Status }), heat("h3")]),
		],
		{
			status: "running",
			links: [
				link("h1", 1, "h2"),
				link("h1", 2, "h2"),
				link("h1", 3, "h3"),
				link("h0", 1, "h3"),
			],
		},
	);

const riders = (b: Bracket, heatId: string): string[] =>
	b.rounds
		.flatMap((r) => r.heats)
		.find((h) => h.id === heatId)
		?.slots.map((s) => s.riderId) ?? [];

/** What really happens: confirm the new links, then place the qualifiers of the judged heats. */
function actualDiff(b: Bracket, links: Link[], heatId: string) {
	const advance = (from: Bracket) => {
		let current = from;
		for (const source of ["h1", "h0"]) {
			const result = placeQualifiers(current, source);
			if (!result.ok) throw new Error(result.error.message);
			current = result.bracket;
		}
		return current;
	};
	const linked = applyAction(b, { type: "setLinks", links, confirm: true });
	if (!linked.ok) throw new Error(linked.error.message);
	const before = riders(advance(b), heatId);
	const after = riders(advance(linked.bracket), heatId);
	return {
		entering: after.filter((id) => !before.includes(id)),
		leaving: before.filter((id) => !after.includes(id)),
	};
}

describe("simulateAdvancementChange: links", () => {
	test("no change means no movement, one entry per target of a judged heat", () => {
		expect(
			simulateAdvancementChange(fixture(), { links: fixture().links }),
		).toEqual({
			heats: [
				{ heatId: "h2", started: false, entering: [], leaving: [] },
				{ heatId: "h3", started: false, entering: [], leaving: [] },
			],
			conflicts: [],
			qualification: [],
		});
	});

	test("reports a rider delivered to two heats of one round, which judging only places once", () => {
		const b = fixture();
		const links = [link("h1", 1, "h3"), link("h1", 1, "h2")];
		expect(simulateAdvancementChange(b, { links }).conflicts).toEqual([
			{ riderId: "a", roundId: "r2", heatIds: ["h2", "h3"] },
		]);
		const linked = applyAction(b, { type: "setLinks", links, confirm: true });
		expect(linked.ok).toBe(true);
		if (!linked.ok) return;
		const advanced = placeQualifiers(linked.bracket, "h1");
		expect(advanced.ok).toBe(true);
		if (!advanced.ok) return;
		const delivered = advanced.bracket.rounds[1]!.heats.filter((h) =>
			h.slots.some((s) => s.riderId === "a"),
		);
		expect(delivered.map((h) => h.id)).toEqual(["h3"]);
		expect(simulateAdvancementChange(b, { links: b.links }).conflicts).toEqual(
			[],
		);
	});

	test("links alone decide, whatever the advancing count", () => {
		const b = fixture();
		const { heats } = simulateAdvancementChange(b, {
			links: [...b.links, link("h1", 4, "h2")],
		});
		expect(heats.find((h) => h.heatId === "h2")?.entering).toEqual([]);
		const rank3 = simulateAdvancementChange(b, {
			links: [link("h1", 3, "h2")],
		});
		expect(rank3.heats.find((h) => h.heatId === "h3")?.leaving).toEqual([
			"c",
			"x",
		]);
		expect(rank3.heats.find((h) => h.heatId === "h2")?.entering).toEqual(["c"]);
	});

	test("matches what setLinks then placing the qualifiers really do", () => {
		const b = fixture();
		const scenarios: Link[][] = [
			[link("h1", 1, "h2"), link("h1", 2, "h3"), link("h0", 1, "h3")],
			[link("h1", 1, "h2"), link("h1", 2, "h2"), link("h1", 3, "h3")],
			[...b.links, link("h1", 3, "eliminated"), link("h0", 2, "h2")],
			[link("h1", 3, "h2"), link("h1", 1, "h3"), link("h0", 1, "h2")],
			[],
			[link("h1", 4, "h2"), link("h1", 1, "h3")],
		];
		for (const links of scenarios) {
			const { heats } = simulateAdvancementChange(b, { links });
			for (const id of ["h2", "h3"]) {
				const predicted = heats.find((h) => h.heatId === id);
				expect(
					{
						entering: predicted?.entering ?? [],
						leaving: predicted?.leaving ?? [],
					},
					JSON.stringify(links),
				).toEqual(actualDiff(b, links, id));
			}
		}
	});

	test("flags riders entering or leaving a heat that already started", () => {
		const { heats } = simulateAdvancementChange(fixture("running"), {
			links: [link("h1", 1, "h3"), link("h1", 4, "h2")],
		});
		expect(heats.find((h) => h.heatId === "h2")).toEqual({
			heatId: "h2",
			started: true,
			entering: [],
			leaving: ["a", "b"],
		});
	});

	test("ignores links from heats that are not judged", () => {
		const b = fixture("pending", "pending");
		const { heats } = simulateAdvancementChange(b, {
			links: [link("h0", 1, "h2")],
		});
		expect(heats.find((h) => h.heatId === "h2")?.entering).toEqual([]);
		expect(heats.find((h) => h.heatId === "h3")?.leaving).toEqual(["c"]);
	});
});

describe("simulateAdvancementChange: advancing", () => {
	test("lists the riders whose qualified state flips, statuses excluded", () => {
		const b = fixture();
		expect(
			simulateAdvancementChange(b, {
				advancing: { roundId: "r1", value: 3 },
			}),
		).toEqual({
			heats: [],
			conflicts: [],
			qualification: [
				{
					heatId: "h1",
					riderId: "c",
					qualifiedBefore: false,
					qualifiedAfter: true,
				},
			],
		});
		const fewer = simulateAdvancementChange(b, {
			advancing: { roundId: "r1", value: 1 },
		});
		expect(fewer.qualification.map((q) => q.riderId)).toEqual(["b", "y"]);
		expect(fewer.qualification.every((q) => !q.qualifiedAfter)).toBe(true);
	});

	test("an unknown round or an unchanged count changes nothing", () => {
		const b = fixture();
		for (const advancing of [
			{ roundId: "zz", value: 3 },
			{ roundId: "r1", value: 2 },
		]) {
			expect(simulateAdvancementChange(b, { advancing }).qualification).toEqual(
				[],
			);
		}
	});

	test("both parts can be asked together, and nothing is written", () => {
		const b = fixture();
		const before = structuredClone(b);
		const result = simulateAdvancementChange(b, {
			links: [],
			advancing: { roundId: "r1", value: 4 },
		});
		expect(result.heats.length).toBeGreaterThan(0);
		expect(result.qualification.length).toBeGreaterThan(0);
		expect(b).toEqual(before);
	});
});
