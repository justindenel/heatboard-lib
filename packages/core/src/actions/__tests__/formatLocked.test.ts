import { describe, expect, test } from "vitest";
import type { Action } from "..";
import type { FormatSettings } from "../../format/model";
import { formatPresets } from "../../format/presets";
import type { Bracket } from "../../model";
import {
	bracket,
	errorCode,
	okBracket,
	run,
	sampleBracket,
} from "../../__tests__/fixtures";

const withFormat = (): Bracket =>
	okBracket(
		bracket([], {
			entries: Array.from({ length: 16 }, (_, i) => ({
				riderId: `p${i + 1}`,
				displayName: `Rider ${i + 1}`,
			})),
			status: "published",
		}),
		{
			type: "applyFormat",
			format: formatPresets.find(
				(p) => p.name === "Single elimination",
			) as FormatSettings,
			drawSeed: 1,
		},
	);

describe("a stored format owns the structure", () => {
	const manual: Action[] = [
		{
			type: "addRound",
			round: { id: "x", name: "X", group: "main", maxPerHeat: 4, advancing: 2 },
		},
		{ type: "removeRound", roundId: "r2" },
		{ type: "addHeat", roundId: "r1", heat: { id: "extra" } },
		{ type: "removeHeat", heatId: "r1-4" },
		{ type: "setMaxPerHeat", roundId: "r1", max: 9 },
		{ type: "updateRound", roundId: "r1", advancing: 1 },
	];

	test("refuses every manual edit of heats, rounds, heat size and qualifiers", () => {
		const b = withFormat();
		for (const action of manual) {
			const result = run(b, action);
			expect(!result.ok && result.error).toMatchObject({
				code: "FORMAT_LOCKED",
				details: { type: action.type },
			});
		}
	});

	test("still allows names and values that do not change", () => {
		const b = withFormat();
		const round = b.rounds[0];
		expect(
			errorCode(b, { type: "renameRound", roundId: "r1", name: "A" }),
		).toBe("ok");
		expect(
			errorCode(b, {
				type: "updateRound",
				roundId: "r1",
				advancing: round?.advancing as number,
			}),
		).toBe("ok");
		expect(
			errorCode(b, {
				type: "setMaxPerHeat",
				roundId: "r1",
				max: round?.maxPerHeat as number,
			}),
		).toBe("ok");
	});

	test("a bracket without a stored format keeps the manual tools", () => {
		const b = sampleBracket();
		expect(b.format).toBeUndefined();
		expect(errorCode(b, { type: "setMaxPerHeat", roundId: "r1", max: 5 })).toBe(
			"ok",
		);
		expect(
			errorCode(b, { type: "updateRound", roundId: "r1", advancing: 3 }),
		).toBe("ok");
	});
});

describe("race format of a stored format", () => {
	test("setRaceFormat is allowed and survives a rebuild of the rounds", () => {
		const updated = okBracket(withFormat(), {
			type: "setRaceFormat",
			timing: { heatDurationSec: 720 },
		});
		const rebuilt = okBracket(updated, {
			type: "applyFormat",
			format: updated.format?.settings as FormatSettings,
			drawSeed: 5,
		});
		expect(rebuilt.timing).toEqual({ heatDurationSec: 720 });
	});
});
