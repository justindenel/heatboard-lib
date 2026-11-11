import { describe, expect, test } from "vitest";
import type { Action } from "..";
import type { Bracket } from "../../model";
import { config, halfStepScale } from "../../scoring/__tests__/helpers";
import { scoringPresets } from "../../scoring/presets";
import {
	advanceHeat,
	errorCode,
	link,
	okBracket,
	run,
	sampleBracket,
} from "../../__tests__/fixtures";

const heatIn = (b: Bracket, id: string) =>
	b.rounds.flatMap((r) => r.heats).find((h) => h.id === id);

const flagged = (b: Bracket) =>
	b.rounds
		.flatMap((r) => r.heats)
		.filter((h) => h.needsReview)
		.map((h) => h.id);

/** h1 judged with a, b, c, d ranked in that order; a sits in h3 and e in h4. */
const afterH1 = (): Bracket => {
	let b = sampleBracket();
	b = okBracket(b, { type: "place", riderId: "a", heatId: "h3" });
	b = okBracket(b, { type: "place", riderId: "e", heatId: "h4" });
	return advanceHeat(b, "h1", "judged");
};

describe("updateRound", () => {
	const update = (
		roundId: string,
		extra: {
			advancing?: number;
			heatDurationSec?: number | null;
			confirm?: boolean;
		},
	): Action => ({ type: "updateRound", roundId, ...extra });

	test("changes advancing on a round without judged heat, ignoring confirm", () => {
		const b = sampleBracket();
		const next = okBracket(b, update("r1", { advancing: 3, confirm: true }));
		expect(next.rounds[0]?.advancing).toBe(3);
		expect(next.rounds[0]?.heats).toBe(b.rounds[0]?.heats);
		expect(next.rounds[1]).toBe(b.rounds[1]);
		expect(flagged(next)).toEqual([]);
	});

	test("same value or no field is a no-op", () => {
		const b = afterH1();
		for (const action of [update("r1", { advancing: 2 }), update("r1", {})]) {
			const result = run(b, action);
			expect(result.ok && result.bracket).toBe(b);
		}
	});

	test("refusals", () => {
		const b = sampleBracket();
		expect(errorCode(b, update("x", { advancing: 2 }))).toBe("UNKNOWN_ROUND");
		for (const advancing of [0, -1, 1.5, Number.NaN]) {
			expect(errorCode(b, update("r1", { advancing }))).toBe(
				"INVALID_ARGUMENT",
			);
		}
	});

	test("destructive when the round holds a judged heat", () => {
		const b = afterH1();
		const result = run(b, update("r1", { advancing: 3 }));
		expect(!result.ok && result.error).toMatchObject({
			code: "DESTRUCTIVE_CHANGE",
			details: { judgedHeats: 1 },
		});
	});

	test("with confirm, flags later heats holding riders of the judged heats", () => {
		const b = afterH1();
		const next = okBracket(b, update("r1", { advancing: 3, confirm: true }));
		expect(next.rounds[0]?.advancing).toBe(3);
		expect(flagged(next)).toEqual(["h3"]);
		expect(next.rounds[2]).toBe(b.rounds[2]);
		expect(next.rounds[0]?.heats).toBe(b.rounds[0]?.heats);
	});

	test("a locked heat counts as judged; a judged heat in another round does not", () => {
		const locked = advanceHeat(sampleBracket(), "h1", "locked");
		expect(errorCode(locked, update("r1", { advancing: 3 }))).toBe(
			"DESTRUCTIVE_CHANGE",
		);
		expect(errorCode(locked, update("r2", { advancing: 3 }))).toBe("ok");
	});
});

