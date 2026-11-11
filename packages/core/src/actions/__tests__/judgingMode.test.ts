import { describe, expect, test } from "vitest";
import { validateBracket } from "../../validate";
import { judgingModeOf, viewerDisplayOf } from "../../queries";
import { config } from "../../scoring/__tests__/helpers";
import {
	advanceHeat,
	errorCode,
	okBracket,
	run,
	sampleBracket,
} from "../../__tests__/fixtures";

const m3 = () =>
	config({ method: "rideMeans", scale: { min: 0, max: 10, step: 0.5 } });

describe("judging mode resolution", () => {
	test("defaults to free and follows the bracket mode", () => {
		const b = sampleBracket();
		expect(judgingModeOf(b)).toBe("free");
		const headJudge = okBracket(b, {
			type: "setRaceFormat",
			judgingMode: "headJudge",
		});
		expect(judgingModeOf(headJudge)).toBe("headJudge");
	});

	test("setting the mode already in force is a no-op; free removes the field", () => {
		const b = sampleBracket();
		const same = run(b, { type: "setRaceFormat", judgingMode: "free" });
		expect(same.ok && same.bracket).toBe(b);
		const on = okBracket(b, {
			type: "setRaceFormat",
			judgingMode: "headJudge",
		});
		const off = okBracket(on, { type: "setRaceFormat", judgingMode: "free" });
		expect(off).not.toHaveProperty("judgingMode");
	});

	test("changing the mode is never blocked by a started heat", () => {
		const started = advanceHeat(sampleBracket(), "h1", "running");
		expect(
			errorCode(started, { type: "setRaceFormat", judgingMode: "headJudge" }),
		).toBe("ok");
	});
});

describe("rideMeans requires head-judge", () => {
	test("setRaceFormat refuses it in free mode and accepts it in head-judge", () => {
		const b = sampleBracket();
		const result = run(b, { type: "setRaceFormat", scoring: m3() });
		expect(!result.ok && result.error).toMatchObject({
			code: "INVALID_SCORING",
			details: { field: "method" },
		});
		const headJudge = okBracket(b, {
			type: "setRaceFormat",
			judgingMode: "headJudge",
		});
		expect(errorCode(headJudge, { type: "setRaceFormat", scoring: m3() })).toBe(
			"ok",
		);
	});

	test("setRaceFormat refuses leaving head-judge while the scoring is rideMeans", () => {
		let b = okBracket(sampleBracket(), {
			type: "setRaceFormat",
			judgingMode: "headJudge",
		});
		b = okBracket(b, { type: "setRaceFormat", scoring: m3() });
		const result = run(b, { type: "setRaceFormat", judgingMode: "free" });
		expect(!result.ok && result.error).toMatchObject({
			code: "INVALID_SCORING",
			details: { field: "method" },
		});
	});

	test("validateBracket reports it", () => {
		const b = { ...sampleBracket(), scoring: m3() };
		const errors = validateBracket(b);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toMatchObject({
			code: "INVALID_SCORING",
			details: { field: "method" },
		});
		expect(validateBracket({ ...b, judgingMode: "headJudge" })).toEqual([]);
	});

	test("validateBracket reports it on a bracket without rounds", () => {
		const b = {
			...sampleBracket(),
			rounds: [],
			links: [],
			entries: [],
			scoring: m3(),
		};
		expect(validateBracket(b).map((e) => e.code)).toContain("INVALID_SCORING");
		expect(validateBracket({ ...b, judgingMode: "headJudge" })).toEqual([]);
	});
});

describe("viewer display", () => {
	const withMethod = (method: "placings" | "points" | "rideMeans") => ({
		...sampleBracket(),
		scoring: config({ method }),
	});

	test("defaults: places on, rides only for ride means", () => {
		expect(viewerDisplayOf(withMethod("placings"))).toEqual({
			typeSubtotals: true,
			rides: false,
			judgePlaces: true,
			judges: false,
		});
		expect(viewerDisplayOf(withMethod("points"))).toEqual({
			typeSubtotals: true,
			rides: false,
			judgePlaces: true,
			judges: false,
		});
		expect(viewerDisplayOf(withMethod("rideMeans"))).toEqual({
			typeSubtotals: true,
			rides: true,
			judgePlaces: true,
			judges: false,
		});
		expect(viewerDisplayOf(sampleBracket()).rides).toBe(false);
	});

	test("setViewerDisplay merges, overrides defaults and is a no-op when unchanged", () => {
		const b = withMethod("points");
		const one = okBracket(b, {
			type: "setViewerDisplay",
			display: { rides: true },
		});
		const two = okBracket(one, {
			type: "setViewerDisplay",
			display: { judges: true },
		});
		expect(two.viewerDisplay).toEqual({ rides: true, judges: true });
		expect(viewerDisplayOf(two)).toMatchObject({ rides: true, judges: true });
		const same = run(two, {
			type: "setViewerDisplay",
			display: { rides: true },
		});
		expect(same.ok && same.bracket).toBe(two);
		const back = okBracket(two, {
			type: "setViewerDisplay",
			display: { rides: undefined },
		});
		expect(back.viewerDisplay).toEqual({ judges: true });
	});
});
