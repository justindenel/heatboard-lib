import { describe, expect, test } from "vitest";
import type { Entry } from "../../model";
import { buildFromFormat } from "../build";
import {
	generateDoubleElimination,
	hasDoubleElimination,
	isSingleElimination,
	removeDoubleElimination,
	type DoubleFinalMode,
} from "../double";
import type { FormatRound, FormatSettings } from "../model";
import { parseFormat } from "../parse";
import { formatPresets } from "../presets";

const single = formatPresets.find(
	(p) => p.name === "Single elimination",
) as FormatSettings;
const chained = formatPresets.find(
	(p) => p.name === "Chained repechage",
) as FormatSettings;

/** Single elimination with the given heats per round, top 2 advancing. */
function singleOf(heats: number[]): FormatSettings {
	return {
		...single,
		rounds: heats.map((count, i): FormatRound => {
			const key = i === heats.length - 1 ? "final" : `r${i + 1}`;
			const next = i === heats.length - 2 ? "final" : `r${i + 2}`;
			return {
				key,
				name: key,
				heats: count,
				...(i < heats.length - 1 && {
					outcomes: [{ ranks: [1, 2], to: next }],
				}),
			};
		}),
	};
}

function generate(settings: FormatSettings, finalMode: DoubleFinalMode) {
	const result = generateDoubleElimination(settings, { finalMode });
	if (!result.ok) throw new Error(result.code);
	return result.format;
}

const doubleSide = (f: FormatSettings) =>
	f.rounds.filter((r) => r.group === "double");

const summary = (rounds: FormatRound[]) =>
	rounds.map((r) => [
		r.key,
		r.heats,
		(r.outcomes ?? []).map((o) => `${o.ranks.join("-")}>${o.to}`),
	]);

function entries(count: number): Entry[] {
	return Array.from({ length: count }, (_, i) => ({
		riderId: `p${String(i + 1).padStart(2, "0")}`,
		displayName: `Rider ${i + 1}`,
	}));
}

function expectCleanBuild(f: FormatSettings, riders: number) {
	const result = buildFromFormat(
		{ entries: entries(riders), rounds: [] },
		f,
		5,
	);
	if (!result.ok) throw new Error("build failed");
	expect(result.warnings).toEqual([]);
	return result;
}

describe("generateDoubleElimination, 16 riders", () => {
	test("duels: climbers halved to one, ladder of duels, optional super final", () => {
		const f = generate(single, "duels");
		expect(summary(f.rounds)).toEqual([
			["r1", 4, ["1-2>r2", "3-100>d1"]],
			["r2", 2, ["1-2>final", "3-100>d2"]],
			["final", 1, ["1-1>double-final", "2-2>d7", "3-3>d6", "4-4>d5"]],
			["d1", 2, ["1-2>d2"]],
			["d2", 2, ["1-2>d3"]],
			["d3", 1, ["1-2>d4"]],
			["d4", 1, ["1-1>d5"]],
			["d5", 1, ["1-1>d6"]],
			["d6", 1, ["1-1>d7"]],
			["d7", 1, ["1-1>double-final"]],
			["double-final", 1, ["1-2>super-final"]],
			["super-final", 1, []],
		]);
		expect(doubleSide(f).every((r) => r.placement === "spread")).toBe(true);
		expect(f.rounds.at(-1)?.optional).toBe(true);
		expect(parseFormat(f)).toEqual({ ok: true, format: f });
	});

	test("names the generated rounds with the given names", () => {
		const names = {
			double: (n: number) => `Double ${n} FR`,
			doubleFinal: "Finale double",
			superFinal: "Super finale",
		};
		const f = generateDoubleElimination(single, { finalMode: "duels" }, names);
		if (!f.ok) throw new Error(f.code);
		const named = doubleSide(f.format).map((r) => r.name);
		expect(named[0]).toBe("Double 1 FR");
		expect(named).toContain("Finale double");
		expect(named.at(-1)).toBe("Super finale");
		expect(named.some((n) => n === "Double final")).toBe(false);
	});

	test("heats: the final's bottom half joins the climbers, its top half meets the qualifiers", () => {
		const f = generate(single, "heats");
		expect(summary(f.rounds)).toEqual([
			["r1", 4, ["1-2>r2", "3-100>d1"]],
			["r2", 2, ["1-2>final", "3-100>d2"]],
			["final", 1, ["1-2>double-final", "3-100>d4"]],
			["d1", 2, ["1-2>d2"]],
			["d2", 2, ["1-2>d3"]],
			["d3", 1, ["1-2>d4"]],
			["d4", 1, ["1-2>double-final"]],
			["double-final", 1, []],
		]);
		expect(f.rounds.some((r) => r.optional)).toBe(false);
		expect(parseFormat(f)).toEqual({ ok: true, format: f });
	});

	test.each(["duels", "heats"] as const)(
		"%s: builds without error, rematch or empty heat",
		(mode) => {
			const result = expectCleanBuild(generate(single, mode), 16);
			expect(result.sizes.d1).toEqual([4, 4]);
			expect(result.sizes.d2).toEqual([4, 4]);
			expect(result.sizes.d3).toEqual([4]);
			if (mode === "duels") {
				expect(result.sizes.d4).toEqual([2]);
				expect(result.sizes["double-final"]).toEqual([2]);
				expect(result.sizes["super-final"]).toEqual([2]);
			} else {
				expect(result.sizes.d4).toEqual([4]);
				expect(result.sizes["double-final"]).toEqual([4]);
			}
		},
	);

	test("a single round only sends its eliminated riders to the double side", () => {
		const f = generate(single, "duels");
		const result = expectCleanBuild(f, 16);
		const toDouble = result.links.filter(
			(l) =>
				l.to !== "eliminated" &&
				l.from.heatId.startsWith("r1-") &&
				l.to.heatId.startsWith("d"),
		);
		expect(toDouble.map((l) => l.from.rank).sort()).toEqual([
			3, 3, 3, 3, 4, 4, 4, 4,
		]);
	});
});