describe("setLinks", () => {
	const setLinks = (links: Bracket["links"], confirm?: boolean): Action => ({
		type: "setLinks",
		links,
		...(confirm === undefined ? {} : { confirm }),
	});

	test("applies directly when no changed link comes from a judged heat", () => {
		const b = afterH1();
		const links = [
			...b.links.filter((l) => l.from.heatId !== "h2"),
			link("h2", 1, "h4"),
		];
		const next = okBracket(b, setLinks(links));
		expect(next.links).toBe(links);
		expect(flagged(next)).toEqual([]);
		expect(next.rounds).toBe(b.rounds);
	});

	test("an identical set of links is a no-op", () => {
		const b = afterH1();
		const result = run(b, setLinks([...b.links].reverse()));
		expect(result.ok && result.bracket).toBe(b);
	});

	test("validates the links", () => {
		const b = sampleBracket();
		expect(errorCode(b, setLinks([link("x", 1, "h3")]))).toBe("UNKNOWN_HEAT");
		expect(errorCode(b, setLinks([link("h1", 1, "x")]))).toBe("UNKNOWN_HEAT");
		expect(errorCode(b, setLinks([link("h1", 0, "h3")]))).toBe("INVALID_LINK");
		expect(errorCode(b, setLinks([link("h1", 1, "h2")]))).toBe("INVALID_LINK");
		expect(errorCode(b, setLinks([link("h3", 1, "h1")]))).toBe("INVALID_LINK");
	});

	test("modifying a link from a judged heat needs confirmation", () => {
		const b = afterH1();
		const links = b.links.map((l) =>
			l.from.heatId === "h1" && l.from.rank === 1 ? link("h1", 1, "h4") : l,
		);
		const result = run(b, setLinks(links));
		expect(!result.ok && result.error).toMatchObject({
			code: "DESTRUCTIVE_CHANGE",
			details: { judgedHeats: 1 },
		});
		const next = okBracket(b, setLinks(links, true));
		expect(next.links).toBe(links);
		expect(flagged(next)).toEqual(["h3", "h4"]);
	});

	test("adding or removing a link from a judged heat is destructive", () => {
		const b = afterH1();
		const added = [...b.links, link("h1", 4, "h4")];
		expect(errorCode(b, setLinks(added))).toBe("DESTRUCTIVE_CHANGE");
		const removed = b.links.filter(
			(l) => !(l.from.heatId === "h1" && l.from.rank === 3),
		);
		expect(errorCode(b, setLinks(removed))).toBe("DESTRUCTIVE_CHANGE");
		const next = okBracket(b, setLinks(removed, true));
		expect(flagged(next)).toEqual(["h3"]);
	});
});

describe("setRaceFormat", () => {
	const changeScoring = (): Action => ({
		type: "setRaceFormat",
		scoring: config({ scale: halfStepScale }),
	});

	/** h1 judged (a, b, c, d), h2 locked (e, f, g, h), a in h3. */
	const judgedTwo = (): Bracket => {
		let b = sampleBracket();
		b = okBracket(b, { type: "place", riderId: "a", heatId: "h3" });
		b = advanceHeat(b, "h1", "judged");
		return advanceHeat(b, "h2", "locked");
	};

	test("applies directly when no heat has started", () => {
		const b = sampleBracket();
		const next = okBracket(b, changeScoring());
		expect(next.scoring).toEqual(config({ scale: halfStepScale }));
		expect(next.rounds).toBe(b.rounds);
	});

	test("never blocks, flags or rewrites heats that already ran", () => {
		const b = judgedTwo();
		const next = okBracket(b, changeScoring());
		expect(next.scoring).toEqual(config({ scale: halfStepScale }));
		expect(flagged(next)).toEqual([]);
		expect(heatIn(next, "h1")?.slots).toEqual(heatIn(b, "h1")?.slots);
		expect(heatIn(next, "h2")?.status).toBe("locked");
	});

	test("an identical scoring is a no-op", () => {
		const b = okBracket(judgedTwo(), changeScoring());
		const result = run(b, changeScoring());
		expect(result.ok && result.bracket).toBe(b);
	});

	test("null removes the scoring", () => {
		const scored = okBracket(sampleBracket(), changeScoring());
		const removed = okBracket(scored, { type: "setRaceFormat", scoring: null });
		expect(Object.hasOwn(removed, "scoring")).toBe(false);
		expect(removed.rounds).toBe(scored.rounds);
	});

	test("null without scoring is a no-op", () => {
		const b = sampleBracket();
		const result = run(b, { type: "setRaceFormat", scoring: null });
		expect(result.ok && result.bracket).toBe(b);
	});

	test("null is allowed once a heat has started and the heat keeps its scoring", () => {
		const started = okBracket(
			okBracket(sampleBracket("published"), changeScoring()),
			{ type: "setHeatStatus", heatId: "h1", status: "running" },
		);
		const next = okBracket(started, { type: "setRaceFormat", scoring: null });
		expect(Object.hasOwn(next, "scoring")).toBe(false);
		expect(heatIn(next, "h1")?.scoring).toEqual(
			config({ scale: halfStepScale }),
		);
	});
});

