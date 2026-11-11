import { defaultPlan, formatFromPlan, planFlow } from "@heatboard/core";
import { describe, expect, it } from "vitest";
import {
	addRound,
	modifiedCount,
	removeRound,
	resetFollowing,
	withFirstRound,
	withRepechage,
	withRepechageValues,
	withRiders,
	withRound,
	withSeedSlots,
	withSmallFinal,
} from "../components/formatPlanEdits";

const plan32 = () =>
	defaultPlan({ riders: 32, heats: 8, advance: 2, repechage: false });

const heatsOf = (plan: ReturnType<typeof plan32>) =>
	plan.rounds.map((r) => r.heats);

describe("plan edits", () => {
	it("recalculates the auto rounds from the riders", () => {
		expect(heatsOf(plan32())).toEqual([8, 4, 2, 1]);
		expect(heatsOf(withRiders(plan32(), 64))).toEqual([8, 2, 1]);
	});

	it("marks a changed round modified and keeps it through later recalculations", () => {
		const edited = withRound(plan32(), 1, { heats: 3 });
		expect(edited.rounds[1]).toMatchObject({ heats: 3, auto: false });
		expect(modifiedCount(edited)).toBe(1);
		const more = withRiders(edited, 40);
		expect(more.rounds[1]).toMatchObject({ heats: 3, auto: false });
	});

	it("does not mark round 1 modified", () => {
		const edited = withFirstRound(plan32(), { heats: 6 });
		expect(edited.rounds[0]).toMatchObject({ heats: 6, auto: false });
		expect(modifiedCount(edited)).toBe(0);
	});

	it("puts the following rounds back to auto with ↺ suite", () => {
		const edited = withRound(plan32(), 1, { heats: 3 });
		expect(resetFollowing(edited, 0)).toEqual(plan32());
		expect(modifiedCount(resetFollowing(edited, 0))).toBe(0);
	});

	it("adds a modified round before the final", () => {
		const added = addRound(plan32());
		expect(added?.rounds).toHaveLength(5);
		expect(added?.rounds[3]).toMatchObject({ auto: false });
		expect(added?.rounds[4]?.advance).toBe(0);
	});

	it("cannot add a round to a lone final", () => {
		const lone = defaultPlan({
			riders: 4,
			heats: 1,
			advance: 2,
			repechage: false,
		});
		expect(addRound(lone)).toBeUndefined();
	});

	it("removes a middle round and turns the following ones modified", () => {
		const removed = removeRound(plan32(), 1);
		expect(removed.rounds.length).toBeLessThan(4);
		expect(removed.rounds.slice(1).every((r) => !r.auto)).toBe(true);
	});

	it("keeps round 1 and the final", () => {
		const plan = plan32();
		expect(removeRound(plan, 0)).toBe(plan);
		expect(removeRound(plan, plan.rounds.length - 1)).toBe(plan);
	});

	it("adds and removes a repechage without changing the state of its round", () => {
		const withRep = withRepechage(plan32(), 1, true);
		expect(withRep.rounds[1]?.repechage).toMatchObject({ auto: true });
		expect(withRep.rounds[1]?.auto).toBe(true);
		const without = withRepechage(withRep, 1, false);
		expect(without.rounds[1]?.repechage).toBeUndefined();
	});

	it("marks a repechage modified when its heats are changed", () => {
		const withRep = withFirstRound(plan32(), { repechage: true });
		const edited = withRepechageValues(withRep, 0, { heats: 3 });
		expect(edited.rounds[0]?.repechage).toMatchObject({
			heats: 3,
			auto: false,
		});
		expect(modifiedCount(edited)).toBe(1);
	});

	it("remembers the small final choice, which only takes effect when there is a round before the final", () => {
		expect(withSmallFinal(plan32(), true).smallFinal).toBe(true);
		const lone = defaultPlan({
			riders: 4,
			heats: 1,
			advance: 2,
			repechage: false,
		});
		const chosen = withSmallFinal(lone, true);
		expect(chosen.smallFinal).toBe(true);
		expect(formatFromPlan(chosen).rounds.some((r) => r.optional)).toBe(false);
	});

	it("keeps the small final across a change that leaves a single round", () => {
		const lone = withFirstRound(withSmallFinal(plan32(), true), { heats: 1 });
		expect(lone.rounds).toHaveLength(1);
		expect(lone.smallFinal).toBe(true);
		const back = withFirstRound(lone, { heats: 8 });
		expect(back.rounds.length).toBeGreaterThanOrEqual(2);
		expect(back.smallFinal).toBe(true);
	});

	it("takes the seeds of a round out of round 1 and adds them to that round", () => {
		const plan = withSeedSlots(plan32(), 1, 4);
		const flow = planFlow(plan);
		expect(flow.rounds[0]?.incoming).toBe(28);
		expect(flow.rounds[1]?.seedSlots).toBe(4);
		expect(plan.rounds[1]?.auto).toBe(true);
		expect(formatFromPlan(plan).rounds[1]?.seedSlots).toBe(4);
	});

	it("keeps a modified round as it is and removes the seeds on 0", () => {
		const edited = withSeedSlots(withRound(plan32(), 1, { heats: 3 }), 1, 2);
		expect(edited.rounds[1]).toMatchObject({
			heats: 3,
			auto: false,
			seedSlots: 2,
		});
		const none = withSeedSlots(edited, 1, 0);
		expect(none.rounds[1]?.seedSlots).toBeUndefined();
		expect(planFlow(none).rounds[0]?.incoming).toBe(32);
	});

	it("ignores seeds on round 1", () => {
		expect(withSeedSlots(plan32(), 0, 3)).toEqual(plan32());
	});

	it("keeps the seeds when the riders change", () => {
		const plan = withRiders(withSeedSlots(plan32(), 1, 4), 40);
		expect(planFlow(plan).rounds[0]?.incoming).toBe(36);
		expect(plan.rounds[1]?.seedSlots).toBe(4);
	});
});
