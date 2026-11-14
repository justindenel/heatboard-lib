import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyAction } from "@heatboard/core";
import type { Action, Bracket, Heat } from "@heatboard/core";
import { BracketProvider, EntryPool, HeatboardProvider } from "../index";
import { evaluateDrop } from "../dnd/evaluate";
import { makeController } from "./helpers";
import { makeRaceBracket } from "./admin-helpers";

afterEach(cleanup);

function renderPool(
	props: Partial<Parameters<typeof EntryPool>[0]> = {},
	locale: "en" | "fr" = "en",
) {
	const tree = (extra: typeof props) => (
		<HeatboardProvider locale={locale}>
			<BracketProvider value={makeController(makeRaceBracket())}>
				<EntryPool
					roundId="round1"
					mode="admin"
					defaultCollapsed={false}
					{...props}
					{...extra}
				/>
			</BracketProvider>
		</HeatboardProvider>
	);
	const view = render(tree({}));
	return {
		...view,
		update: (extra: typeof props) => view.rerender(tree(extra)),
	};
}

const toggle = () =>
	screen.getByRole("button", { name: "Show or hide unplaced riders" });

describe("collapsible panel", () => {
	it("starts open with the title, the count, the chips and the form", () => {
		const { container } = renderPool();
		expect(
			screen.getByRole("heading", { name: "Unplaced riders" }),
		).toBeTruthy();
		expect(container.querySelector(".hb-pool__count")!.textContent).toBe("1");
		expect(screen.getByText("Eve")).toBeTruthy();
		expect(screen.getByRole("textbox", { name: "Rider name" })).toBeTruthy();
		expect(toggle().getAttribute("aria-expanded")).toBe("true");
		expect(toggle().getAttribute("aria-controls")).toBe(
			container.querySelector(".hb-pool__body")!.id,
		);
	});

	it("collapses to the title and the count, then expands again", () => {
		const { container } = renderPool();
		fireEvent.click(toggle());
		expect(toggle().getAttribute("aria-expanded")).toBe("false");
		expect(
			container.querySelector(".hb-pool")!.getAttribute("data-collapsed"),
		).toBe("true");
		expect(
			screen.getByRole("heading", { name: "Unplaced riders" }),
		).toBeTruthy();
		expect(container.querySelector(".hb-pool__count")!.textContent).toBe("1");
		expect(screen.queryByText("Eve")).toBeNull();
		expect(screen.queryByRole("textbox")).toBeNull();
		expect(container.querySelector(".hb-pool__body")).toBeNull();

		fireEvent.click(toggle());
		expect(screen.getByText("Eve")).toBeTruthy();
		expect(screen.getByRole("textbox", { name: "Rider name" })).toBeTruthy();
	});

	it("keeps the icon, the count and the toggle when collapsed", () => {
		const { container } = renderPool({ defaultCollapsed: true });
		const pool = container.querySelector(".hb-pool")!;
		expect(pool.getAttribute("data-collapsed")).toBe("true");
		expect(pool.querySelector(".hb-pool__icon svg")).not.toBeNull();
		expect(pool.querySelector(".hb-pool__count")!.textContent).toBe("1");
		expect(toggle().getAttribute("aria-expanded")).toBe("false");
		expect(toggle().getAttribute("aria-controls")).toBeTruthy();
	});

	it("drops the icon with the built-in classes when unstyled", () => {
		const { container } = renderPool({ unstyled: true });
		expect(container.querySelector(".hb-pool__icon")).toBeNull();
	});

	it("starts collapsed when nothing is specified", () => {
		render(
			<HeatboardProvider>
				<BracketProvider value={makeController(makeRaceBracket())}>
					<EntryPool roundId="round1" mode="admin" />
				</BracketProvider>
			</HeatboardProvider>,
		);
		expect(toggle().getAttribute("aria-expanded")).toBe("false");
	});

	it("can start collapsed", () => {
		renderPool({ defaultCollapsed: true });
		expect(toggle().getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByText("Eve")).toBeNull();
	});

	it("follows the collapsed prop and reports the requested change", () => {
		const onCollapsedChange = vi.fn();
		const { update } = renderPool({ collapsed: true, onCollapsedChange });
		expect(screen.queryByText("Eve")).toBeNull();
		fireEvent.click(toggle());
		expect(onCollapsedChange).toHaveBeenCalledWith(false);
		expect(screen.queryByText("Eve")).toBeNull();

		update({ collapsed: false, onCollapsedChange });
		expect(screen.getByText("Eve")).toBeTruthy();
		fireEvent.click(toggle());
		expect(onCollapsedChange).toHaveBeenLastCalledWith(true);
		expect(screen.getByText("Eve")).toBeTruthy();
	});

	it("ignores defaultCollapsed once controlled", () => {
		renderPool({ collapsed: false, defaultCollapsed: true });
		expect(screen.getByText("Eve")).toBeTruthy();
	});

	it("labels its toggle in the active language", () => {
		renderPool({}, "fr");
		const button = screen.getByRole("button", {
			name: "Afficher ou masquer les inscrits non placés",
		});
		expect(button.title).toBe("Afficher ou masquer les inscrits non placés");
		expect(button.querySelector("svg")!.getAttribute("aria-hidden")).toBe(
			"true",
		);
	});
});