describe("scoring scale validation", () => {
	const withScale = (scale: {
		min: number;
		max: number;
		step: number;
	}): Action => ({ type: "setRaceFormat", scoring: config({ scale }) });

	test("accepts a step of 1 or 0.5 on a grid-aligned range", () => {
		for (const scale of [
			{ min: 0, max: 10, step: 0.5 },
			{ min: 0, max: 10, step: 1 },
			{ min: 1, max: 9.5, step: 0.5 },
		]) {
			expect(errorCode(sampleBracket(), withScale(scale))).toBe("ok");
		}
	});

	test("refuses any other step, including 0.1", () => {
		for (const step of [0.1, 0.25, 2, 0, -0.5, Number.NaN]) {
			const result = run(sampleBracket(), withScale({ min: 0, max: 10, step }));
			expect(!result.ok && result.error).toMatchObject({
				code: "INVALID_SCORING",
				details: { field: "scale.step" },
			});
		}
	});

	test("refuses bounds off the step grid or inverted", () => {
		const cases: Array<[{ min: number; max: number; step: number }, string]> = [
			[{ min: 0.5, max: 10, step: 1 }, "scale.min"],
			[{ min: 0, max: 9.5, step: 1 }, "scale.max"],
			[{ min: 0, max: Number.POSITIVE_INFINITY, step: 1 }, "scale.max"],
			[{ min: Number.NaN, max: 10, step: 1 }, "scale.min"],
			[{ min: 5, max: 5, step: 0.5 }, "scale.max"],
			[{ min: 6, max: 5, step: 0.5 }, "scale.max"],
		];
		for (const [scale, field] of cases) {
			const result = run(sampleBracket(), withScale(scale));
			expect(!result.ok && result.error).toMatchObject({
				code: "INVALID_SCORING",
				details: { field },
			});
		}
	});

	test("is checked before the destructive confirmation", () => {
		const b = okBracket(sampleBracket(), {
			type: "setRaceFormat",
			scoring: config({ scale: halfStepScale }),
		});
		const judged = advanceHeat(b, "h1", "judged");
		expect(errorCode(judged, withScale({ min: 0, max: 10, step: 0.1 }))).toBe(
			"INVALID_SCORING",
		);
	});

	test("accepts a config with figures and the windsurf preset", () => {
		const scoring = {
			...config({ scale: halfStepScale }),
			categories: [
				{
					type: "Saut",
					counted: 2,
					families: [{ id: "back", name: "Back" }],
					figures: [{ code: "Backloop", family: "back" }],
				},
			],
		};
		const next = okBracket(sampleBracket(), { type: "setRaceFormat", scoring });
		expect(next.scoring?.categories[0]?.figures).toEqual([
			{ code: "Backloop", family: "back" },
		]);
		const preset = okBracket(sampleBracket(), {
			type: "setRaceFormat",
			scoring: scoringPresets.windsurfWave,
		});
		expect(preset.scoring).toEqual(scoringPresets.windsurfWave);
	});
});
