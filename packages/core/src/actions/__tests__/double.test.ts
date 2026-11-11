import { describe, expect, test } from "vitest";
import type { Action } from "..";
import { generateDoubleElimination } from "../../format/double";
import type { FormatSettings } from "../../format/model";
import { defaultPlan, formatFromPlan } from "../../format/plan";
import { formatPresets } from "../../format/presets";
import type { Bracket, Entry } from "../../model";
import { computeStandings } from "../../standings";
import { validateBracket } from "../../validate";
import { bracket, errorCode, okBracket, run } from "../../__tests__/fixtures";

const entries = (count: number): Entry[] =>
	Array.from({ length: count }, (_, i) => ({
		riderId: `p${String(i + 1).padStart(2, "0")}`,
		displayName: `Rider ${i + 1}`,
	}));

const preset = (name: string): FormatSettings =>
	formatPresets.find((p) => p.name === name) as FormatSettings;

const start = (
	format: FormatSettings = preset("Single elimination"),
	riders = 16,
): Bracket =>
	okBracket(bracket([], { entries: entries(riders), status: "published" }), {
		type: "applyFormat",
		format,
		drawSeed: 11,
	});

const open = (
	b: Bracket,
	mode: "duels" | "heats" = "duels",
	superFinal?: boolean,
) =>
	okBracket(b, {
		type: "openDoubleElimination",
		mode,
		...(superFinal !== undefined && { superFinal }),
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

const playRound = (b: Bracket, roundId: string): Bracket => {
	let current = b;
	const round = current.rounds.find((r) => r.id === roundId);
	for (const heat of round?.heats ?? []) {
		if (heat.slots.length > 0 && heat.status === "pending") {
			current = judge(current, heat.id);
		}
	}
	return current;
};

const playAll = (b: Bracket, upTo?: string): Bracket => {
	let current = b;
	for (const round of b.rounds) {
		current = playRound(current, round.id);
		if (round.id === upTo) break;
	}
	return current;
};

const ridersOf = (b: Bracket, roundId: string) =>
	b.rounds
		.find((r) => r.id === roundId)
		?.heats.flatMap((h) => h.slots.map((s) => s.riderId)) ?? [];

const finishedTable = (format?: FormatSettings, riders?: number): Bracket =>
	playAll(start(format, riders));

const refusal = (b: Bracket, action: Action) => {
	const result = run(b, action);
	if (result.ok) throw new Error("expected a refusal");
	return result.error;
};

describe("openDoubleElimination", () => {
	test("once table 1 is finished: appends the double rounds and links, nothing else changes", () => {
		const before = finishedTable();
		const after = open(before);
		const generated = generateDoubleElimination(preset("Single elimination"), {
			finalMode: "duels",
		});
		if (!generated.ok) throw new Error(generated.code);
		const added = generated.format.rounds.filter((r) => r.group === "double");

		expect(after.rounds.slice(0, before.rounds.length)).toEqual(before.rounds);
		expect(after.rounds.slice(before.rounds.length).map((r) => r.id)).toEqual(
			added.map((r) => r.key),
		);
		expect(after.rounds.at(-1)?.optional).toBe(true);
		expect(after.format).toEqual(before.format);
		expect(after.links).toContainEqual({
			from: { heatId: "r1-1", rank: 3 },
			to: { heatId: "d1-1" },
		});
		expect(after.links).toContainEqual({
			from: { heatId: "r1-1", rank: 1 },
			to: { heatId: "r2-1" },
		});
		expect(validateBracket(after)).toEqual([]);
	});

	test("stores a single link per (fromHeat, rank)", () => {
		for (const mode of ["duels", "heats"] as const) {
			const after = open(finishedTable(), mode);
			const keys = after.links.map((l) => `${l.from.heatId}#${l.from.rank}`);
			expect(new Set(keys).size).toBe(keys.length);
		}
	});

	test("without the super final", () => {
		const after = open(finishedTable(), "duels", false);
		expect(after.rounds.some((r) => r.id === "super-final")).toBe(false);
		const doubleFinal = after.rounds.find((r) => r.id === "double-final");
		expect(doubleFinal?.group).toBe("double");
		expect(
			after.links
				.filter((l) => l.from.heatId === "double-final-1")
				.every((l) => l.to === "eliminated"),
		).toBe(true);
		expect(validateBracket(after)).toEqual([]);
	});

	test("names the generated rounds from the given names", () => {
		const after = okBracket(finishedTable(), {
			type: "openDoubleElimination",
			mode: "duels",
			names: {
				double: "Double {n}",
				doubleFinal: "Finale du double",
				superFinal: "Super finale",
			},
		});
		const added = after.rounds.filter((r) => r.group === "double");
		expect(added[0]?.name).toBe("Double 1");
		expect(added.find((r) => r.id === "double-final")?.name).toBe(
			"Finale du double",
		);
		expect(added.at(-1)?.name).toBe("Super finale");
	});

	test("heats mode ends on a double final of several riders", () => {
		const after = open(finishedTable(), "heats");
		expect(after.rounds.at(-1)?.id).toBe("double-final");
		expect(after.rounds.some((r) => r.optional)).toBe(false);
		expect(validateBracket(after)).toEqual([]);
	});

	test("refused while a heat of a required round is not judged, whatever the status", () => {
		const midTable = judge(judge(start(), "r1-1"), "r1-2");
		expect(midTable.status).toBe("running");
		expect(
			refusal(midTable, { type: "openDoubleElimination", mode: "duels" }),
		).toMatchObject({
			code: "DOUBLE_UNAVAILABLE",
			details: { reason: "TABLE_NOT_FINISHED" },
		});
		expect(
			refusal(start(), { type: "openDoubleElimination", mode: "duels" })
				.details,
		).toEqual({ reason: "TABLE_NOT_FINISHED" });
		const reopened = okBracket(finishedTable(), {
			type: "setHeatStatus",
			heatId: "final-1",
			status: "running",
		});
		expect(reopened.status).toBe("running");
		expect(
			refusal(reopened, { type: "openDoubleElimination", mode: "duels" })
				.details,
		).toEqual({ reason: "TABLE_NOT_FINISHED" });
	});

	test("after table 1 finished: every known eliminated rider is placed, standings unchanged", () => {
		const b = finishedTable();
		expect(b.status).toBe("finished");
		const after = open(b);
		expect(after.status).toBe("running");
		expect(ridersOf(after, "d1")).toHaveLength(8);
		expect(ridersOf(after, "d2")).toHaveLength(4);
		expect(after.rounds.slice(0, b.rounds.length)).toEqual(b.rounds);
		expect(computeStandings(after)).toEqual(computeStandings(b));
		expect(validateBracket(after)).toEqual([]);
	});

	test("standings follow the double once it is played", () => {
		const b = playAll(open(finishedTable()), "double-final");
		const standings = computeStandings(b);
		expect(standings).toHaveLength(16);
		expect(standings.slice(0, 2).map((s) => s.lastRoundId)).toEqual([
			"double-final",
			"double-final",
		]);
		expect(standings.slice(2, 4).map((s) => s.lastRoundId)).toEqual([
			"d7",
			"d6",
		]);
		const partial = computeStandings(open(finishedTable()));
		expect(partial.slice(0, 4).map((s) => s.lastRoundId)).toEqual([
			"final",
			"final",
			"final",
			"final",
		]);
	});

	test("refused when table 1 has a repechage or a small final", () => {
		const repechage = start(preset("Chained repechage"));
		expect(
			refusal(repechage, { type: "openDoubleElimination", mode: "duels" }),
		).toMatchObject({
			code: "DOUBLE_UNAVAILABLE",
			details: { reason: "NOT_SINGLE_ELIMINATION" },
		});
		const smallFinal = start(
			formatFromPlan(
				defaultPlan({
					riders: 16,
					heats: 4,
					advance: 2,
					repechage: false,
					smallFinal: true,
				}),
			),
		);
		expect(
			refusal(smallFinal, { type: "openDoubleElimination", mode: "heats" }),
		).toMatchObject({
			code: "DOUBLE_UNAVAILABLE",
			details: { reason: "NOT_SINGLE_ELIMINATION" },
		});
	});

	test("refused twice, without a stored format, or when the rounds drifted from it", () => {
		const opened = open(finishedTable());
		expect(
			errorCode(opened, { type: "openDoubleElimination", mode: "duels" }),
		).toBe("DOUBLE_OPEN");
		const bare = bracket([], { entries: entries(4), status: "published" });
		expect(
			refusal(bare, { type: "openDoubleElimination", mode: "duels" }),
		).toMatchObject({ details: { reason: "NO_FORMAT" } });
		const base = finishedTable();
		const drifted: Bracket = {
			...base,
			rounds: base.rounds.map((r) =>
				r.id === "r1"
					? {
							...r,
							heats: [...r.heats, { id: "extra", status: "judged", slots: [] }],
						}
					: r,
			),
		};
		expect(
			refusal(drifted, { type: "openDoubleElimination", mode: "duels" }),
		).toMatchObject({ details: { reason: "FORMAT_MISMATCH" } });
	});

	test("26 riders in 7, 4, 2, 1 heats: uneven heats are accepted from the real sizes", () => {
		const format = formatFromPlan(
			defaultPlan({
				riders: 26,
				heats: 7,
				advance: 2,
				repechage: false,
			}),
		);
		expect(format.rounds.map((r) => r.heats)).toEqual([7, 4, 2, 1]);
		const result = generateDoubleElimination(format, { finalMode: "duels" });
		expect(result).toEqual({ ok: false, code: "UNEVEN_HEATS" });

		const opened = open(finishedTable(format, 26));
		expect(validateBracket(opened)).toEqual([]);
		expect(ridersOf(opened, "d1")).toHaveLength(12);
		const finished = playAll(opened, "double-final");
		expect(computeStandings(finished)).toHaveLength(26);
		expect(validateBracket(finished)).toEqual([]);
	});
});

describe("closeDoubleElimination", () => {
	test("with table 1 judged and riders already placed in table 2", () => {
		const before = finishedTable();
		const opened = open(before);
		expect(ridersOf(opened, "d1")).toHaveLength(8);
		const closed = okBracket(opened, { type: "closeDoubleElimination" });
		expect(closed.rounds).toEqual(before.rounds);
		expect(closed.links).toEqual(before.links);
		expect(
			closed.rounds.flatMap((r) => r.heats).some((h) => h.needsReview),
		).toBe(false);
	});

	test("a finished bracket goes back to running when opened and to finished when closed", () => {
		const finished = finishedTable();
		expect(finished.status).toBe("finished");
		const opened = open(finished);
		expect(opened.status).toBe("running");
		const closed = okBracket(opened, { type: "closeDoubleElimination" });
		expect(closed.status).toBe("finished");
		expect(closed).toEqual(finished);
	});

	test("a table 1 heat reopened while the double is open: closing leaves the bracket running", () => {
		const reopened = okBracket(open(finishedTable()), {
			type: "setHeatStatus",
			heatId: "final-1",
			status: "running",
		});
		const closed = okBracket(reopened, { type: "closeDoubleElimination" });
		expect(closed.status).toBe("running");
	});

	test("refused once a double heat has started, or when there is none", () => {
		const opened = open(finishedTable());
		const running = okBracket(opened, {
			type: "setHeatStatus",
			heatId: "d1-1",
			status: "running",
		});
		expect(errorCode(running, { type: "closeDoubleElimination" })).toBe(
			"DOUBLE_STARTED",
		);
		expect(errorCode(start(), { type: "closeDoubleElimination" })).toBe(
			"DOUBLE_NOT_OPEN",
		);
	});
});

describe("applyFormat and an open double elimination", () => {
	test("refused while the double is open, accepted after closing it", () => {
		const opened = okBracket(open(finishedTable()), {
			type: "reset",
			keepRounds: 0,
			confirm: true,
		});
		const again: Action = {
			type: "applyFormat",
			format: preset("Single elimination"),
			drawSeed: 3,
		};
		expect(errorCode(opened, again)).toBe("DOUBLE_OPEN");
		expect(refusal(opened, again).details).toEqual({ reason: "APPLY_FORMAT" });
		const closed = okBracket(opened, { type: "closeDoubleElimination" });
		expect(errorCode(closed, again)).toBe("ok");
	});

	test("a stored format that contains double rounds keeps working", () => {
		const generated = generateDoubleElimination(preset("Single elimination"), {
			finalMode: "duels",
		});
		if (!generated.ok) throw new Error(generated.code);
		const legacy = start(generated.format);
		expect(
			errorCode(legacy, {
				type: "applyFormat",
				format: generated.format,
				drawSeed: 2,
			}),
		).toBe("ok");
		expect(
			errorCode(legacy, { type: "openDoubleElimination", mode: "heats" }),
		).toBe("DOUBLE_OPEN");
		const closed = okBracket(legacy, { type: "closeDoubleElimination" });
		expect(closed.rounds.map((r) => r.id)).toEqual(["r1", "r2", "final"]);
		expect(closed.format?.settings.rounds.map((r) => r.key)).toEqual([
			"r1",
			"r2",
			"final",
		]);
		expect(validateBracket(closed)).toEqual([]);
	});
});
