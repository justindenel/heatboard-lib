import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { HeatData, ViewerHeatResult } from "@heatboard/core";
import { Board, BracketProvider } from "../index";
import { heatSection, inspector } from "./admin-helpers";
import { makeController } from "./helpers";
import { makeScoredBracket } from "./judging-helpers";

afterEach(cleanup);

const T1 = "2030-01-01T10:01:00.000Z";

function riderRow(panel: HTMLElement, name: string): HTMLElement {
	const row = [
		...panel.querySelectorAll<HTMLElement>(".hb-inspector__rider"),
	].find((li) => li.textContent?.includes(name));
	if (!row) throw new Error(`no row for ${name}`);
	return row;
}

const base = {
	tied: false,
	interferences: 0,
	dsqSuggested: false,
	missingScores: false,
};

const result: ViewerHeatResult = {
	method: "points",
	mode: "free",
	unresolvedTie: false,
	riders: [
		{
			...base,
			riderId: "r2",
			rank: 1,
			total: 9.5,
			moves: [
				{
					type: "Wave",
					at: T1,
					value: 9.5,
					counted: false,
					judges: 2,
					answers: 2,
					of: 2,
					figureAgreement: true,
				},
			],
		},
		{ ...base, riderId: "r1", rank: 2, total: 4.25 },
	],
};

function renderViewer(
	getHeatResult: (heatId: string) => ViewerHeatResult | undefined,
	getHeatData?: () => HeatData,
) {
	const view = render(
		<BracketProvider value={makeController(makeScoredBracket())}>
			<Board getHeatResult={getHeatResult} getHeatData={getHeatData} />
		</BracketProvider>,
	);
	fireEvent.click(
		within(heatSection(view.container, "h1")).getByRole("button", {
			name: "Open the panel of Heat 1",
		}),
	);
	return inspector();
}

describe("viewer Board fed with precomputed results", () => {
	it("shows ranks and totals without any raw notes", () => {
		const panel = renderViewer((id) => (id === "h1" ? result : undefined));
		const bob = riderRow(panel, "Bob");
		const ann = riderRow(panel, "Ann");
		expect(bob.querySelector("[data-total]")?.textContent).toContain("9.50");
		expect(bob.querySelector('[data-result="provisional"]')).not.toBeNull();
		expect(ann.querySelector("[data-total]")?.textContent).toContain("4.25");
		expect(
			[...panel.querySelectorAll(".hb-inspector__rider-name")].map(
				(n) => n.textContent,
			),
		).toEqual(["Bob", "Ann", "Cy"]);
	});

	it("shows moves only for the riders whose result carries them", () => {
		const panel = renderViewer(() => result);
		const bob = riderRow(panel, "Bob");
		const ann = riderRow(panel, "Ann");
		expect(
			[...bob.querySelectorAll(".hb-inspector__aligned .hb-note")].map(
				(c) => c.textContent,
			),
		).toEqual(["W 9.50"]);
		expect(ann.querySelector(".hb-note")).toBeNull();
		expect(ann.querySelector(".hb-inspector__subtotal")).toBeNull();
	});

	it("never shows judges when the result has none, even with raw notes around", () => {
		const raw: HeatData = {
			rides: [{ id: "a1", riderId: "r1", type: "Wave", at: T1 }],
			scores: [{ rideId: "a1", judgeId: "j1", value: 8, at: T1 }],
		};
		const panel = renderViewer(
			() => result,
			() => raw,
		);
		expect(panel.querySelector(".hb-inspector__judge")).toBeNull();
		expect(within(panel).queryByRole("switch")).toBeNull();
		expect(
			riderRow(panel, "Ann").querySelector("[data-total]")?.textContent,
		).toContain("4.25");
	});

	it("shows nothing for a heat the host has no result for", () => {
		const { container } = render(
			<BracketProvider value={makeController(makeScoredBracket())}>
				<Board getHeatResult={() => undefined} />
			</BracketProvider>,
		);
		expect(
			within(heatSection(container, "h1")).queryByRole("button", {
				name: "Open the panel of Heat 1",
			}),
		).toBeNull();
		expect(container.querySelector("[data-total]")).toBeNull();
	});
});