describe("entry rounds", () => {
	function renderGrouped() {
		const bracket = makeRaceBracket();
		bracket.entries.push({
			riderId: "r6",
			displayName: "Fay",
			entryRoundId: "round2",
		});
		return render(
			<HeatboardProvider>
				<BracketProvider value={makeController(bracket)}>
					<EntryPool mode="admin" defaultCollapsed={false} />
				</BracketProvider>
			</HeatboardProvider>,
		);
	}

	it("lists riders entering at a later round under that round", () => {
		const { container } = renderGrouped();
		expect(container.querySelector(".hb-pool__count")!.textContent).toBe("2");
		expect(screen.getByText("Eve")).toBeTruthy();
		expect(screen.getByText("Fay")).toBeTruthy();
		const group = screen.getByRole("heading", { name: "Round 2" });
		expect(group.nextElementSibling!.textContent).toContain("Fay");
		expect(screen.queryByRole("heading", { name: "Round 1" })).toBeNull();
	});
});

describe("drops between the lists and the heats", () => {
	function twoRounds(over: Partial<Bracket> = {}): Bracket {
		const heat = (id: string, riderIds: string[]): Heat => ({
			id,
			status: "pending",
			slots: riderIds.map((riderId) => ({ riderId, rank: null })),
		});
		return {
			id: "b",
			name: "Open",
			entries: [
				{ riderId: "a", displayName: "Ann" },
				{ riderId: "b", displayName: "Bob" },
			],
			rounds: [
				{
					id: "r1",
					name: "Round 1",
					group: "main",
					maxPerHeat: 2,
					advancing: 1,
					heats: [heat("h1", ["a"])],
				},
				{
					id: "r2",
					name: "Round 2",
					group: "main",
					maxPerHeat: 2,
					advancing: 1,
					heats: [heat("h2", [])],
				},
			],
			links: [],
			status: "draft",
			visibility: "private",
			...over,
		};
	}
	const canApplyTo = (bracket: Bracket) => (action: Action) =>
		applyAction(bracket, action, {});

	it("places a rider of the list into a later round in manual advancement", () => {
		const bracket = twoRounds({ advancement: "manual" });
		const evaluation = evaluateDrop(
			bracket,
			canApplyTo(bracket),
			{ kind: "pool", roundId: "r1", riderId: "b" },
			{ kind: "end", heatId: "h2" },
		);
		expect(evaluation?.action).toEqual({
			type: "place",
			riderId: "b",
			heatId: "h2",
			index: 0,
		});
		expect(evaluation?.result.ok).toBe(true);
		expect(evaluation?.copy).toBe(false);
	});

	it("takes a rider of a later round back to the list before the start", () => {
		const bracket = twoRounds();
		bracket.rounds[1]!.heats[0]!.slots = [{ riderId: "b", rank: null }];
		for (const roundId of ["r1", "r2"]) {
			const evaluation = evaluateDrop(
				bracket,
				canApplyTo(bracket),
				{ kind: "slot", heatId: "h2", riderId: "b" },
				{ kind: "pool", roundId },
			);
			expect(evaluation?.action).toEqual({
				type: "remove",
				riderId: "b",
				heatId: "h2",
			});
			expect(evaluation?.result.ok).toBe(true);
		}
	});

	it("lets the core refuse the removal of a rider of a running heat", () => {
		const bracket = twoRounds({ status: "running" });
		bracket.rounds[0]!.heats[0]!.status = "running";
		const evaluation = evaluateDrop(
			bracket,
			canApplyTo(bracket),
			{ kind: "slot", heatId: "h1", riderId: "a" },
			{ kind: "pool", roundId: "r1" },
		);
		expect(evaluation?.result.ok).toBe(false);
	});
});
