import { describe, expect, test } from "vitest";
import type { Action } from "..";
import { generateDoubleElimination } from "../../format/double";
import { defaultPlan, editorFromPlan, formatFromPlan } from "../../format/plan";
import { formatPresets } from "../../format/presets";
import type { FormatEditorState, FormatSettings } from "../../format/model";
import type { Bracket, Entry } from "../../model";
import { config } from "../../scoring/__tests__/helpers";
import { validateBracket } from "../../validate";
import { bracket, errorCode, okBracket, run } from "../../__tests__/fixtures";

const entries = (count: number, extra: Partial<Entry> = {}): Entry[] =>
	Array.from({ length: count }, (_, i) => ({
		riderId: `p${String(i + 1).padStart(2, "0")}`,
		displayName: `Rider ${i + 1}`,
		...extra,
	}));

const preset = (name: string): FormatSettings =>
	formatPresets.find((p) => p.name === name) as FormatSettings;

const base = (count = 16, status: Bracket["status"] = "published") =>
	bracket([], { entries: entries(count), status });

const apply = (
	format: FormatSettings,
	drawSeed = 1,
	editor?: FormatEditorState,
): Action => ({
	type: "applyFormat",
	format,
	drawSeed,
	...(editor && { editor }),
});

describe("applyFormat", () => {
	test("replaces rounds and links, places riders and stores the format", () => {
		const next = okBracket(base(), apply(preset("Single elimination"), 7));
		expect(next.rounds.map((r) => r.id)).toEqual(["r1", "r2", "final"]);
		expect(next.rounds[0]?.heats.map((h) => h.slots.length)).toEqual([
			4, 4, 4, 4,
		]);
		expect(next.rounds[1]?.heats.every((h) => h.slots.length === 0)).toBe(true);
		expect(next.links.length).toBeGreaterThan(0);
		expect(next.format).toEqual({
			settings: preset("Single elimination"),
			drawSeed: 7,
		});
		expect(validateBracket(next)).toEqual([]);
	});

	test("stores the editor state next to the format and drops it on the next apply without one", () => {
		const editor = { riders: 16, rounds: [{ auto: false }, { auto: true }] };
		const withEditor = okBracket(
			base(),
			apply(preset("Single elimination"), 7, editor),
		);
		expect(withEditor.format?.editor).toEqual(editor);
		expect(validateBracket(withEditor)).toEqual([]);
		const without = okBracket(withEditor, apply(preset("Single elimination")));
		expect(without.format).not.toHaveProperty("editor");
	});

	test("refuses a malformed editor state", () => {
		const bad = apply(preset("Single elimination"), 1, {
			riders: -1,
			rounds: [],
		});
		expect(errorCode(base(), bad)).toBe("INVALID_ARGUMENT");
		const stored = okBracket(base(), apply(preset("Single elimination")));
		const broken = {
			...stored,
			format: {
				...(stored.format as NonNullable<Bracket["format"]>),
				editor: { riders: 4, rounds: [{ auto: "yes" }] },
			},
		} as unknown as Bracket;
		expect(validateBracket(broken).map((e) => e.code)).toContain(
			"INVALID_FORMAT",
		);
	});

	test("is deterministic for a seed and can be replayed", () => {
		const once = okBracket(base(), apply(preset("Chained repechage"), 3));
		const again = okBracket(once, apply(preset("Chained repechage"), 3));
		expect(again).toEqual(once);
	});

	test("marks the optional round", () => {
		const generated = generateDoubleElimination(preset("Single elimination"), {
			finalMode: "duels",
		});
		if (!generated.ok) throw new Error(generated.code);
		const double = okBracket(base(), apply(generated.format));
		expect(double.rounds.find((r) => r.id === "super-final")?.optional).toBe(
			true,
		);
		expect(validateBracket(double)).toEqual([]);
	});

	test("refusals", () => {
		const started = okBracket(base(), apply(preset("Single elimination")));
		const running = okBracket(started, {
			type: "setHeatStatus",
			heatId: "r1-1",
			status: "running",
		});
		expect(errorCode(running, apply(preset("Single elimination")))).toBe(
			"ROUND_STARTED",
		);
		expect(
			errorCode(base(16, "validated"), apply(preset("Single elimination"))),
		).toBe("BRACKET_VALIDATED");
		expect(errorCode(base(), apply(preset("Single elimination"), 1.5))).toBe(
			"INVALID_ARGUMENT",
		);
		const outside = bracket([], {
			entries: entries(4, { entryRoundId: "elsewhere" }),
			status: "published",
		});
		expect(errorCode(outside, apply(preset("Single elimination")))).toBe(
			"UNKNOWN_ROUND",
		);
	});

	test("refuses a change that creates and removes more than 97 rounds in total", () => {
		const roundsOf = (prefix: string, count: number): FormatSettings => ({
			...preset("Single elimination"),
			rounds: Array.from({ length: count }, (_, i) => ({
				key: `${prefix}${i + 1}`,
				name: `Round ${i + 1}`,
				heats: 1,
			})),
		});
		const first = okBracket(base(), apply(roundsOf("a", 50)));
		expect(first.rounds).toHaveLength(50);

		const result = run(first, apply(roundsOf("b", 50)));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("ROUND_LIMIT");
			expect(result.error.details).toEqual({ count: 100, max: 97 });
		}
		expect(errorCode(first, apply(roundsOf("b", 47)))).toBe("ok");
		expect(errorCode(first, apply(roundsOf("a", 97)))).toBe("ok");
	});

	test("an invalid format is refused with its path", () => {
		const broken = {
			...preset("Single elimination"),
			rounds: [{ key: "A!", name: "A", heats: 1 }],
		} as FormatSettings;
		const result = run(base(), apply(broken));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("INVALID_FORMAT");
			expect(result.error.details?.path).toBe("rounds[0].key");
		}
	});

	test("rideMeans scoring in free mode is refused, accepted in head-judge mode", () => {
		const scoring = config({ method: "rideMeans" });
		const free = { ...base(), scoring };
		expect(errorCode(free, apply(preset("Single elimination")))).toBe(
			"INVALID_SCORING",
		);
		const head = { ...free, judgingMode: "headJudge" as const };
		expect(errorCode(head, apply(preset("Single elimination")))).toBe("ok");
	});
});

