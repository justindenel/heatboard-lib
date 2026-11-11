import { describe, expect, test } from "vitest";
import type { FormatSettings } from "../format/model";
import { formatPresets } from "../format/presets";
import type { Bracket } from "../model";
import { heatNumbers } from "../queries";
import { bracket, okBracket, sampleBracket } from "./fixtures";

const preset = (name: string): FormatSettings =>
	formatPresets.find((p) => p.name === name) as FormatSettings;

const entries = (count: number) =>
	Array.from({ length: count }, (_, i) => ({
		riderId: `p${i + 1}`,
		displayName: `Rider ${i + 1}`,
	}));

const built = (name: string, riders: number): Bracket =>
	okBracket(bracket([], { entries: entries(riders), status: "published" }), {
		type: "applyFormat",
		format: preset(name),
		drawSeed: 5,
	});

const heatIdsInOrder = (b: Bracket) =>
	b.rounds.flatMap((round) => round.heats.map((heat) => heat.id));

describe("heatNumbers", () => {
	test("numbers the heats of a simple bracket in running order", () => {
		expect(heatNumbers(sampleBracket())).toEqual({
			h1: 1,
			h2: 2,
			h3: 3,
			h4: 4,
		});
	});

	test("repechages and finals are numbered like any other round", () => {
		const b = built("Chained repechage", 16);
		expect(b.rounds.some((round) => round.group === "repechage")).toBe(true);
		const numbers = heatNumbers(b);
		const ids = heatIdsInOrder(b);
		expect(ids.map((id) => numbers[id])).toEqual(
			ids.map((_, index) => index + 1),
		);
	});

	test("the double elimination continues the numbering after the single side", () => {
		let single = built("Single elimination", 16);
		for (const round of single.rounds) {
			for (const heat of round.heats) {
				for (const status of ["running", "judged"] as const) {
					if (status === "judged") {
						single = okBracket(single, {
							type: "rankByPosition",
							heatId: heat.id,
						});
					}
					single = okBracket(single, {
						type: "setHeatStatus",
						heatId: heat.id,
						status,
					});
				}
			}
		}
		const double = okBracket(single, {
			type: "openDoubleElimination",
			mode: "duels",
		});
		const before = heatNumbers(single);
		const after = heatNumbers(double);
		expect(Object.keys(after).length).toBeGreaterThan(
			Object.keys(before).length,
		);
		for (const [id, number] of Object.entries(before)) {
			expect(after[id]).toBe(number);
		}
		const ids = heatIdsInOrder(double);
		expect(ids.map((id) => after[id])).toEqual(ids.map((_, i) => i + 1));
	});

	test("an empty bracket has no number", () => {
		expect(heatNumbers(bracket([]))).toEqual({});
	});
});
