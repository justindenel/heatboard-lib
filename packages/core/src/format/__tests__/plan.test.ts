import { describe, expect, test } from "vitest";
import { buildFromFormat } from "../build";
import { generateDoubleElimination, isSingleElimination } from "../double";
import type { FormatSettings } from "../model";
import {
	defaultPlan,
	editorFromPlan,
	formatFromPlan,
	planFlow,
	planFromFormat,
	planProblems,
	planRoundName,
	refillPlan,
	type FormatPlan,
	type RoundPlan,
} from "../plan";
import { parseFormat } from "../parse";
import { formatPresets } from "../presets";

const entriesOf = (riders: number) =>
	Array.from({ length: riders }, (_, i) => ({
		riderId: `r${i}`,
		displayName: `R${i}`,
	}));

const heatsOf = (plan: FormatPlan) => plan.rounds.map((r) => r.heats);
const advanceOf = (plan: FormatPlan) => plan.rounds.map((r) => r.advance);
const manual = (heats: number, advance: number): RoundPlan => ({
	heats,
	advance,
	auto: false,
});
const hasError = (plan: FormatPlan) =>
	planProblems(plan).some((p) => p.severity === "error");

describe("defaultPlan", () => {
	test("16 riders, 4 heats, top 2, repechage", () => {
		const plan = defaultPlan({
			riders: 16,
			heats: 4,
			advance: 2,
			repechage: true,
		});
		expect(heatsOf(plan)).toEqual([4, 3, 2, 1]);
		expect(advanceOf(plan)).toEqual([2, 2, 2, 0]);
		expect(plan.rounds[0]?.repechage).toMatchObject({ heats: 2, advance: 2 });
		expect(plan.rounds.slice(1).every((r) => !r.repechage)).toBe(true);
		const flow = planFlow(plan);
		expect(flow.rounds.map((r) => r.sizes)).toEqual([
			[4, 4, 4, 4],
			[4, 4, 4],
			[3, 3],
			[4],
		]);
		expect(flow.rounds[0]?.repechage?.sizes).toEqual([4, 4]);
		expect(flow.rounds[1]?.incoming).toBe(12);
		expect(flow.rounds[1]?.fromRepechage).toBe(4);
		expect(planProblems(plan)).toEqual([]);
	});

	test("a single heat in round 1 is a lone final", () => {
		const plan = defaultPlan({
			riders: 6,
			heats: 1,
			advance: 2,
			repechage: true,
			smallFinal: true,
		});
		expect(plan.rounds).toEqual([{ heats: 1, advance: 0, auto: false }]);
		expect(plan.smallFinal).toBe(true);
		expect(planFlow(plan).smallFinal).toBeUndefined();
		expect(formatFromPlan(plan).rounds.map((r) => r.key)).toEqual(["final"]);
	});

	test("a small final chosen while the plan has a single round comes back with more rounds", () => {
		const lone = defaultPlan({
			riders: 4,
			heats: 1,
			advance: 2,
			repechage: false,
			smallFinal: true,
		});
		const bigger = refillPlan(
			{
				...lone,
				riders: 24,
				rounds: [{ heats: 6, advance: 2, auto: false }],
			},
			0,
		);
		expect(bigger.rounds.length).toBeGreaterThanOrEqual(2);
		expect(bigger.smallFinal).toBe(true);
		expect(formatFromPlan(bigger).rounds.some((r) => r.optional)).toBe(true);
	});

	test.each([
		["16 riders, 4 heats, top 3", 16, 4, 3],
		["26 riders, 7 heats, top 3", 26, 7, 3],
		["12 riders, 2 heats, top 4", 12, 2, 4],
	])("%s ends on a final", (_name, riders, heats, advance) => {
		const plan = defaultPlan({ riders, heats, advance, repechage: false });
		const flow = planFlow(plan);
		const last = plan.rounds.length - 1;
		expect(plan.rounds[last]).toMatchObject({ heats: 1, advance: 0 });
		expect(flow.rounds[last]?.incoming).toBeLessThanOrEqual(
			Math.ceil(riders / heats),
		);
		flow.rounds.slice(0, -1).forEach((f, i) => {
			expect(flow.rounds[i + 1]?.incoming).toBeLessThan(f.incoming);
		});
		expect(planProblems(plan).filter((p) => p.severity === "error")).toEqual(
			[],
		);
	});

	test("qualifiers follow round 1, capped at the smallest heat minus 1", () => {
		const plan = defaultPlan({
			riders: 16,
			heats: 4,
			advance: 3,
			repechage: false,
		});
		expect(heatsOf(plan)).toEqual([4, 3, 3, 2, 1]);
		expect(advanceOf(plan)).toEqual([3, 3, 2, 2, 0]);
	});
});