const judge = (b: Bracket, heatId: string): Bracket => {
	let current = okBracket(b, {
		type: "setHeatStatus",
		heatId,
		status: "running",
	});
	current = okBracket(current, { type: "rankByPosition", heatId });
	return okBracket(current, {
		type: "setHeatStatus",
		heatId,
		status: "judged",
	});
};

const judgeRound = (b: Bracket, roundId: string): Bracket =>
	(b.rounds.find((r) => r.id === roundId)?.heats ?? []).reduce(
		(current, h) => (h.slots.length > 0 ? judge(current, h.id) : current),
		b,
	);

const ridersIn = (b: Bracket, roundId: string): number =>
	b.rounds
		.find((r) => r.id === roundId)
		?.heats.reduce((sum, h) => sum + h.slots.length, 0) ?? 0;

describe("applyFormat with fewer entries than planned riders", () => {
	const plan = () =>
		defaultPlan({ riders: 16, heats: 4, advance: 2, repechage: false });
	const empty = () => bracket([], { entries: [], status: "published" });

	test("builds the capacities and links of the planned riders count", () => {
		const p = plan();
		const next = okBracket(
			empty(),
			apply(formatFromPlan(p), 1, editorFromPlan(p)),
		);
		expect(next.rounds.map((r) => r.maxPerHeat)).toEqual([4, 4, 4]);
		expect(next.links).toContainEqual({
			from: { heatId: "r1-1", rank: 1 },
			to: { heatId: "r2-1" },
		});
		expect(validateBracket(next)).toEqual([]);
	});

	test("riders added afterwards are drawn into the heats and their qualifiers advance", () => {
		const p = plan();
		let b = okBracket(empty(), apply(formatFromPlan(p), 1, editorFromPlan(p)));
		b = okBracket(b, { type: "addEntries", entries: entries(16) });
		b = okBracket(b, { type: "drawRound", roundId: "r1", drawSeed: 2 });
		expect(b.rounds[0]?.heats.map((h) => h.slots.length)).toEqual([4, 4, 4, 4]);
		b = judgeRound(b, "r1");
		expect(ridersIn(b, "r2")).toBe(8);
		expect(validateBracket(b)).toEqual([]);
	});

	test("without editor state the capacities follow the entries only", () => {
		const next = okBracket(empty(), apply(formatFromPlan(plan()), 1));
		expect(next.rounds[0]?.maxPerHeat).toBe(1);
	});
});

describe("a late rider following a link into a full heat", () => {
	test("the target heat of the format grows by one instead of refusing", () => {
		const p = defaultPlan({
			riders: 26,
			heats: 7,
			advance: 2,
			repechage: true,
		});
		let b = okBracket(
			bracket([], { entries: entries(26), status: "published" }),
			apply(formatFromPlan(p), 1, editorFromPlan(p)),
		);
		const repechage = b.rounds.find((r) => r.group === "repechage");
		const before = repechage?.maxPerHeat ?? 0;
		b = okBracket(b, {
			type: "addEntry",
			entry: { riderId: "late", displayName: "Late" },
		});
		const small = b.rounds[0]?.heats.find((h) => h.slots.length === 3);
		b = okBracket(b, {
			type: "place",
			riderId: "late",
			heatId: small?.id ?? "",
		});
		b = judgeRound(b, "r1");
		const after = b.rounds.find((r) => r.group === "repechage");
		expect(after?.maxPerHeat).toBe(before + 1);
		expect(after?.heats.map((h) => h.slots.length)).toEqual([5, 4, 4]);
		expect(validateBracket(b)).toEqual([]);
	});
});

describe("validateBracket and formats", () => {
	test("flags a stored format that no longer parses", () => {
		const b = okBracket(base(), apply(preset("Single elimination")));
		const broken: Bracket = {
			...b,
			format: {
				settings: { ...preset("Single elimination"), rounds: [] },
				drawSeed: 1,
			},
		};
		expect(validateBracket(broken).map((e) => e.code)).toEqual([
			"INVALID_FORMAT",
		]);
	});
});
