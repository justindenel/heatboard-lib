import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Bracket, HeatData } from "@heatboard/core";
import { Board, BracketProvider } from "../index";
import {
	heatSection,
	inspector,
	openHeatInspector,
	renderAdmin,
	statusTrigger,
} from "./admin-helpers";
import { makeController } from "./helpers";
import { makeScoredBracket } from "./judging-helpers";

afterEach(cleanup);

const T1 = "2030-01-01T10:01:00.000Z";
const T2 = "2030-01-01T10:02:00.000Z";
const T3 = "2030-01-01T10:03:00.000Z";

const data: HeatData = {
	rides: [
		{ id: "a1", riderId: "r1", type: "Wave", at: T1 },
		{ id: "a2", riderId: "r1", type: "Jump", at: T2, figure: "B" },
		{ id: "a3", riderId: "r1", type: "Wave", at: T3 },
		{ id: "b1", riderId: "r2", type: "Wave", at: T1 },
	],
	scores: [
		{ rideId: "a1", judgeId: "j1", value: 6.5, at: T1 },
		{ rideId: "a2", judgeId: "j1", value: 7.5, at: T2 },
		{ rideId: "a3", judgeId: "j2", value: 5, at: T3 },
		{ rideId: "b1", judgeId: "j2", value: 4, at: T1 },
	],
};

function riderRow(panel: HTMLElement, name: string): HTMLElement {
	const row = [
		...panel.querySelectorAll<HTMLElement>(".hb-inspector__rider"),
	].find((li) => li.textContent?.includes(name));
	if (!row) throw new Error(`no row for ${name}`);
	return row;
}

describe("live notes without a bracket scoring", () => {
	it("still shows the result of a heat that has its own scoring", () => {
		const base = makeScoredBracket();
		const [round, ...rest] = base.rounds;
		const [heat, ...heats] = round!.heats;
		const withoutScoring: Bracket = { ...base };
		delete withoutScoring.scoring;
		const bracket: Bracket = {
			...withoutScoring,
			rounds: [
				{
					...round!,
					heats: [{ ...heat!, scoring: base.scoring! }, ...heats],
				},
				...rest,
			],
		};
		const { container } = renderAdmin(bracket, {
			board: { getHeatData: () => data },
		});
		const ann = riderRow(openHeatInspector(container, "h1"), "Ann");
		expect(ann.querySelector("[data-total]")).not.toBeNull();
	});
});