describe("refillPlan", () => {
	test("sizes the heats of a hand-made 32 riders format", () => {
		const plan: FormatPlan = {
			riders: 32,
			rounds: [manual(8, 2), manual(4, 3), manual(2, 3), manual(1, 0)],
			smallFinal: false,
			fill: "serpentine",
		};
		const flow = planFlow(plan);
		expect(flow.rounds.map((r) => r.incoming)).toEqual([32, 16, 12, 6]);
		expect(flow.rounds[2]?.sizes).toEqual([6, 6]);
		expect(planProblems(plan)).toEqual([]);
		expect(refillPlan(plan, 0)).toEqual(plan);
	});

	test("keeps a modified round when an earlier change would make an auto round the final", () => {
		let plan = defaultPlan({
			riders: 32,
			heats: 8,
			advance: 2,
			repechage: false,
		});
		expect(heatsOf(plan)).toEqual([8, 4, 2, 1]);
		const rounds = plan.rounds.map((r) => ({ ...r }));
		rounds[2] = { ...manual(3, 2) };
		plan = refillPlan({ ...plan, rounds }, 2);
		expect(plan.rounds[2]).toEqual(manual(3, 2));
		expect(plan.rounds.at(-1)?.heats).toBe(1);

		const edited = plan.rounds.map((r) => ({ ...r }));
		edited[0] = { ...manual(4, 1) };
		const next = refillPlan({ ...plan, rounds: edited }, 0);
		const kept = next.rounds.find((r) => !r.auto && r.heats === 3);
		expect(kept).toEqual(manual(3, 2));
		const keptIndex = next.rounds.indexOf(kept as RoundPlan);
		expect(keptIndex).toBeGreaterThan(1);
		expect(next.rounds.at(-1)).toMatchObject({ heats: 1, advance: 0 });
		expect(next.rounds.length).toBeGreaterThan(keptIndex + 1);
		expect(planProblems(next).some((p) => p.round === keptIndex)).toBe(true);
	});

	test("keeps the repechage checkbox when the rider count changes", () => {
		const plan = defaultPlan({
			riders: 16,
			heats: 4,
			advance: 2,
			repechage: true,
		});
		const withSecond = {
			...plan,
			rounds: plan.rounds.map((r, i) =>
				i === 1 ? { ...r, repechage: { heats: 1, advance: 2, auto: true } } : r,
			),
		};
		const bigger = refillPlan({ ...withSecond, riders: 24 }, 0);
		expect(bigger.rounds[0]?.repechage).toBeDefined();
		expect(bigger.rounds[1]?.repechage).toBeDefined();
		expect(
			refillPlan({ ...withSecond, riders: 20 }, 0).rounds[0]?.repechage,
		).toBeDefined();
	});

	test("an auto repechage follows the qualifiers of its source round", () => {
		let plan = defaultPlan({
			riders: 24,
			heats: 6,
			advance: 2,
			repechage: true,
		});
		expect(plan.rounds[0]?.repechage?.advance).toBe(2);
		plan = refillPlan(
			{
				...plan,
				rounds: plan.rounds.map((r, i) => (i === 0 ? { ...r, advance: 1 } : r)),
			},
			0,
		);
		expect(plan.rounds[0]?.repechage).toMatchObject({ advance: 1, auto: true });
	});

	test("a modified repechage keeps its heats and qualifiers", () => {
		const plan = defaultPlan({
			riders: 16,
			heats: 4,
			advance: 2,
			repechage: true,
		});
		const rounds = plan.rounds.map((r, i) =>
			i === 0 ? { ...r, repechage: { heats: 3, advance: 1, auto: false } } : r,
		);
		const next = refillPlan({ ...plan, rounds, riders: 20 }, 0);
		expect(next.rounds[0]?.repechage).toEqual({
			heats: 3,
			advance: 1,
			auto: false,
		});
	});

	test("no repechage on the round before the final", () => {
		const plan = defaultPlan({
			riders: 16,
			heats: 4,
			advance: 2,
			repechage: false,
		});
		expect(heatsOf(plan)).toEqual([4, 2, 1]);
		const rounds = plan.rounds.map((r) => ({
			...r,
			repechage: { heats: 1, advance: 1, auto: true },
		}));
		const next = refillPlan({ ...plan, rounds }, 0);
		expect(next.rounds[0]?.repechage).toBeDefined();
		expect(next.rounds.at(-2)?.repechage).toBeUndefined();
		expect(next.rounds.at(-1)?.repechage).toBeUndefined();
		const format = formatFromPlan({
			...next,
			rounds: next.rounds.map((r, i) =>
				i === next.rounds.length - 2
					? { ...r, repechage: { heats: 1, advance: 1, auto: true } }
					: r,
			),
		});
		expect(
			format.rounds.some((r) => r.key === `rep-r${next.rounds.length - 1}`),
		).toBe(false);
		expect(format.rounds.some((r) => r.key === "rep-r1")).toBe(true);
	});

	test("chained repechages", () => {
		const plan = defaultPlan({
			riders: 32,
			heats: 8,
			advance: 2,
			repechage: true,
		});
		const rounds = plan.rounds.map((r, i) =>
			i === 1 ? { ...r, repechage: { heats: 1, advance: 2, auto: true } } : r,
		);
		const chained = refillPlan({ ...plan, rounds }, 0);
		const flow = planFlow(chained);
		expect(flow.rounds[0]?.repechage?.incoming).toBe(16);
		expect(flow.rounds[1]?.repechage?.incoming).toBe(
			(flow.rounds[1]?.incoming ?? 0) - (flow.rounds[1]?.qualifiers ?? 0),
		);
		const format = formatFromPlan(chained);
		expect(format.rounds.map((r) => r.key).slice(0, 5)).toEqual([
			"r1",
			"rep-r1",
			"r2",
			"rep-r2",
			"r3",
		]);
		const built = buildFromFormat(
			{ entries: entriesOf(32), rounds: [] },
			format,
			1,
		);
		expect(built.ok).toBe(true);
		expect(
			built.ok && built.warnings.filter((w) => w.code === "TOO_MANY_HEATS"),
		).toEqual([]);
	});
});

