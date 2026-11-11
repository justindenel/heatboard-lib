import { describe, expect, it } from "vitest";
import { scoreNeeded } from "../needed";
import { byJudge, config, merge, penalty, score, scored } from "./helpers";

const setup = () => {
	const d = merge(scored("a", "wave", [[8, 8]]), scored("b", "wave", [[6, 6]]));
	return { ...d, ids: ["a", "b"] };
};

describe("scoreNeeded", () => {
	it("reached when already at the target rank or better", () => {
		const { rides, scores, ids } = setup();
		expect(
			scoreNeeded(config(), ids, rides, scores, [], "a", 1, "wave"),
		).toEqual({
			status: "reached",
		});
	});

	it("gives the smallest grid value that strictly beats the target", () => {
		const { rides, scores, ids } = setup();
		const cfg = config({ categories: [{ type: "wave", counted: 2 }] });
		expect(scoreNeeded(cfg, ids, rides, scores, [], "b", 1, "wave")).toEqual({
			status: "needed",
			value: 2.1,
		});
	});

	it("is impossible when even the maximum is not enough", () => {
		const d = merge(
			scored("a", "wave", [[10, 10]]),
			scored("b", "wave", [[1, 1]]),
		);
		const cfg = config({ categories: [{ type: "wave", counted: 1 }] });
		expect(
			scoreNeeded(cfg, ["a", "b"], d.rides, d.scores, [], "b", 1, "wave"),
		).toEqual({
			status: "impossible",
		});
	});

	it("refuses a type outside the scale with a reason", () => {
		const { rides, scores, ids } = setup();
		expect(
			scoreNeeded(config(), ids, rides, scores, [], "b", 1, "spin"),
		).toEqual({
			status: "impossible",
			reason: "UNKNOWN_TYPE",
		});
	});

	it("estimates with the points method even for a placings config", () => {
		const { rides, scores, ids } = setup();
		const cfg = config({
			method: "placings",
			categories: [{ type: "wave", counted: 2 }],
		});
		expect(scoreNeeded(cfg, ids, rides, scores, [], "b", 1, "wave")).toEqual({
			status: "needed",
			value: 2.1,
		});
	});

	it("accounts for a penalty on the rider", () => {
		const d = merge(scored("a", "wave", [[8]]), scored("b", "wave", [[6]]));
		const cfg = config({ categories: [{ type: "wave", counted: 2 }] });
		expect(
			scoreNeeded(
				cfg,
				["a", "b"],
				d.rides,
				d.scores,
				[penalty("b", "halfSecondBest")],
				"b",
				1,
				"wave",
			),
		).toEqual({ status: "needed", value: 4.1 });
	});

	it("handles a new ride that replaces one outside the best N", () => {
		const { rides, scores, ids } = setup();
		const cfg = config({ categories: [{ type: "wave", counted: 1 }] });
		expect(scoreNeeded(cfg, ids, rides, scores, [], "b", 1, "wave")).toEqual({
			status: "needed",
			value: 8.1,
		});
	});

	it("applies the category coefficient", () => {
		const { rides, scores, ids } = setup();
		const cfg = config({
			categories: [
				{ type: "wave", counted: 1 },
				{ type: "jump", counted: 1, coefficient: 2 },
			],
		});
		expect(scoreNeeded(cfg, ids, rides, scores, [], "b", 1, "jump")).toEqual({
			status: "needed",
			value: 1.1,
		});
	});

	it("uses only validated judges with the sum aggregation", () => {
		const d = merge(
			scored("a", "wave", [[6, 6]]),
			scored("b", "wave", [[3, 3]]),
		);
		const cfg = config({
			aggregation: "sum",
			categories: [{ type: "wave", counted: 1 }],
		});
		const stray = score("ghost", "j3", 5);
		expect(
			scoreNeeded(
				cfg,
				["a", "b"],
				d.rides,
				[...d.scores, stray],
				[],
				"b",
				1,
				"wave",
			),
		).toEqual({ status: "needed", value: 6.1 });
	});

	it("refuses an invalid target rank", () => {
		const { rides, scores, ids } = setup();
		for (const rank of [0, 3, 1.5]) {
			expect(
				scoreNeeded(config(), ids, rides, scores, [], "b", rank, "wave"),
			).toEqual({ status: "impossible", reason: "INVALID_TARGET_RANK" });
		}
	});

	it("refuses an unknown rider", () => {
		const { rides, scores, ids } = setup();
		expect(
			scoreNeeded(config(), ids, rides, scores, [], "zz", 1, "wave"),
		).toEqual({ status: "impossible", reason: "UNKNOWN_RIDER" });
	});

	it("refuses an invalid scale", () => {
		const { rides, scores, ids } = setup();
		for (const scale of [
			{ min: 0, max: 10, step: Number.NaN },
			{ min: 0, max: 10, step: 0 },
			{ min: 5, max: 5, step: 0.1 },
			{ min: 0, max: Number.POSITIVE_INFINITY, step: 0.1 },
		]) {
			expect(
				scoreNeeded(config({ scale }), ids, rides, scores, [], "b", 1, "wave"),
			).toEqual({ status: "impossible", reason: "INVALID_SCALE" });
		}
	});
});

describe("scoreNeeded with per-judge rides", () => {
	it("adds one probe ride per judge, all with the same note", () => {
		const d = merge(
			byJudge("j1", "a", "wave", [8]),
			byJudge("j2", "a", "wave", [8]),
			byJudge("j1", "b", "wave", [6]),
			byJudge("j2", "b", "wave", [6]),
		);
		const cfg = config({ categories: [{ type: "wave", counted: 1 }] });
		expect(
			scoreNeeded(cfg, ["a", "b"], d.rides, d.scores, [], "b", 1, "wave"),
		).toEqual({ status: "needed", value: 8.1 });
	});

	it("works with judges whose rides differ in number", () => {
		const d = merge(
			byJudge("j1", "a", "wave", [4, 4]),
			byJudge("j2", "a", "wave", [4]),
			byJudge("j1", "b", "wave", [4]),
		);
		const cfg = config({ categories: [{ type: "wave", counted: 2 }] });
		const result = scoreNeeded(
			cfg,
			["a", "b"],
			d.rides,
			d.scores,
			[],
			"b",
			1,
			"wave",
		);
		expect(result).toEqual({ status: "needed", value: 4.1 });
	});
});
