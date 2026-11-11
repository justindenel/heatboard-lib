import { bracketTemplates, type RaceFormat } from "@heatboard/core";
import { describe, expect, it } from "vitest";
import { describeRaceFormat } from "../describeRaceFormat";
import { labels } from "../labels";

const wave = bracketTemplates.find((t) => t.id === "windsurfWave");
const format: RaceFormat = {
	timing: { heatDurationSec: 600, breakSec: 120 },
	...(wave?.scoring && { scoring: wave.scoring }),
	judgingMode: "free",
};

describe("describeRaceFormat", () => {
	it("writes timing, what is counted, the method and the judging mode", () => {
		expect(describeRaceFormat(format, labels.fr)).toBe(
			"Heat 10 min · pause 2 min · 2 Wave + 2 Jump · Points · Juges libres",
		);
		expect(describeRaceFormat(format, labels.en)).toBe(
			"Heat 10 min · break 2 min · 2 Wave + 2 Jump · Points · Free judges",
		);
	});

	it("leaves the judging mode out for spectators", () => {
		expect(describeRaceFormat(format, labels.fr, { judging: false })).toBe(
			"Heat 10 min · pause 2 min · 2 Wave + 2 Jump · Points",
		);
	});

	it("describes a heat that ran by its duration alone", () => {
		expect(
			describeRaceFormat(format, labels.fr, { ran: true, judging: false }),
		).toBe("10 min · 2 Wave + 2 Jump · Points");
	});

	it("falls back to manual ranking and skips an absent timing", () => {
		expect(
			describeRaceFormat({ timing: {}, judgingMode: "free" }, labels.fr),
		).toBe("Classement manuel");
	});
});