describe("live notes in the heat inspector", () => {
	it("shows total, provisional rank and the averaged notes per move", () => {
		const { container } = renderAdmin(makeScoredBracket(), {
			board: { getHeatData: () => data },
		});
		const ann = riderRow(openHeatInspector(container, "h1"), "Ann");

		const chips = [...ann.querySelectorAll(".hb-inspector__aligned .hb-note")];
		expect(chips.map((c) => c.textContent)).toEqual([
			"W 6.50 1/2",
			"W 5.00 1/2",
			"J 7.50 B 1/2",
		]);
		const lines = [...ann.querySelectorAll("[data-category]")];
		expect(lines.map((l) => l.getAttribute("data-category"))).toEqual([
			"Wave",
			"Jump",
		]);
		expect(
			within(ann).getByRole("img", {
				name: "Jump, average 7.50 from 1 of 2 judges, figure B",
			}),
		).toBeTruthy();
		expect(ann.querySelector(".hb-inspector__judge")).toBeNull();
		expect(ann.querySelector("[data-total]")).not.toBeNull();
		expect(ann.querySelector('[data-result="provisional"]')).not.toBeNull();
		expect(ann.querySelector('[data-result="rank"]')).toBeNull();
	});

	it("shows the notes of each judge when an admin toggles the details", () => {
		const { container } = renderAdmin(makeScoredBracket(), {
			board: { getHeatData: () => data },
		});
		const panel = openHeatInspector(container, "h1");
		const toggle = within(panel).getByRole("switch", { name: "Judge details" });
		expect(toggle.getAttribute("aria-checked")).toBe("false");
		fireEvent.click(toggle);
		expect(toggle.getAttribute("aria-checked")).toBe("true");

		const ann = riderRow(panel, "Ann");
		const lines = [...ann.querySelectorAll(".hb-inspector__judge")];
		expect(lines.map((l) => l.textContent)).toEqual([
			"J1W 6.5J 7.5 B",
			"J2W 5",
		]);
		expect(
			within(ann).getByRole("img", { name: "Jump 7.5, B, counted" }),
		).toBeTruthy();
		fireEvent.click(toggle);
		expect(ann.querySelector(".hb-inspector__judge")).toBeNull();
	});

	it("marks moves missed by a judge and figures judges disagree on", () => {
		const jumps = [
			["j1", "B"],
			["j2", "F"],
		] as const;
		const wave: HeatData = {
			rides: [
				...jumps.map(([judge, figure]) => ({
					id: `${judge}-jump`,
					riderId: "r1",
					type: "Jump",
					at: T1,
					figure,
				})),
				{ id: "j3-wave", riderId: "r1", type: "Wave", at: T3 },
			],
			scores: [
				{ rideId: "j1-jump", judgeId: "j1", value: 7, at: T1 },
				{ rideId: "j2-jump", judgeId: "j2", value: 8, at: T1 },
				{ rideId: "j3-wave", judgeId: "j3", value: 5, at: T3 },
			],
		};
		const { container } = renderAdmin(makeScoredBracket(), {
			board: { getHeatData: () => wave },
		});
		const ann = riderRow(openHeatInspector(container, "h1"), "Ann");
		const chips = [...ann.querySelectorAll(".hb-inspector__aligned .hb-note")];
		expect(chips.map((c) => c.textContent)).toEqual([
			"W 5.00 1/3",
			"J 7.50 ≠ 2/3",
		]);
		expect(chips[1]?.getAttribute("aria-label")).toBe(
			"Jump, average 7.50 from 2 of 3 judges, judges disagree on the figure",
		);
	});

	it("orders the rows by provisional rank until the heat is ranked", () => {
		const ranking: HeatData = {
			rides: [
				{ id: "x1", riderId: "r1", type: "Wave", at: T1 },
				{ id: "x2", riderId: "r2", type: "Wave", at: T1 },
				{ id: "x3", riderId: "r2", type: "Wave", at: T2 },
			],
			scores: [
				{ rideId: "x1", judgeId: "j1", value: 3, at: T1 },
				{ rideId: "x2", judgeId: "j1", value: 9, at: T1 },
				{ rideId: "x3", judgeId: "j1", value: 8, at: T2 },
			],
		};
		const { container } = renderAdmin(makeScoredBracket(), {
			board: { getHeatData: () => ranking },
		});
		const names = (panel: HTMLElement) =>
			[...panel.querySelectorAll(".hb-inspector__rider-name")].map(
				(n) => n.textContent,
			);
		expect(names(openHeatInspector(container, "h1"))).toEqual([
			"Bob",
			"Ann",
			"Cy",
		]);
	});

	it("keeps the manual order of a running heat", () => {
		const bracket = makeScoredBracket();
		const ordered: Bracket = {
			...bracket,
			rounds: bracket.rounds.map((round, i) =>
				i > 0
					? round
					: {
							...round,
							heats: round.heats.map((heat) =>
								heat.id === "h1"
									? { ...heat, order: ["r3", "r1", "r2"] }
									: heat,
							),
						},
			),
		};
		const { container } = renderAdmin(ordered, {
			board: { getHeatData: () => data },
		});
		const panel = openHeatInspector(container, "h1");
		expect(
			[...panel.querySelectorAll(".hb-inspector__rider-name")].map(
				(n) => n.textContent,
			),
		).toEqual(["Cy", "Ann", "Bob"]);
	});

	it("applies the penalties stored on the heat to the live total", () => {
		const totalOf = (bracket: Bracket) => {
			const { container } = renderAdmin(bracket, {
				board: { getHeatData: () => data },
			});
			const ann = riderRow(openHeatInspector(container, "h1"), "Ann");
			const total = ann.querySelector("[data-total]")?.textContent;
			cleanup();
			return total;
		};
		const plain = makeScoredBracket();
		const penalized: Bracket = {
			...plain,
			rounds: plain.rounds.map((round, i) =>
				i > 0
					? round
					: {
							...round,
							heats: round.heats.map((heat) =>
								heat.id !== "h1"
									? heat
									: {
											...heat,
											penalties: [
												{
													riderId: "r1",
													type: "Wave",
													kind: "zeroBest" as const,
												},
											],
										},
							),
						},
			),
		};
		expect(totalOf(penalized)).not.toBe(totalOf(plain));
	});

	it("shows no rank for a rider without notes and keeps the status menu", () => {
		const { container } = renderAdmin(makeScoredBracket(), {
			board: { getHeatData: () => data },
		});
		const panel = openHeatInspector(container, "h1");
		const cy = riderRow(panel, "Cy");
		expect(cy.querySelector('[data-result="provisional"]')).toBeNull();
		expect(cy.querySelector(".hb-inspector__judge")).toBeNull();
		expect(statusTrigger(panel, "Cy")).toBeTruthy();
	});

	it("keeps the official rank once the heat is ranked", () => {
		const bracket = makeScoredBracket();
		const ranked: Bracket = {
			...bracket,
			rounds: bracket.rounds.map((round, i) =>
				i > 0
					? round
					: {
							...round,
							heats: round.heats.map((heat) =>
								heat.id !== "h1"
									? heat
									: {
											...heat,
											slots: heat.slots.map((slot, rank) => ({
												...slot,
												rank: rank + 1,
											})),
										},
							),
						},
			),
		};
		const { container } = renderAdmin(ranked, {
			board: { getHeatData: () => data },
		});
		const ann = riderRow(openHeatInspector(container, "h1"), "Ann");
		expect(ann.querySelector('[data-result="rank"]')).not.toBeNull();
		expect(ann.querySelector('[data-result="provisional"]')).toBeNull();
		expect(ann.querySelector("[data-total]")).not.toBeNull();
	});

	it("uses the host's judge names", () => {
		const { container } = renderAdmin(makeScoredBracket(), {
			board: {
				getHeatData: () => data,
				judgeLabel: (id) => (id === "j1" ? "Marie" : "Paul"),
			},
		});
		const panel = openHeatInspector(container, "h1");
		fireEvent.click(
			within(panel).getByRole("switch", { name: "Judge details" }),
		);
		const ann = riderRow(panel, "Ann");
		const names = [...ann.querySelectorAll(".hb-inspector__judge-name")];
		expect(names.map((n) => n.textContent)).toEqual(["Marie", "Paul"]);
	});

	it("shows nothing extra without host data", () => {
		const { container } = renderAdmin(makeScoredBracket());
		const panel = openHeatInspector(container, "h1");
		expect(panel.querySelector(".hb-inspector__judges")).toBeNull();
		expect(panel.querySelector("[data-total]")).toBeNull();
	});
});