describe("small final", () => {
	const plan = defaultPlan({
		riders: 16,
		heats: 4,
		advance: 2,
		repechage: false,
		smallFinal: true,
	});

	test("takes the riders eliminated before the final", () => {
		expect(heatsOf(plan)).toEqual([4, 2, 1]);
		expect(planFlow(plan).smallFinal).toBe(4);
	});

	test("is an optional main round placed before the final", () => {
		const format = formatFromPlan(plan);
		expect(format.rounds.map((r) => r.key)).toEqual([
			"r1",
			"r2",
			"small-final",
			"final",
		]);
		expect(format.rounds[2]).toMatchObject({ optional: true, heats: 1 });
		expect(format.rounds[2]?.group).toBeUndefined();
		expect(format.rounds[1]?.outcomes).toEqual([
			{ ranks: [1, 2], to: "final" },
			{ ranks: [3, 100], to: "small-final" },
		]);
		const built = buildFromFormat(
			{ entries: entriesOf(16), rounds: [] },
			format,
			1,
		);
		expect(built.ok && built.sizes["small-final"]).toEqual([4]);
		if (built.ok) {
			expect(built.rounds[1]?.advancing).toBe(2);
			expect(built.rounds[2]?.optional).toBe(true);
		}
	});

	test("is refused by isSingleElimination, like a repechage", () => {
		expect(isSingleElimination(formatFromPlan(plan))).toBe(false);
		expect(
			isSingleElimination(formatFromPlan({ ...plan, smallFinal: false })),
		).toBe(true);
		const withRepechage = defaultPlan({
			riders: 16,
			heats: 4,
			advance: 2,
			repechage: true,
		});
		expect(isSingleElimination(formatFromPlan(withRepechage))).toBe(false);
	});
});

