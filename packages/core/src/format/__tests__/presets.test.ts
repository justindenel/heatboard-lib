import { describe, expect, test } from "vitest";
import { exportFormat } from "../export";
import { parseFormat } from "../parse";
import { formatPresets } from "../presets";
import type { FormatSettings } from "../model";

describe("formatPresets", () => {
	test("exposes the two built-in formats", () => {
		expect(formatPresets.map((p) => p.name)).toEqual([
			"Single elimination",
			"Chained repechage",
		]);
	});

	test.each(formatPresets.map((p) => [p.name, p] as const))(
		"%s passes parseFormat and survives an export round trip",
		(_name, preset) => {
			expect(parseFormat(preset)).toEqual({ ok: true, format: preset });
			expect(parseFormat(exportFormat(preset))).toEqual({
				ok: true,
				format: preset,
			});
		},
	);
});

describe("exportFormat", () => {
	const format: FormatSettings = {
		heatboardFormat: 1,
		name: "X",
		description: "d",
		fill: "draw",
		rounds: [
			{
				optional: true,
				outcomes: [{ to: "b", ranks: [1, 2] }],
				heats: 2,
				group: "g",
				name: "A",
				key: "a",
			},
			{ heats: 1, name: "B", key: "b" },
		],
	};

	test("uses a stable key order whatever the input order", () => {
		const json = JSON.parse(exportFormat(format)) as Record<string, unknown>;
		expect(Object.keys(json)).toEqual([
			"heatboardFormat",
			"name",
			"description",
			"fill",
			"rounds",
		]);
		const round = (json.rounds as Record<string, unknown>[])[0] as Record<
			string,
			unknown
		>;
		expect(Object.keys(round)).toEqual([
			"key",
			"name",
			"group",
			"heats",
			"outcomes",
			"optional",
		]);
		expect(Object.keys((round.outcomes as object[])[0] as object)).toEqual([
			"ranks",
			"to",
		]);
	});

	test("is indented and keeps rank ranges on one line", () => {
		const text = exportFormat(format);
		expect(text).toContain('\n  "name": "X"');
		expect(text).toContain('"ranks": [1, 2]');
	});

	test("omits absent optional fields", () => {
		const text = exportFormat({
			...format,
			description: undefined,
			rounds: [{ key: "a", name: "A", heats: 1 }],
		});
		expect(text).not.toContain("description");
		expect(text).not.toContain("outcomes");
	});

	test("round trips a format using every field", () => {
		expect(parseFormat(exportFormat(format))).toEqual({ ok: true, format });
	});
});
