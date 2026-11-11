import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Action, Bracket, Heat, Round } from "@heatboard/core";
import { afterEach, describe, expect, it } from "vitest";
import {
	Board,
	BracketProvider,
	EntryPool,
	HeatboardDnd,
	HeatboardProvider,
	labels,
	useBracket,
} from "../index";
import {
	openPlacesAtStart,
	slotDestination,
	slotOrigins,
} from "../components/slotRoutes";
import { evaluateDrop } from "../dnd/evaluate";
import { makeController } from "./helpers";

afterEach(cleanup);

function round(id: string, name: string, heats: Heat[], group = "main"): Round {
	return { id, name, group, maxPerHeat: 2, advancing: 1, heats };
}

function bracketOf(over: Partial<Bracket> = {}): Bracket {
	return {
		id: "b",
		name: "Open",
		entries: [
			{ riderId: "r1", displayName: "Ann" },
			{ riderId: "r2", displayName: "Bob" },
			{ riderId: "r3", displayName: "Cy", entryRoundId: "t3" },
		],
		rounds: [
			round("t1", "Tour 1", [
				{
					id: "a",
					status: "judged",
					slots: [
						{ riderId: "r1", rank: 1 },
						{ riderId: "r2", rank: 2 },
					],
					startedAt: "2026-01-01T10:00:00.000Z",
				},
				{ id: "b", status: "pending", slots: [] },
			]),
			round(
				"rep",
				"Repêchage",
				[{ id: "c", status: "pending", slots: [] }],
				"repechage",
			),
			round("t2", "Tour 2", [{ id: "d", status: "pending", slots: [] }]),
			round("t3", "Tour 3", [{ id: "e", status: "pending", slots: [] }]),
			round("t4", "Tour 4", [{ id: "f", status: "pending", slots: [] }]),
		],
		links: [
			{ from: { heatId: "a", rank: 1 }, to: { heatId: "d" } },
			{ from: { heatId: "a", rank: 2 }, to: { heatId: "c" } },
			{ from: { heatId: "a", rank: 3 }, to: "eliminated" },
			{ from: { heatId: "b", rank: 1 }, to: { heatId: "d" } },
		],
		status: "running",
		visibility: "public",
		...over,
	};
}

function renderBoard(
	bracket: Bracket,
	extra: { showHeaderBadges?: boolean } = {},
) {
	return render(
		<HeatboardProvider locale="en">
			<BracketProvider value={makeController(bracket)}>
				<Board mode="admin" {...extra} />
			</BracketProvider>
		</HeatboardProvider>,
	);
}

describe("links read for the board", () => {
	it("gives the destination of a rank, and eliminated without a link", () => {
		const bracket = bracketOf();
		expect(slotDestination(bracket, "a", 1)).toMatchObject({ kind: "heat" });
		expect(slotDestination(bracket, "a", 3)).toEqual({ kind: "eliminated" });
		expect(slotDestination(bracket, "a", 4)).toEqual({ kind: "eliminated" });
		expect(slotDestination(bracket, "f", 1)).toBeUndefined();
	});

	it("announces nothing for a heat whose links all end in eliminated (a final)", () => {
		const bracket = bracketOf({
			links: [
				{ from: { heatId: "f", rank: 1 }, to: "eliminated" },
				{ from: { heatId: "f", rank: 2 }, to: "eliminated" },
			],
		});
		expect(slotDestination(bracket, "f", 1)).toBeUndefined();
		expect(slotDestination(bracket, "f", 2)).toBeUndefined();
	});

	it("counts the places still open when a heat is started", () => {
		const bracket = bracketOf();
		const setStatus = (
			heatId: string,
			status: "running" | "judged",
		): Action => ({ type: "setHeatStatus", heatId, status });
		expect(openPlacesAtStart(bracket, setStatus("d", "running"))).toBe(1);
		expect(openPlacesAtStart(bracket, setStatus("e", "running"))).toBe(0);
		expect(openPlacesAtStart(bracket, setStatus("d", "judged"))).toBe(0);
	});

	it("lists the sources still to be played, in bracket order", () => {
		const origins = slotOrigins(bracketOf(), "d");
		expect(origins.map((o) => [o.source.heat.id, o.rank])).toEqual([["b", 1]]);
	});
});

describe("origins with uneven heat sizes", () => {
	const riders = (heat: number, count: number) =>
		Array.from({ length: count }, (_, i) => ({
			riderId: `h${heat}r${i + 1}`,
			rank: null,
		}));
	const unevenBracket = (placed: boolean): Bracket => {
		const sizes = [4, 4, 3, 3];
		const links: Bracket["links"] = sizes.flatMap((_, h) =>
			[3, 4].map((rank) => ({
				from: { heatId: `h${h + 1}`, rank },
				to: { heatId: "rep" },
			})),
		);
		return bracketOf({
			entries: [],
			rounds: [
				{
					id: "t1",
					name: "Tour 1",
					group: "main",
					maxPerHeat: 4,
					advancing: 2,
					heats: sizes.map((size, h) => ({
						id: `h${h + 1}`,
						status: "pending" as const,
						slots: placed ? riders(h + 1, size) : [],
					})),
				},
				round(
					"rep",
					"Repêchage",
					[{ id: "rep", status: "pending", slots: [] }],
					"repechage",
				),
			],
			links,
		});
	};

	it("skips the ranks a smaller heat cannot reach once its riders are placed", () => {
		const origins = slotOrigins(unevenBracket(true), "rep");
		expect(origins.map((o) => [o.source.heat.id, o.rank])).toEqual([
			["h1", 3],
			["h1", 4],
			["h2", 3],
			["h2", 4],
			["h3", 3],
			["h4", 3],
		]);
	});

	it("keeps every link while the heats are still empty", () => {
		expect(slotOrigins(unevenBracket(false), "rep")).toHaveLength(8);
	});
});