describe("generateDoubleElimination, other sizes", () => {
	test("32 riders, duels: internal rounds keep the entry rounds balanced", () => {
		const f = generate(singleOf([8, 4, 2, 1]), "duels");
		expect(summary(f.rounds)).toEqual([
			["r1", 8, ["1-2>r2", "3-100>d1"]],
			["r2", 4, ["1-2>r3", "3-100>d2"]],
			["r3", 2, ["1-2>final", "3-100>d4"]],
			["final", 1, ["1-1>double-final", "2-2>d9", "3-3>d8", "4-4>d7"]],
			["d1", 4, ["1-2>d2"]],
			["d2", 4, ["1-2>d3"]],
			["d3", 2, ["1-2>d4"]],
			["d4", 2, ["1-2>d5"]],
			["d5", 1, ["1-2>d6"]],
			["d6", 1, ["1-1>d7"]],
			["d7", 1, ["1-1>d8"]],
			["d8", 1, ["1-1>d9"]],
			["d9", 1, ["1-1>double-final"]],
			["double-final", 1, ["1-2>super-final"]],
			["super-final", 1, []],
		]);
		expectCleanBuild(f, 32);
	});

	test("32 riders, heats", () => {
		const f = generate(singleOf([8, 4, 2, 1]), "heats");
		expect(summary(doubleSide(f))).toEqual([
			["d1", 4, ["1-2>d2"]],
			["d2", 4, ["1-2>d3"]],
			["d3", 2, ["1-2>d4"]],
			["d4", 2, ["1-2>d5"]],
			["d5", 1, ["1-2>d6"]],
			["d6", 1, ["1-2>double-final"]],
			["double-final", 1, []],
		]);
		expectCleanBuild(f, 32);
	});

	test("8 riders", () => {
		const duels = generate(singleOf([2, 1]), "duels");
		expect(summary(duels.rounds)).toEqual([
			["r1", 2, ["1-2>final", "3-100>d1"]],
			["final", 1, ["1-1>double-final", "2-2>d5", "3-3>d4", "4-4>d3"]],
			["d1", 1, ["1-2>d2"]],
			["d2", 1, ["1-1>d3"]],
			["d3", 1, ["1-1>d4"]],
			["d4", 1, ["1-1>d5"]],
			["d5", 1, ["1-1>double-final"]],
			["double-final", 1, ["1-2>super-final"]],
			["super-final", 1, []],
		]);
		expectCleanBuild(duels, 8);

		const heats = generate(singleOf([2, 1]), "heats");
		expect(summary(doubleSide(heats))).toEqual([
			["d1", 1, ["1-2>d2"]],
			["d2", 1, ["1-2>double-final"]],
			["double-final", 1, []],
		]);
		expectCleanBuild(heats, 8);
	});
});