describe("links to the repechage", () => {
	test("cover the places of a heat that could hold one more rider", () => {
		const plan = defaultPlan({
			riders: 26,
			heats: 7,
			advance: 2,
			repechage: true,
		});
		const built = buildFromFormat(
			{ entries: entriesOf(26), rounds: [] },
			formatFromPlan(plan),
			1,
		);
		if (!built.ok) throw new Error("build failed");
		const sizes = built.sizes.r1 as number[];
		const smaller = sizes.findIndex((s) => s === 3);
		const largest = Math.max(...sizes);
		const heatId = `r1-${smaller + 1}`;
		const ranks = built.links
			.filter((l) => l.from.heatId === heatId)
			.map((l) => l.from.rank);
		expect(ranks).toEqual(Array.from({ length: largest }, (_, i) => i + 1));
		const last = built.links.find(
			(l) => l.from.heatId === heatId && l.from.rank === largest,
		);
		expect(last?.to).not.toBe("eliminated");
		if (last && last.to !== "eliminated") {
			expect(last.to.heatId.startsWith("rep-r1-")).toBe(true);
		}
	});
});

describe("repechage qualifiers in the next round", () => {
	/** Repechage qualifiers received by each heat of round 2, and the repechage heats they come from. */
	const received = (riders: number, heats: number) => {
		const plan = defaultPlan({ riders, heats, advance: 2, repechage: true });
		const built = buildFromFormat(
			{ entries: entriesOf(riders), rounds: [] },
			formatFromPlan(plan),
			1,
		);
		if (!built.ok) throw new Error("build failed");
		const targets = built.rounds.find((r) => r.id === "r2")?.heats ?? [];
		return targets.map((target) => {
			const sources = built.links
				.filter(
					(l) =>
						l.from.heatId.startsWith("rep-r1-") &&
						l.to !== "eliminated" &&
						l.to.heatId === target.id &&
						l.from.rank <= 2,
				)
				.map((l) => l.from.heatId);
			return sources;
		});
	};

	test("26 riders: 6 over 5 heats", () => {
		const heats = received(26, 7);
		expect(heats.map((s) => s.length).sort()).toEqual([1, 1, 1, 1, 2]);
		heats.forEach((s) => expect(new Set(s).size).toBe(s.length));
	});

	test("16 riders: 4 over 3 heats", () => {
		const heats = received(16, 4);
		expect(heats.map((s) => s.length).sort()).toEqual([1, 1, 2]);
		heats.forEach((s) => expect(new Set(s).size).toBe(s.length));
	});

	test("branch placement spreads them within each block", () => {
		const heats = received(32, 8);
		expect(heats).toHaveLength(6);
		const counts = heats.map((s) => s.length);
		expect(counts.every((c) => c === 1 || c === 2)).toBe(true);
		expect(counts.slice(0, 3).reduce((a, b) => a + b)).toBe(4);
		expect(counts.slice(3).reduce((a, b) => a + b)).toBe(4);
	});
});

describe("round names", () => {
	test("final, semi-finals, quarter-finals, then numbered rounds", () => {
		const plan: FormatPlan = {
			riders: 32,
			rounds: [manual(8, 2), manual(4, 2), manual(2, 2), manual(1, 0)],
			smallFinal: true,
			fill: "serpentine",
		};
		expect(plan.rounds.map((_, i) => planRoundName(plan, i))).toEqual([
			"Round 1",
			"Quarter-finals",
			"Semi-finals",
			"Final",
		]);
		const format = formatFromPlan(plan);
		expect(format.rounds.map((r) => r.name)).toEqual([
			"Round 1",
			"Quarter-finals",
			"Semi-finals",
			"Small final",
			"Final",
		]);
	});

	test("a round before the final without 2 heats is numbered; names can be translated", () => {
		const plan: FormatPlan = {
			riders: 24,
			rounds: [manual(6, 2), manual(3, 2), manual(1, 0)],
			smallFinal: false,
			fill: "serpentine",
		};
		expect(planRoundName(plan, 1)).toBe("Round 2");
		const format = formatFromPlan(
			{ ...plan, rounds: [...plan.rounds.slice(0, 2), manual(1, 0)] },
			{ round: (n) => `Tour ${n}`, final: "Finale" },
		);
		expect(format.rounds.map((r) => r.name)).toEqual([
			"Tour 1",
			"Tour 2",
			"Finale",
		]);
	});

	test("repechages are named after their source round", () => {
		const plan = defaultPlan({
			riders: 16,
			heats: 4,
			advance: 2,
			repechage: true,
		});
		expect(formatFromPlan(plan).rounds[1]?.name).toBe("Repechage 1");
	});
});

