import { defaultPlan } from "@heatboard/core";
import { describe, expect, it } from "vitest";
import {
	focusTransition,
	placementStudy,
} from "../components/formatPlacementStudy";

const plan = (riders: number, heats: number, repechage: boolean) =>
	defaultPlan({ riders, heats, advance: 2, repechage });

describe("placementStudy", () => {
	it("finds no difference between branch and spread for 26 riders with a repechage", () => {
		const study = placementStudy(plan(26, 7, true));
		expect(study.every((t) => !t.differs)).toBe(true);
	});

	it("finds a transition where branch and spread differ for 16 riders", () => {
		const study = placementStudy(plan(16, 4, false));
		const focus = focusTransition(study);
		expect(focus?.differs).toBe(true);
		expect(focus?.branch).not.toEqual(focus?.spread);
	});

	it("finds no difference for 16 riders when a repechage makes the next round uneven", () => {
		const study = placementStudy(plan(16, 4, true));
		expect(study.every((t) => !t.differs)).toBe(true);
	});

	it("gives one assignment per qualifier, repechage ones in their own lane", () => {
		const [first] = placementStudy(plan(16, 4, true));
		expect(first?.round).toBe(1);
		const main = first?.branch.filter((a) => a.lane === "main") ?? [];
		const repechage = first?.branch.filter((a) => a.lane === "repechage") ?? [];
		expect(main).toHaveLength(8);
		expect(repechage).toHaveLength(4);
		expect(first?.hasRepechage).toBe(true);
	});

	it("falls back to the first transition fed by a repechage, then to any with several heats", () => {
		const same = placementStudy(plan(26, 7, true));
		expect(focusTransition(same)?.hasRepechage).toBe(true);
		const lone = placementStudy(plan(8, 2, false));
		expect(focusTransition(lone)).toBeUndefined();
	});

	it("has nothing to study for a lone final", () => {
		expect(placementStudy(plan(4, 1, false))).toEqual([]);
	});
});
