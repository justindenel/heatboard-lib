import { cleanup, fireEvent, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { scoringPresets, type Bracket, type Penalty } from "@heatboard/core";
import {
	expectRefused,
	makeRaceBracket,
	openHeatInspector,
	renderAdmin,
} from "./admin-helpers";

afterEach(cleanup);

function runningRace(penalties?: Penalty[]): Bracket {
	const bracket = makeRaceBracket({
		status: "running",
		scoring: scoringPresets.windsurfWave,
	});
	const round = bracket.rounds[0]!;
	round.heats[0] = {
		...round.heats[0]!,
		status: "running",
		...(penalties && { penalties }),
	};
	return bracket;
}

function open(bracket: Bracket, board = {}) {
	const view = renderAdmin(bracket, { board });
	return { ...view, panel: openHeatInspector(view.container, "h1") };
}

function change(element: HTMLElement, value: string) {
	fireEvent.change(element, { target: { value } });
}

const add = (panel: HTMLElement, rider = "Ann") =>
	fireEvent.click(
		within(panel).getByRole("button", { name: `Add penalty · ${rider}` }),
	);

describe("HeatPenalties", () => {
	it("lists the penalties of the heat", () => {
		const { panel } = open(
			runningRace([{ riderId: "r2", type: "Jump", kind: "zeroSecondBest" }]),
		);
		expect(within(panel).getByText("Jump · 2nd best ride at 0")).toBeTruthy();
		expect(within(panel).queryByText("No penalty.")).toBeNull();
	});

	it("adds a penalty for the chosen rider, category and kind", () => {
		const { panel, actions } = open(runningRace());
		expect(within(panel).getByText("No penalty.")).toBeTruthy();
		change(within(panel).getByLabelText("Category"), "Jump");
		change(within(panel).getByLabelText("Penalty"), "halfSecondBest");
		add(panel, "Cy");
		expect(actions).toEqual([
			{
				type: "addPenalty",
				heatId: "h1",
				penalty: { riderId: "r3", type: "Jump", kind: "halfSecondBest" },
			},
		]);
		expect(within(panel).getByText("Jump · 2nd best ride halved")).toBeTruthy();
	});

	it("removes a penalty", () => {
		const { panel, actions } = open(
			runningRace([
				{ riderId: "r1", type: "Wave", kind: "zeroBest" },
				{ riderId: "r2", type: "Wave", kind: "zeroBest" },
			]),
		);
		fireEvent.click(
			within(panel).getByRole("button", {
				name: "Remove Ann · Wave · Best ride at 0",
			}),
		);
		expect(actions).toEqual([
			{
				type: "removePenalty",
				heatId: "h1",
				penalty: { riderId: "r1", type: "Wave", kind: "zeroBest" },
			},
		]);
	});

	it("suggests a disqualification from two penalties", () => {
		const { panel } = open(runningRace());
		const suggestion = "Disqualification suggested for Ann";
		add(panel);
		expect(within(panel).queryByText(suggestion)).toBeNull();
		add(panel);
		expect(within(panel).getByText(suggestion)).toBeTruthy();
	});

	it("refuses an addition beyond the limit with the core reason", () => {
		const full = Array.from({ length: 50 }, (): Penalty => ({
			riderId: "r1",
			type: "Wave",
			kind: "zeroBest",
		}));
		const { panel } = open(runningRace(full));
		expectRefused(
			within(panel).getByRole("button", { name: "Add penalty · Ann" }),
		);
	});

	it("is absent without the permission, scoring or a running heat", () => {
		const denied = open(runningRace(), { permissions: { penalties: false } });
		expect(within(denied.panel).queryByText("Penalties")).toBeNull();
		cleanup();

		const manual = runningRace();
		delete manual.scoring;
		const none = open(manual);
		expect(within(none.panel).queryByText("Penalties")).toBeNull();
		cleanup();

		const pending = makeRaceBracket({ scoring: scoringPresets.windsurfWave });
		const view = renderAdmin(pending);
		const panel = openHeatInspector(view.container, "h1");
		expect(within(panel).queryByText("Penalties")).toBeNull();
	});

	it("is read-only in viewer mode", () => {
		const view = renderAdmin(runningRace(), { board: { mode: "viewer" } });
		expect(view.container.querySelector(".hb-penalties")).toBeNull();
	});
});