describe("planProblems", () => {
	const codes = (plan: FormatPlan) => planProblems(plan).map((p) => p.code);

	test("blocks an empty heat", () => {
		const plan = defaultPlan({
			riders: 3,
			heats: 4,
			advance: 1,
			repechage: false,
		});
		expect(planProblems(plan)).toContainEqual({
			code: "EMPTY_HEAT",
			severity: "error",
			round: 0,
			target: "round",
		});
	});

	test("blocks a plan that never reaches a final", () => {
		const plan: FormatPlan = {
			riders: 16,
			rounds: [manual(4, 2), manual(2, 2)],
			smallFinal: false,
			fill: "serpentine",
		};
		expect(planProblems(plan)).toContainEqual({
			code: "NO_FINAL",
			severity: "error",
			round: 1,
			target: "round",
		});
	});

	test("blocks plans over the round and heat limits", () => {
		const heats: FormatPlan = {
			riders: 400,
			rounds: [manual(65, 2), manual(1, 0)],
			smallFinal: false,
			fill: "serpentine",
		};
		expect(codes(heats)).toContain("TOO_MANY_HEATS");
		const rounds: FormatPlan = {
			riders: 400,
			rounds: [...Array.from({ length: 97 }, () => manual(2, 1)), manual(1, 0)],
			smallFinal: false,
			fill: "serpentine",
		};
		expect(codes(rounds)).toContain("TOO_MANY_ROUNDS");
	});

	test("warns about a heat of one rider, a heat over 8 and qualifiers covering a heat", () => {
		const single: FormatPlan = {
			riders: 5,
			rounds: [manual(3, 1), manual(1, 0)],
			smallFinal: false,
			fill: "serpentine",
		};
		expect(codes(single)).toContain("SINGLE_RIDER_HEAT");
		const large: FormatPlan = {
			riders: 20,
			rounds: [manual(2, 2), manual(1, 0)],
			smallFinal: false,
			fill: "serpentine",
		};
		expect(codes(large)).toContain("LARGE_HEAT");
		const all: FormatPlan = {
			riders: 8,
			rounds: [manual(2, 4), manual(1, 0)],
			smallFinal: false,
			fill: "serpentine",
		};
		expect(codes(all)).toContain("ADVANCE_ALL");
		expect(hasError(all)).toBe(false);
	});

	test("warns about a final of more than 8 riders", () => {
		const plan: FormatPlan = {
			riders: 30,
			rounds: [manual(3, 3), manual(1, 0)],
			smallFinal: false,
			fill: "serpentine",
		};
		expect(planProblems(plan)).toContainEqual({
			code: "LARGE_FINAL",
			severity: "warning",
			round: 1,
			target: "round",
		});
	});

	test("warns about a modified round that no longer fits", () => {
		const plan: FormatPlan = {
			riders: 8,
			rounds: [manual(2, 1), manual(3, 1), manual(1, 0)],
			smallFinal: false,
			fill: "serpentine",
		};
		expect(planProblems(plan)).toContainEqual({
			code: "SHIFTED_ROUND",
			severity: "warning",
			round: 1,
			target: "round",
		});
	});
});

