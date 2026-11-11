import { describe, expect, test } from "vitest";
import { generateDoubleElimination } from "../format/double";
import { formatPresets } from "../format/presets";
import type { FormatSettings } from "../format/model";
import type { Bracket } from "../model";
import { computeStandings } from "../standings";
import { bracket, okBracket } from "./fixtures";

const preset = (name: string): FormatSettings =>
	formatPresets.find((p) => p.name === name) as FormatSettings;

const doubleOf = (finalMode: "duels" | "heats"): FormatSettings => {
	const result = generateDoubleElimination(preset("Single elimination"), {
		finalMode,
	});
	if (!result.ok) throw new Error(result.code);
	return result.format;
};

const start = (format: FormatSettings): Bracket =>
	okBracket(
		bracket([], {
			entries: Array.from({ length: 16 }, (_, i) => ({
				riderId: `p${String(i + 1).padStart(2, "0")}`,
				displayName: `Rider ${i + 1}`,
			})),
			status: "published",
		}),
		{ type: "applyFormat", format, drawSeed: 11 },
	);

/** Runs a round: every heat with riders is ranked in slot order and judged, which places its qualifiers. */
function playRound(b: Bracket, roundId: string): Bracket {
	let current = b;
	const round = current.rounds.find((r) => r.id === roundId);
	for (const heat of round?.heats ?? []) {
		if (heat.slots.length === 0) continue;
		current = okBracket(current, {
			type: "setHeatStatus",
			heatId: heat.id,
			status: "running",
		});
		current = okBracket(current, { type: "rankByPosition", heatId: heat.id });
		current = okBracket(current, {
			type: "setHeatStatus",
			heatId: heat.id,
			status: "judged",
		});
	}
	return current;
}

const playAll = (b: Bracket, upTo?: string): Bracket => {
	let current = b;
	for (const round of b.rounds) {
		current = playRound(current, round.id);
		if (round.id === upTo) break;
	}
	return current;
};

const summary = (b: Bracket) =>
	computeStandings(b).map(
		(s) => `${s.place}${s.tied ? "=" : ""}:${s.lastRoundId}`,
	);

const repeat = (value: string, count: number) =>
	Array.from({ length: count }, () => value);

const finalOrder = (b: Bracket, roundId: string) =>
	b.rounds
		.find((r) => r.id === roundId)
		?.heats.flatMap((h) =>
			[...h.slots].sort((x, y) => (x.rank ?? 0) - (y.rank ?? 0)),
		)
		.map((s) => s.riderId);

describe("standings of generated formats", () => {
	test("single elimination: the final decides places 1-4, then tiers", () => {
		const b = playAll(start(preset("Single elimination")));
		expect(summary(b)).toEqual([
			"1:final",
			"2:final",
			"3:final",
			"4:final",
			...repeat("5=:r2", 4),
			...repeat("9=:r1", 8),
		]);
		const standings = computeStandings(b);
		expect(standings.slice(0, 4).map((s) => s.riderId)).toEqual(
			finalOrder(b, "final"),
		);
	});

	test("chained repechage: final, then the last repechage ranked, then tiers", () => {
		const b = playAll(start(preset("Chained repechage")));
		expect(summary(b)).toEqual([
			"1:final",
			"2:final",
			"3:final",
			"4:final",
			"5:rep-r3",
			"6:rep-r3",
			"7:rep-r3",
			"8:rep-r3",
			...repeat("9=:rep-r2", 4),
			...repeat("13=:rep-r1", 4),
		]);
		const standings = computeStandings(b);
		expect(standings.slice(0, 4).map((s) => s.riderId)).toEqual(
			finalOrder(b, "final"),
		);
		expect(standings.slice(4, 8).map((s) => s.riderId)).toEqual(
			finalOrder(b, "rep-r3")?.slice(2),
		);
	});

	describe("double elimination, duels", () => {
		const doubleStart = () => start(doubleOf("duels"));

		test("complete, without the super final", () => {
			const b = playAll(doubleStart(), "double-final");
			expect(b.rounds.at(-1)?.optional).toBe(true);
			expect(summary(b)).toEqual([
				"1:double-final",
				"2:double-final",
				"3:d7",
				"4:d6",
				"5:d5",
				"6:d4",
				"7:d3",
				"8:d3",
				...repeat("9=:d2", 4),
				...repeat("13=:d1", 4),
			]);
		});

		test("a placed but unplayed super final is ignored", () => {
			const b = playAll(doubleStart(), "double-final");
			expect(b.rounds.at(-1)?.heats[0]?.slots).toHaveLength(2);
			expect(summary(b).slice(0, 2)).toEqual([
				"1:double-final",
				"2:double-final",
			]);
		});

		test("with the super final played", () => {
			let b = playAll(doubleStart(), "double-final");
			b = playRound(b, "super-final");
			const standings = computeStandings(b);
			expect(
				standings.slice(0, 4).map((s) => `${s.place}:${s.lastRoundId}`),
			).toEqual(["1:super-final", "2:super-final", "3:d7", "4:d6"]);
			expect(standings.slice(0, 2).map((s) => s.riderId)).toEqual(
				finalOrder(b, "super-final"),
			);
		});

		test("single side only: the single's ranking", () => {
			const b = playAll(doubleStart(), "final");
			expect(summary(b)).toEqual([
				"1:final",
				"2:final",
				"3:final",
				"4:final",
				...repeat("5=:r2", 4),
				...repeat("9=:r1", 8),
			]);
		});

		test("double side partly played: finalists first, then the rounds played", () => {
			const b = playAll(doubleStart(), "d1");
			expect(summary(b)).toEqual([
				"1:final",
				"2:final",
				"3:final",
				"4:final",
				...repeat("5=:r2", 4),
				...repeat("9=:d1", 8),
			]);

			const further = playAll(doubleStart(), "d4");
			expect(summary(further)).toEqual([
				"1:final",
				"2:final",
				"3:final",
				"4:final",
				"5:d4",
				"6:d4",
				"7:d3",
				"8:d3",
				...repeat("9=:d2", 4),
				...repeat("13=:d1", 4),
			]);
		});

		test("a finalist who lost their duel ranks below the finalists still to play", () => {
			const b = playAll(doubleStart(), "d5");
			const standings = computeStandings(b);
			expect(standings.slice(0, 3).map((s) => s.lastRoundId)).toEqual([
				"final",
				"final",
				"final",
			]);
			expect(standings[3]?.lastRoundId).toBe("d5");
		});
	});

	describe("double elimination, heats", () => {
		test("complete: the double final decides places 1-4", () => {
			const b = playAll(start(doubleOf("heats")));
			expect(summary(b)).toEqual([
				"1:double-final",
				"2:double-final",
				"3:double-final",
				"4:double-final",
				"5:d4",
				"6:d4",
				"7:d3",
				"8:d3",
				...repeat("9=:d2", 4),
				...repeat("13=:d1", 4),
			]);
		});

		test("double side partly played", () => {
			const b = playAll(start(doubleOf("heats")), "d3");
			expect(summary(b).slice(0, 8)).toEqual([
				"1:final",
				"2:final",
				"3:final",
				"4:final",
				"5:d3",
				"6:d3",
				"7:d3",
				"8:d3",
			]);
		});
	});
});
