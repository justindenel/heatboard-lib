import { describe, expect, test } from "vitest";
import { parseFormat } from "../parse";
import type { FormatIssue } from "../model";

function valid() {
	return {
		heatboardFormat: 1,
		name: "Test",
		fill: "serpentine",
		rounds: [
			{
				key: "r1",
				name: "Round 1",
				heats: 2,
				outcomes: [{ ranks: [1, 2], to: "final" }],
			},
			{ key: "final", name: "Final", heats: 1 },
		],
	};
}

function errorsOf(json: unknown): FormatIssue[] {
	const result = parseFormat(json);
	if (result.ok) throw new Error("expected a refusal");
	return result.errors;
}

function paths(json: unknown): string[] {
	return errorsOf(json).map((e) => e.path);
}

describe("parseFormat", () => {
	test("accepts a valid format, also from a JSON string", () => {
		const result = parseFormat(valid());
		expect(result).toEqual({ ok: true, format: valid() });
		expect(parseFormat(JSON.stringify(valid()))).toEqual(result);
	});

	test("refuses invalid JSON text and non-objects", () => {
		expect(paths("{nope")).toEqual([""]);
		expect(paths([])).toEqual([""]);
		expect(paths(null)).toEqual([""]);
	});

	test("refuses a wrong version", () => {
		expect(paths({ ...valid(), heatboardFormat: 2 })).toEqual([
			"heatboardFormat",
		]);
	});

	test("refuses a missing name, a bad description and a bad fill", () => {
		expect(paths({ ...valid(), name: " " })).toEqual(["name"]);
		expect(paths({ ...valid(), description: 3 })).toEqual(["description"]);
		expect(paths({ ...valid(), fill: "random" })).toEqual(["fill"]);
	});

	test("refuses unknown fields with their path", () => {
		const f = valid();
		expect(paths({ ...f, extra: 1 })).toEqual(["extra"]);
		const g = valid();
		(g.rounds[0] as Record<string, unknown>).colour = "red";
		expect(paths(g)).toEqual(["rounds[0].colour"]);
	});

	test("refuses empty or oversized round lists", () => {
		expect(paths({ ...valid(), rounds: [] })).toEqual(["rounds"]);
		const many = Array.from({ length: 98 }, (_, i) => ({
			key: `r${i}`,
			name: "R",
			heats: 1,
		}));
		expect(paths({ ...valid(), rounds: many })).toEqual(["rounds"]);
		const ok = parseFormat({ ...valid(), rounds: many.slice(0, 97) });
		expect(ok.ok).toBe(true);
	});

	test("refuses bad and duplicate keys", () => {
		const f = valid();
		(f.rounds[0] as { key: string }).key = "Round 1";
		expect(paths(f)).toContain("rounds[0].key");
		const g = valid();
		(g.rounds[1] as { key: string }).key = "r1";
		expect(errorsOf(g)).toContainEqual({
			path: "rounds[1].key",
			message: 'Duplicate key "r1"',
		});
	});

	test("refuses bad names, groups and optional flags", () => {
		const f = valid();
		(f.rounds[0] as Record<string, unknown>).name = "";
		(f.rounds[0] as Record<string, unknown>).group = "Bad Group";
		(f.rounds[1] as Record<string, unknown>).optional = "yes";
		expect(paths(f).sort()).toEqual([
			"rounds[0].group",
			"rounds[0].name",
			"rounds[1].optional",
		]);
	});

	test("accepts a placement and refuses unknown ones", () => {
		const f = valid();
		(f.rounds[1] as Record<string, unknown>).placement = "spread";
		expect(parseFormat(f).ok).toBe(true);
		(f.rounds[1] as Record<string, unknown>).placement = "random";
		expect(paths(f)).toEqual(["rounds[1].placement"]);
	});

	test.each([0, 65, 1.5, "2"])("refuses heats = %j", (heats) => {
		const f = valid();
		(f.rounds[1] as Record<string, unknown>).heats = heats;
		expect(paths(f)).toEqual(["rounds[1].heats"]);
	});

	test("refuses a non-object round and non-array outcomes", () => {
		const f = valid();
		f.rounds[1] = 3 as never;
		expect(paths(f)).toContain("rounds[1]");
		const g = valid();
		(g.rounds[0] as Record<string, unknown>).outcomes = {};
		expect(paths(g)).toEqual(["rounds[0].outcomes"]);
	});

	test.each([[[1]], [[0, 2]], [[1.5, 2]], [[3, 2]], [["1", "2"]], [[1, 101]]])(
		"refuses ranks %j",
		(ranks) => {
			const f = valid();
			(f.rounds[0] as { outcomes: unknown[] }).outcomes = [
				{ ranks, to: "final" },
			];
			expect(paths(f)).toEqual(["rounds[0].outcomes[0].ranks"]);
		},
	);

	test("refuses overlapping rank ranges", () => {
		const f = valid();
		(f.rounds[0] as { outcomes: unknown[] }).outcomes = [
			{ ranks: [1, 2], to: "final" },
			{ ranks: [2, 3], to: "final" },
		];
		expect(errorsOf(f)).toEqual([
			{
				path: "rounds[0].outcomes[1].ranks",
				message: "Rank 2 is already used by another outcome",
			},
		]);
	});

	test("refuses an outcome target that is unknown, the round itself or an earlier round", () => {
		const unknown = valid();
		(unknown.rounds[0] as { outcomes: { to: string }[] }).outcomes[0]!.to =
			"nope";
		expect(paths(unknown)).toEqual(["rounds[0].outcomes[0].to"]);
		const self = valid();
		(self.rounds[0] as { outcomes: { to: string }[] }).outcomes[0]!.to = "r1";
		expect(paths(self)).toEqual(["rounds[0].outcomes[0].to"]);
		const back = valid();
		(back.rounds[1] as Record<string, unknown>).outcomes = [
			{ ranks: [1, 1], to: "r1" },
		];
		expect(paths(back)).toEqual(["rounds[1].outcomes[0].to"]);
	});

	test("reports every problem at once", () => {
		const f = valid();
		(f.rounds[0] as Record<string, unknown>).heats = 0;
		(f.rounds[1] as Record<string, unknown>).name = "";
		expect(paths({ ...f, fill: "x" })).toEqual([
			"fill",
			"rounds[0].heats",
			"rounds[1].name",
		]);
	});
});