describe("planFromFormat", () => {
	const plan = defaultPlan({
		riders: 16,
		heats: 4,
		advance: 2,
		repechage: true,
		smallFinal: true,
	});

	test("round-trips with the editor state", () => {
		expect(planFromFormat(formatFromPlan(plan), editorFromPlan(plan))).toEqual(
			plan,
		);
	});

	test("takes every round as modified without editor state", () => {
		const back = planFromFormat(formatFromPlan(plan), undefined, 16);
		expect(back?.rounds.every((r) => !r.auto)).toBe(true);
		expect(back?.rounds.every((r) => !r.repechage || !r.repechage.auto)).toBe(
			true,
		);
		expect(heatsOf(back as FormatPlan)).toEqual(heatsOf(plan));
		expect(back?.smallFinal).toBe(true);
	});

	test("keeps the placement options", () => {
		const spread: FormatPlan = {
			...plan,
			fill: "draw",
			rounds: plan.rounds.map((r, i) =>
				i === 1 ? { ...r, placement: "spread" as const } : r,
			),
		};
		const format = formatFromPlan(spread);
		expect(format.fill).toBe("draw");
		expect(format.rounds.find((r) => r.key === "r2")?.placement).toBe("spread");
		expect(planFromFormat(format, editorFromPlan(spread))).toEqual(spread);
	});

	test("reads the single elimination preset", () => {
		const back = planFromFormat(
			formatPresets[0] as FormatSettings,
			undefined,
			16,
		);
		expect(heatsOf(back as FormatPlan)).toEqual([4, 2, 1]);
		expect(advanceOf(back as FormatPlan)).toEqual([2, 2, 0]);
	});

	test("refuses formats that are not written as rows", () => {
		expect(planFromFormat(formatPresets[1] as FormatSettings)).toBeNull();
		const base = formatFromPlan(
			defaultPlan({ riders: 16, heats: 4, advance: 2, repechage: false }),
		);
		const double = generateDoubleElimination(base, { finalMode: "heats" });
		expect(double.ok).toBe(true);
		if (double.ok) expect(planFromFormat(double.format)).toBeNull();
		const byPlace = {
			...base,
			rounds: base.rounds.map((r, i) =>
				i === 0
					? {
							...r,
							outcomes: [
								{ ranks: [1, 1] as [number, number], to: "r2" },
								{ ranks: [3, 3] as [number, number], to: "r2" },
							],
						}
					: r,
			),
		};
		expect(planFromFormat(byPlace)).toBeNull();
	});

	test("ignores an editor state that does not match the rounds", () => {
		const back = planFromFormat(formatFromPlan(plan), {
			riders: 12,
			rounds: [{ auto: true }],
		});
		expect(back?.riders).toBe(12);
		expect(back?.rounds.every((r) => !r.auto)).toBe(true);
	});
});

describe("grid", () => {
	// Several thousand plans: about 6 s on a CI runner, past the 5 s default.
	test(
		"every default plan is a valid format or reports a blocking error",
		{ timeout: 60_000 },
		() => {
			let checked = 0;
			for (let riders = 4; riders <= 64; riders++) {
				const entries = entriesOf(riders);
				for (let heats = 1; heats <= 16; heats++) {
					for (let advance = 1; advance <= 3; advance++) {
						for (const repechage of [false, true]) {
							for (const smallFinal of [false, true]) {
								const label = `${riders}/${heats}/${advance}/${repechage}/${smallFinal}`;
								const plan = defaultPlan({
									riders,
									heats,
									advance,
									repechage,
									smallFinal,
								});
								if (hasError(plan)) continue;
								checked++;

								const format = formatFromPlan(plan);
								expect(parseFormat(format).ok, label).toBe(true);
								const built = buildFromFormat(
									{ entries, rounds: [] },
									format,
									1,
								);
								if (!built.ok) throw new Error(label);
								expect(
									built.warnings.filter((w) => w.code === "TOO_MANY_HEATS"),
									label,
								).toEqual([]);
								expect(built.rounds.at(-1)?.heats.length, label).toBe(1);

								const flow = planFlow(plan);
								plan.rounds.forEach((_, i) => {
									const key =
										i === plan.rounds.length - 1 ? "final" : `r${i + 1}`;
									expect(built.sizes[key], label).toEqual(
										flow.rounds[i]?.sizes,
									);
									const side = flow.rounds[i]?.repechage;
									if (side) {
										expect(built.sizes[`rep-r${i + 1}`], label).toEqual(
											side.sizes,
										);
									}
								});
								if (flow.smallFinal !== undefined) {
									expect(built.sizes["small-final"], label).toEqual([
										flow.smallFinal,
									]);
								}

								expect(
									planFromFormat(format, editorFromPlan(plan)),
									label,
								).toEqual({
									...plan,
									smallFinal: plan.smallFinal && plan.rounds.length >= 2,
								});
								const unedited = planFromFormat(format, undefined, riders);
								expect(unedited, label).not.toBeNull();
								expect(heatsOf(unedited as FormatPlan), label).toEqual(
									heatsOf(plan),
								);
								expect(refillPlan(plan, 0), label).toEqual(plan);
							}
						}
					}
				}
			}
			expect(checked).toBeGreaterThan(5000);
		},
	);
});

