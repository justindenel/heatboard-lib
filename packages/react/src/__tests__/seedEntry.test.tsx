import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	applyAction,
	defaultPlan,
	formatFromPlan,
	type Bracket,
} from "@heatboard/core";
import { Board, BracketProvider, HeatboardProvider } from "../index";
import { withSeedSlots } from "../components/formatPlanEdits";
import { isSeedEntry } from "../components/seedEntry";

afterEach(cleanup);

function seededBracket(): Bracket {
	const plan = withSeedSlots(
		defaultPlan({ riders: 12, heats: 3, advance: 2, repechage: false }),
		1,
		2,
	);
	const base: Bracket = {
		id: "b1",
		name: "Open",
		entries: Array.from({ length: 12 }, (_, i) => ({
			riderId: `r${i + 1}`,
			displayName: `Rider ${i + 1}`,
			...(i < 2 ? { seed: i + 1 } : {}),
		})),
		rounds: [],
		links: [],
		status: "draft",
		visibility: "private",
	};
	const result = applyAction(base, {
		type: "applyFormat",
		format: formatFromPlan(plan),
		drawSeed: 4,
	});
	if (!result.ok) throw new Error(result.error.code);
	return result.bracket;
}

describe("seed entries", () => {
	it("recognises the riders that join a round directly", () => {
		const bracket = seededBracket();
		const second = bracket.rounds[1]?.id ?? "";
		expect(isSeedEntry(bracket, second, "r1")).toBe(true);
		expect(isSeedEntry(bracket, second, "r2")).toBe(true);
		expect(isSeedEntry(bracket, second, "r3")).toBe(false);
		expect(isSeedEntry(bracket, bracket.rounds[0]?.id ?? "", "r1")).toBe(false);
	});

	it("never marks a rider with an entry round of their own", () => {
		const bracket = seededBracket();
		const second = bracket.rounds[1]?.id ?? "";
		const entries = bracket.entries.map((e) =>
			e.riderId === "r1" ? { ...e, entryRoundId: second } : e,
		);
		expect(isSeedEntry({ ...bracket, entries }, second, "r1")).toBe(false);
	});

	it("shows a badge on the slot of each seed, in the language of the provider", () => {
		const bracket = seededBracket();
		const controller = {
			bracket,
			dispatch: vi.fn(),
			canApply: vi.fn(),
			pending: false,
			error: null,
			clearError: vi.fn(),
		};
		const { container } = render(
			<HeatboardProvider locale="fr">
				<BracketProvider value={controller}>
					<Board />
				</BracketProvider>
			</HeatboardProvider>,
		);
		const badges = container.querySelectorAll(".hb-participant__seed");
		expect(badges).toHaveLength(2);
		const row = container.querySelector<HTMLElement>('[data-rider-id="r1"]')!;
		expect(within(row).getByText("TS").getAttribute("title")).toBe(
			"Tête de série",
		);
	});
});