describe("admin board of a running bracket", () => {
	it("exposes the destination of each rider of a judged heat as a tooltip, without open places", () => {
		const { container } = renderBoard(bracketOf());
		const heat = container.querySelector("[data-heat-id='a']")!;
		expect(heat.classList.contains("hb-heat--compact")).toBe(true);
		const rows = [...heat.querySelectorAll("[data-destination]")];
		expect(rows.map((el) => el.getAttribute("title"))).toEqual([
			"→ Tour 2",
			"→ Repêchage",
		]);
		expect(rows.every((el) => el.classList.contains("hb-participant"))).toBe(
			true,
		);
		expect(heat.querySelector("[data-destination='repechage']")).not.toBeNull();
		expect(heat.querySelectorAll(".hb-empty-slot")).toHaveLength(0);
	});

	it("labels the open places of a pending heat with their origin", () => {
		const { container } = renderBoard(bracketOf());
		const slots = container.querySelectorAll(
			"[data-heat-id='d'] .hb-empty-slot",
		);
		expect(slots[0]!.textContent).toBe("1st · Tour 1 H2");
		expect(slots[1]!.textContent).toBe("Open slot");
	});

	it("refuses to start a heat in which no rider is known", () => {
		function Real() {
			const controller = useBracket({ defaultBracket: bracketOf() });
			return (
				<BracketProvider value={controller}>
					<Board mode="admin" />
				</BracketProvider>
			);
		}
		const { container } = render(
			<HeatboardProvider locale="en">
				<Real />
			</HeatboardProvider>,
		);
		const start = container.querySelector(
			"[data-heat-id='d'] button[aria-label='Start heat 4']",
		)!;
		expect(start.getAttribute("aria-disabled")).toBe("true");
		expect(start.getAttribute("title")).toBe(
			"No rider is known in this heat yet.",
		);
	});

	it("folds the rounds after the next one, and each can be toggled", () => {
		const { container } = renderBoard(bracketOf());
		const folded = (id: string) =>
			container
				.querySelector(`[data-round-id='${id}']`)!
				.getAttribute("data-collapsed");
		expect(folded("t1")).toBeNull();
		expect(folded("rep")).toBeNull();
		expect(folded("t3")).toBe("true");
		expect(folded("t4")).toBe("true");
		expect(container.querySelector("[data-heat-id='e']")).toBeNull();
		expect(screen.getAllByText("1 heat · 2 places")).toHaveLength(2);
		fireEvent.click(screen.getAllByRole("button", { name: "Show Tour 3" })[0]!);
		expect(folded("t3")).toBeNull();
		expect(container.querySelector("[data-heat-id='e']")).not.toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Hide Tour 1" }));
		expect(folded("t1")).toBe("true");
	});

	it("does not fold anything when asked not to, or while not running", () => {
		const off = render(
			<HeatboardProvider locale="en">
				<BracketProvider value={makeController(bracketOf())}>
					<Board mode="admin" collapseFarRounds={false} />
				</BracketProvider>
			</HeatboardProvider>,
		);
		expect(off.container.querySelector("[data-collapsed]")).toBeNull();
		cleanup();
		const draft = renderBoard(bracketOf({ status: "draft" }));
		expect(draft.container.querySelector("[data-collapsed]")).toBeNull();
	});

	it("shows the timer of a running heat when there is no scoring", () => {
		const bracket = bracketOf();
		const heat = bracket.rounds[0]!.heats[1]!;
		heat.status = "running";
		heat.startedAt = new Date().toISOString();
		const { container } = renderBoard(bracket);
		expect(
			container.querySelector("[data-heat-id='b'] [role='timer']"),
		).not.toBeNull();
	});
});

describe("header badges", () => {
	it("are shown by default and can be hidden", () => {
		const shown = renderBoard(bracketOf());
		expect(shown.container.querySelector(".hb-board__status")).not.toBeNull();
		expect(
			shown.container.querySelector(".hb-board__visibility"),
		).not.toBeNull();
		cleanup();
		const hidden = renderBoard(bracketOf(), { showHeaderBadges: false });
		expect(hidden.container.querySelector(".hb-board__status")).toBeNull();
		expect(hidden.container.querySelector(".hb-board__visibility")).toBeNull();
	});
});

describe("late entries", () => {
	function lateBracket(): Bracket {
		const bracket = bracketOf({ status: "running" });
		bracket.rounds[3]!.heats[0]!.slots = [{ riderId: "r3", rank: null }];
		return bracket;
	}

	it("accepts a late rider back on the list of its own round only", () => {
		const bracket = lateBracket();
		const canApply = () => ({ ok: true as const, bracket });
		const source = { kind: "slot" as const, heatId: "e", riderId: "r3" };
		expect(
			evaluateDrop(bracket, canApply, source, { kind: "pool", roundId: "t3" })
				?.result.ok,
		).toBe(true);
		expect(
			evaluateDrop(bracket, canApply, source, { kind: "pool", roundId: "t1" })
				?.result.ok,
		).toBe(false);
	});

	it("shows no zone until a rider of that round is dragged", () => {
		const { container } = render(
			<HeatboardProvider locale="en">
				<BracketProvider value={makeController(lateBracket())}>
					<HeatboardDnd>
						<EntryPool mode="admin" defaultCollapsed={false} />
					</HeatboardDnd>
				</BracketProvider>
			</HeatboardProvider>,
		);
		expect(container.querySelector(".hb-pool__zone")).toBeNull();
		expect(labels.en.entryPoolDropHere).not.toBe("");
	});
});