describe("seeds entering a round", () => {
	const withSeeds = (seedSlots: number, round = 1): FormatPlan => {
		const plan = defaultPlan({
			riders: 32,
			heats: 8,
			advance: 2,
			repechage: false,
		});
		const rounds = plan.rounds.map((r, i) =>
			i === round ? { ...r, seedSlots } : r,
		);
		return refillPlan({ ...plan, rounds }, 0);
	};

	test("32 riders with 4 seeds entering round 2: round 1 has 28, round 2 gets the qualifiers and the seeds", () => {
		const plan = withSeeds(4);
		const flow = planFlow(plan);
		expect(flow.rounds[0]?.incoming).toBe(28);
		expect(flow.rounds[0]?.sizes).toEqual([4, 4, 4, 4, 3, 3, 3, 3]);
		expect(flow.rounds[1]?.seedSlots).toBe(4);
		expect(flow.rounds[1]?.incoming).toBe(
			(flow.rounds[0]?.qualifiers ?? 0) + 4,
		);
		expect(planProblems(plan).filter((p) => p.severity === "error")).toEqual(
			[],
		);
	});

	test("round 1 never has seeds, whatever the plan says", () => {
		const plan = defaultPlan({
			riders: 16,
			heats: 4,
			advance: 2,
			repechage: false,
		});
		const first = plan.rounds[0] as RoundPlan;
		const seeded = {
			...plan,
			rounds: [{ ...first, seedSlots: 3 }, ...plan.rounds.slice(1)],
		};
		expect(planFlow(seeded)).toEqual(planFlow(plan));
		expect(formatFromPlan(seeded).rounds[0]?.seedSlots).toBeUndefined();
	});

	test("the format carries the seeds and reads back as the same plan", () => {
		const plan = withSeeds(4);
		const format = formatFromPlan(plan);
		expect(format.rounds[1]?.seedSlots).toBe(4);
		expect(format.rounds.filter((r) => r.seedSlots !== undefined)).toHaveLength(
			1,
		);
		expect(parseFormat(format).ok).toBe(true);
		expect(planFromFormat(format, editorFromPlan(plan))).toEqual(plan);
	});

	test("seeds of a round that is removed are no longer subtracted from round 1", () => {
		const plan = withSeeds(4);
		const rounds = plan.rounds.map((r, i) =>
			i === 1 ? { ...r, auto: false } : r,
		);
		const kept = refillPlan({ ...plan, rounds }, 1);
		expect(planFlow(kept).rounds[0]?.incoming).toBe(28);
		const dropped = refillPlan(
			{
				...kept,
				rounds: kept.rounds.map((r, i) =>
					i === 1 ? { ...r, seedSlots: 0 } : r,
				),
			},
			0,
		);
		expect(planFlow(dropped).rounds[0]?.incoming).toBe(32);
	});

	test("the built bracket has the planned sizes", () => {
		const plan = withSeeds(4);
		const format = formatFromPlan(plan);
		const built = buildFromFormat(
			{ entries: entriesOf(32), rounds: [] },
			format,
			1,
		);
		if (!built.ok) throw new Error("build failed");
		planFlow(plan).rounds.forEach((f, i) => {
			expect(built.sizes[format.rounds[i]?.key ?? ""]).toEqual(f.sizes);
		});
	});

	test("more seeds than riders is an error on the last seeded round", () => {
		const plan = defaultPlan({
			riders: 8,
			heats: 2,
			advance: 2,
			repechage: false,
		});
		const rounds = plan.rounds.map((r, i) =>
			i === plan.rounds.length - 1 ? { ...r, seedSlots: 9 } : r,
		);
		const problems = planProblems({ ...plan, rounds });
		expect(problems).toContainEqual({
			code: "TOO_MANY_SEED_SLOTS",
			severity: "error",
			round: plan.rounds.length - 1,
			target: "round",
		});
	});

	test("all riders as seeds leaves round 1 empty, which is reported", () => {
		const plan = withSeeds(32);
		expect(planProblems(plan).map((p) => p.code)).toContain("EMPTY_HEAT");
	});
});