describe("live notes in viewer mode", () => {
	function renderViewer(
		getHeatData?: () => HeatData,
		bracket = makeScoredBracket({ viewerDisplay: { rides: true } }),
	) {
		return render(
			<BracketProvider value={makeController(bracket)}>
				<Board getHeatData={getHeatData} />
			</BracketProvider>,
		);
	}

	it("opens a read-only panel from the heat title", () => {
		const { container } = renderViewer(() => data);
		fireEvent.click(
			within(heatSection(container, "h1")).getByRole("button", {
				name: "Open the panel of Heat 1",
			}),
		);
		const panel = inspector();
		const ann = riderRow(panel, "Ann");
		expect(
			ann.querySelectorAll(".hb-inspector__aligned .hb-note"),
		).toHaveLength(3);
		expect(ann.querySelector(".hb-inspector__judge")).toBeNull();
		expect(ann.querySelector('[data-result="provisional"]')).not.toBeNull();
		expect(
			within(panel).queryByRole("switch", { name: "Judge details" }),
		).toBeNull();
		expect(
			within(panel)
				.getAllByRole("button")
				.map((b) => b.getAttribute("aria-label")),
		).toEqual(["Close"]);
	});

	it("hides the averaged moves by default with the placings method", () => {
		const { container } = renderViewer(() => data, makeScoredBracket());
		fireEvent.click(
			within(heatSection(container, "h1")).getByRole("button", {
				name: "Open the panel of Heat 1",
			}),
		);
		const ann = riderRow(inspector(), "Ann");
		expect(ann.querySelector(".hb-note")).toBeNull();
		expect(ann.querySelector("[data-total]")).not.toBeNull();
	});

	it("has no panel without host data", () => {
		const { container } = renderViewer();
		expect(
			within(heatSection(container, "h1")).queryAllByRole("button"),
		).toHaveLength(0);
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});