describe("generateDoubleElimination, refusals and removal", () => {
	const code = (settings: FormatSettings) => {
		const result = generateDoubleElimination(settings, { finalMode: "duels" });
		return result.ok ? "ok" : result.code;
	};

	test("refuses a format that is not a plain single elimination", () => {
		expect(code(chained)).toBe("NOT_SINGLE_ELIMINATION");
		expect(code({ ...single, rounds: single.rounds.slice(2) })).toBe(
			"NOT_SINGLE_ELIMINATION",
		);
		const optional = {
			...single,
			rounds: single.rounds.map((r) => ({ ...r, optional: true })),
		};
		expect(code(optional)).toBe("NOT_SINGLE_ELIMINATION");
	});

	test("refuses a format that already has a double side", () => {
		expect(code(generate(single, "duels"))).toBe("HAS_DOUBLE_ELIMINATION");
	});

	test("refuses sizes it cannot derive", () => {
		expect(code(singleOf([2, 2, 1]))).toBe("NOTHING_ELIMINATED");
		const tiny: FormatSettings = {
			...single,
			rounds: [
				{
					key: "r1",
					name: "r1",
					heats: 1,
					outcomes: [{ ranks: [1, 1], to: "final" }],
				},
				{ key: "final", name: "final", heats: 1 },
			],
		};
		expect(code(tiny)).toBe("FINAL_TOO_SMALL");
		const uneven: FormatSettings = {
			...single,
			rounds: [
				{
					key: "r1",
					name: "r1",
					heats: 3,
					outcomes: [{ ranks: [1, 2], to: "r2" }],
				},
				{
					key: "r2",
					name: "r2",
					heats: 4,
					outcomes: [{ ranks: [1, 2], to: "final" }],
				},
				{ key: "final", name: "final", heats: 1 },
			],
		};
		expect(code(uneven)).toBe("UNEVEN_HEATS");
	});

	test("refuses a key already used by the single", () => {
		const clash: FormatSettings = {
			...single,
			rounds: single.rounds.map((r, i) => ({ ...r, key: `d${i + 1}` })),
		};
		expect(
			code({
				...clash,
				rounds: clash.rounds.map((r, i) => ({
					...r,
					outcomes: r.outcomes?.map((o) => ({
						...o,
						to: `d${i + 2}`,
					})),
				})),
			}),
		).toBe("KEY_CONFLICT");
	});

	test("recognises single and double formats", () => {
		const f = generate(single, "heats");
		expect(isSingleElimination(single)).toBe(true);
		expect(isSingleElimination(chained)).toBe(false);
		expect(isSingleElimination(f)).toBe(false);
		expect(hasDoubleElimination(single)).toBe(false);
		expect(hasDoubleElimination(f)).toBe(true);
	});

	test.each(["duels", "heats"] as const)(
		"removal restores the single elimination (%s)",
		(mode) => {
			expect(removeDoubleElimination(generate(single, mode))).toEqual(single);
			expect(removeDoubleElimination(single)).toEqual(single);
		},
	);

	test("real heat sizes: uneven heats accepted, the super final can be left out", () => {
		const uneven = singleOf([7, 4, 2, 1]);
		expect(generateDoubleElimination(uneven, { finalMode: "duels" })).toEqual({
			ok: false,
			code: "UNEVEN_HEATS",
		});
		const sizes = {
			r1: [4, 4, 4, 4, 4, 3, 3],
			r2: [4, 4, 3, 3],
			r3: [4, 4],
			final: [4],
		};
		const result = generateDoubleElimination(uneven, {
			finalMode: "duels",
			superFinal: false,
			sizes,
		});
		if (!result.ok) throw new Error(result.code);
		const side = doubleSide(result.format);
		expect(side.some((r) => r.key === "super-final")).toBe(false);
		expect(side.at(-1)?.key).toBe("double-final");
		expect(side.at(-1)?.outcomes).toBeUndefined();
		expect(result.format.rounds[0]?.outcomes?.at(-1)).toMatchObject({
			ranks: [3, 100],
		});
	});
});