describe("heatDurationSec", () => {
	test("is no longer a round field", () => {
		const json = valid();
		(json.rounds[0] as Record<string, unknown>).heatDurationSec = 720;
		expect(errorsOf(json).map((e) => e.path)).toEqual([
			"rounds[0].heatDurationSec",
		]);
	});
});

describe("seeds", () => {
	test("accepts a count on a main round other than the first", () => {
		const json = valid();
		(json.rounds[1] as Record<string, unknown>).seedSlots = 2;
		const result = parseFormat(json);
		expect(result.ok && result.format.rounds[1]?.seedSlots).toBe(2);
	});

	test("refuses them on the first round, on a side group and on an optional round", () => {
		const first = valid();
		(first.rounds[0] as Record<string, unknown>).seedSlots = 1;
		expect(paths(first)).toEqual(["rounds[0].seedSlots"]);
		const side = valid();
		(side.rounds[1] as Record<string, unknown>).seedSlots = 1;
		(side.rounds[1] as Record<string, unknown>).group = "repechage";
		expect(paths(side)).toEqual(["rounds[1].seedSlots"]);
		const optional = valid();
		(optional.rounds[1] as Record<string, unknown>).seedSlots = 1;
		(optional.rounds[1] as Record<string, unknown>).optional = true;
		expect(paths(optional)).toEqual(["rounds[1].seedSlots"]);
	});

	test("refuses a count that is not a non-negative integer", () => {
		for (const seedSlots of [-1, 1.5, "2", 1001]) {
			const json = valid();
			(json.rounds[1] as Record<string, unknown>).seedSlots = seedSlots;
			expect(paths(json), String(seedSlots)).toEqual(["rounds[1].seedSlots"]);
		}
	});
});
