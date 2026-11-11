import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import type { Action, Bracket, HeatStatus } from "@heatboard/core";
import { useMemo } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	Board,
	BracketProvider,
	EntryPool,
	HeatboardDnd,
	HeatboardProvider,
	useBracket,
	type BracketChangeCause,
	type BracketController,
} from "../index";
import { buildAction } from "../dnd";
import { openHeatInspector, statusItem, statusTrigger } from "./admin-helpers";

afterEach(cleanup);

function makeBracket(
	status: HeatStatus,
	slots: Bracket["rounds"][number]["heats"][number]["slots"],
	extra: Partial<Bracket> = {},
): Bracket {
	return {
		id: "rank",
		name: "Rank Open",
		entries: ["a", "b", "c", "d", "e"].map((riderId) => ({
			riderId,
			displayName: riderId.toUpperCase(),
		})),
		rounds: [
			{
				id: "round1",
				name: "Round 1",
				group: "main",
				maxPerHeat: 4,
				advancing: 2,
				heats: [{ id: "h1", status, slots }],
			},
		],
		links: [],
		status: "running",
		visibility: "public",
		...extra,
	};
}

const unranked = (...ids: string[]) =>
	ids.map((riderId) => ({ riderId, rank: null }));

// jsdom has no layout: stack the keyboard stops in document order.
function layoutRect(el: HTMLElement): DOMRect {
	const dragged = document.querySelector<HTMLElement>('[data-dragging="true"]');
	if (dragged && el.classList.contains("hb-drag-overlay")) {
		return layoutRect(dragged);
	}
	const stops = [
		...document.querySelectorAll(
			"[aria-roledescription], .hb-empty-slot, .hb-pool",
		),
	];
	const index = stops.findIndex(
		(stop) => stop === el || el.firstElementChild === stop,
	);
	const top = index === -1 ? 0 : index * 40;
	const height = index === -1 ? 0 : 30;
	const width = index === -1 ? 0 : 200;
	return {
		x: 0,
		y: top,
		top,
		left: 0,
		width,
		height,
		right: width,
		bottom: top + height,
		toJSON: () => ({}),
	};
}

beforeEach(() => {
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
		function (this: HTMLElement) {
			return layoutRect(this);
		},
	);
});

afterEach(() => {
	vi.restoreAllMocks();
});

interface HarnessProps {
	bracket: Bracket;
	onChange?: (next: Bracket, cause: BracketChangeCause) => void;
	dispatchSpy?: (action: Action) => void;
	/** Answers `DESTRUCTIVE_CHANGE` to every action of this type sent without `confirm`. */
	destructive?: Action["type"];
	collapsed?: boolean;
	locale?: "en" | "fr";
}

function Harness(props: HarnessProps) {
	const { destructive, dispatchSpy } = props;
	const real = useBracket({
		defaultBracket: props.bracket,
		...(props.onChange && { onChange: props.onChange }),
	});
	const controller = useMemo((): BracketController => {
		const needsConfirmation = (action: Action) =>
			action.type === destructive && !("confirm" in action);
		const refusal = {
			ok: false as const,
			error: {
				code: "DESTRUCTIVE_CHANGE" as const,
				message: "Needs confirmation",
			},
		};
		return {
			...real,
			canApply: (action) =>
				needsConfirmation(action) ? refusal : real.canApply(action),
			dispatch: (action) => {
				dispatchSpy?.(action);
				return needsConfirmation(action) ? refusal : real.dispatch(action);
			},
		};
	}, [real, destructive, dispatchSpy]);
	return (
		<HeatboardProvider {...(props.locale && { locale: props.locale })}>
			<BracketProvider value={controller}>
				<HeatboardDnd>
					<Board mode="admin" />
					<EntryPool
						roundId="round1"
						{...(props.collapsed !== undefined && {
							defaultCollapsed: props.collapsed,
						})}
					/>
				</HeatboardDnd>
			</BracketProvider>
		</HeatboardProvider>
	);
}

function actions() {
	const seen: Action[] = [];
	const onChange = vi.fn((_next: Bracket, cause: BracketChangeCause) => {
		if (cause.type === "action") seen.push(cause.action);
	});
	return { seen, onChange };
}

function heatSection(): HTMLElement {
	return document.querySelector<HTMLElement>('section[data-heat-id="h1"]')!;
}

function cardOrder(): string[] {
	return [...heatSection().querySelectorAll("[data-rider-id]")].map((el) =>
		el.getAttribute("data-rider-id")!,
	);
}

function cardRow(riderId: string): HTMLElement {
	return heatSection()
		.querySelector(`[data-rider-id="${riderId}"]`)!
		.closest<HTMLElement>("li > div")!;
}

function inspectorOrder(): string[] {
	return [
		...screen
			.getByRole("dialog")
			.querySelectorAll(".hb-inspector__riders > li"),
	].map(
		(li) =>
			li
				.querySelector(".hb-inspector__rider-name")
				?.textContent?.toLowerCase() ?? "",
	);
}

async function settle() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 20));
	});
}

async function press(code: string) {
	fireEvent.keyDown(document, { code, key: code });
	await settle();
}

async function pickUp(el: HTMLElement) {
	el.focus();
	fireEvent.keyDown(el, { code: "Space", key: "Space" });
	await settle();
}

function handle(name: string): HTMLElement {
	return screen.getByRole("button", { name });
}

describe("ranking a running heat in the card", () => {
	it("shows the riders by rank, then unranked, then with a status", () => {
		render(
			<Harness
				bracket={makeBracket("running", [
					{ riderId: "a", rank: null, status: "DNS" },
					{ riderId: "b", rank: null },
					{ riderId: "c", rank: 2 },
					{ riderId: "d", rank: 1 },
				])}
			/>,
		);
		expect(cardOrder()).toEqual(["d", "c", "b", "a"]);
	});

	it("only reorders an unranked heat by dropping a rider onto another position", async () => {
		const { seen, onChange } = actions();
		render(
			<Harness
				onChange={onChange}
				bracket={makeBracket("running", unranked("a", "b", "c", "d"))}
			/>,
		);
		await pickUp(cardRow("a"));
		await press("ArrowDown");
		await press("Space");
		expect(seen).toEqual([
			{ type: "reorderSlots", heatId: "h1", riderIds: ["b", "a", "c", "d"] },
		]);
		expect(cardOrder()).toEqual(["b", "a", "c", "d"]);
		expect(screen.getByRole("status").textContent).toBe(
			"A now comes 2nd in the order.",
		);
	});

	it("keeps the lycra color of each rider when the heat is reordered", async () => {
		render(
			<Harness bracket={makeBracket("running", unranked("a", "b", "c"))} />,
		);
		const colors = () =>
			Object.fromEntries(
				["a", "b", "c"].map((id) => [
					id,
					cardRow(id).querySelector("[data-color]")?.getAttribute("data-color"),
				]),
			);
		const before = colors();
		expect(new Set(Object.values(before)).size).toBe(3);
		await pickUp(cardRow("a"));
		await press("ArrowDown");
		await press("Space");
		expect(cardOrder()).toEqual(["b", "a", "c"]);
		expect(colors()).toEqual(before);
	});

	it("ranks the reordered riders by order, and keeps ranking by drag after that", async () => {
		const { seen, onChange } = actions();
		const { container } = render(
			<Harness
				onChange={onChange}
				bracket={makeBracket("running", unranked("a", "b", "c"))}
			/>,
		);
		await pickUp(cardRow("a"));
		await press("ArrowDown");
		await press("Space");
		expect(heatSection().querySelector("[data-result]")).toBeNull();
		expect(heatSection().querySelector(".hb-result--qualified")).toBeNull();
		const panel = openHeatInspector(container, "h1");
		expect(inspectorOrder()).toEqual(["b", "a", "c"]);
		fireEvent.click(
			within(panel).getByRole("button", { name: "Rank by order" }),
		);
		expect(seen.at(-1)).toEqual({ type: "rankByPosition", heatId: "h1" });
		expect(
			[...heatSection().querySelectorAll("[data-result]")].map((el) =>
				el.getAttribute("data-result"),
			),
		).toEqual(["rank", "rank", "rank"]);
		await pickUp(handle("Reorder C"));
		await press("ArrowUp");
		await press("Space");
		expect(seen.at(-1)).toEqual({
			type: "setRanks",
			heatId: "h1",
			riderIds: ["b", "c", "a"],
			override: true,
		});
		expect(cardOrder()).toEqual(["b", "c", "a"]);
		expect(inspectorOrder()).toEqual(["b", "c", "a"]);
	});

	it("reorders an already ranked heat and keeps the statuses at the bottom", async () => {
		const { seen, onChange } = actions();
		render(
			<Harness
				onChange={onChange}
				bracket={makeBracket("running", [
					{ riderId: "a", rank: 1 },
					{ riderId: "b", rank: 2 },
					{ riderId: "c", rank: 3 },
					{ riderId: "d", rank: null, status: "DNF" },
				])}
			/>,
		);
		await pickUp(cardRow("c"));
		await press("ArrowUp");
		await press("ArrowUp");
		await press("Space");
		expect(seen).toEqual([
			{
				type: "setRanks",
				heatId: "h1",
				riderIds: ["c", "a", "b"],
				override: true,
			},
		]);
		expect(cardOrder()).toEqual(["c", "a", "b", "d"]);
	});

	it("does not rank on a drop where it started", async () => {
		const { seen, onChange } = actions();
		render(
			<Harness
				onChange={onChange}
				bracket={makeBracket("running", unranked("a", "b"))}
			/>,
		);
		await pickUp(cardRow("a"));
		await press("Space");
		expect(seen).toEqual([]);
	});

	it("leaves a rider with a status out of the drag, with its reason", () => {
		render(
			<Harness
				bracket={makeBracket("running", [
					{ riderId: "a", rank: 1 },
					{ riderId: "b", rank: null, status: "DNS" },
				])}
			/>,
		);
		const row = cardRow("b");
		expect(row.getAttribute("aria-roledescription")).toBeNull();
		expect(row.title).toBe("A rider with a status is not ranked.");
		expect(cardRow("a").getAttribute("aria-roledescription")).not.toBeNull();
	});

	it("keeps composition drags for a pending heat", async () => {
		const { seen, onChange } = actions();
		render(
			<Harness
				onChange={onChange}
				bracket={makeBracket("pending", unranked("a", "b", "c"))}
			/>,
		);
		await pickUp(cardRow("a"));
		await press("ArrowDown");
		await press("Space");
		expect(seen[0]?.type).toBe("move");
	});

	it("does not rank by drag when the scoring uses points", () => {
		render(
			<Harness
				bracket={makeBracket("running", unranked("a", "b"), {
					scoring: {
						method: "points",
						scale: { min: 0, max: 10, step: 0.5 },
						categories: [{ type: "wave", counted: 2 }],
						aggregation: "mean",
					},
				})}
			/>,
		);
		const row = cardRow("a");
		expect(row.getAttribute("aria-roledescription")).toBeNull();
		expect(row.title).toBe("The ranking follows the scores of this heat.");
	});

	it("builds no ranking action for the points method", () => {
		const bracket = makeBracket("running", unranked("a", "b"), {
			scoring: {
				method: "points",
				scale: { min: 0, max: 10, step: 0.5 },
				categories: [{ type: "wave", counted: 2 }],
				aggregation: "mean",
			},
		});
		const action = buildAction(
			bracket,
			{ kind: "slot", heatId: "h1", riderId: "a" },
			{ kind: "slot", heatId: "h1", riderId: "b" },
		);
		expect(action?.type).toBe("move");
	});
});

describe("reason on a closed heat", () => {
	for (const [status, text] of [
		["judged", "Heat judged: reopen it to change the ranking."],
		["locked", "Heat locked: unlock and reopen it to change the ranking."],
	] as const) {
		it(`explains why a ${status} heat cannot be ranked, in the card and the inspector`, () => {
			const { container } = render(
				<Harness
					bracket={makeBracket(status, [
						{ riderId: "a", rank: 1 },
						{ riderId: "b", rank: 2 },
					])}
				/>,
			);
			const row = cardRow("a");
			expect(row.getAttribute("aria-roledescription")).toBeNull();
			expect(row.title).toBe(text);
			expect(row.getAttribute("aria-description")).toBe(text);
			const panel = openHeatInspector(container, "h1");
			const line = panel.querySelector<HTMLElement>(
				".hb-inspector__riders > li",
			)!;
			expect(line.title).toBe(text);
			expect(line.getAttribute("aria-description")).toBe(text);
			expect(
				within(panel).queryByRole("button", { name: /Reorder/ }),
			).toBeNull();
		});
	}

	it("gives the reason in French", () => {
		render(
			<Harness
				locale="fr"
				bracket={makeBracket("judged", [{ riderId: "a", rank: 1 }])}
			/>,
		);
		expect(cardRow("a").title).toBe(
			"Heat jugé : rouvrez-le pour modifier le classement.",
		);
	});
});

describe("ranking from the inspector", () => {
	it("reorders the list with the handle and highlights nothing", async () => {
		const { seen, onChange } = actions();
		const { container } = render(
			<Harness
				onChange={onChange}
				bracket={makeBracket("running", [
					{ riderId: "a", rank: 1 },
					{ riderId: "b", rank: 2 },
					{ riderId: "c", rank: 3 },
				])}
			/>,
		);
		openHeatInspector(container, "h1");
		expect(inspectorOrder()).toEqual(["a", "b", "c"]);
		await pickUp(handle("Reorder A"));
		await press("ArrowDown");
		expect(heatSection().getAttribute("data-drop")).toBeNull();
		await press("Space");
		expect(seen).toEqual([
			{
				type: "setRanks",
				heatId: "h1",
				riderIds: ["b", "a", "c"],
				override: true,
			},
		]);
		expect(inspectorOrder()).toEqual(["b", "a", "c"]);
		expect(cardOrder()).toEqual(["b", "a", "c"]);
	});

	it("starts a pointer drag from anywhere on the row, not only the handle", async () => {
		const { container } = render(
			<Harness
				bracket={makeBracket("running", [
					{ riderId: "a", rank: 1 },
					{ riderId: "b", rank: 2 },
				])}
			/>,
		);
		const panel = openHeatInspector(container, "h1");
		const row = panel.querySelector<HTMLElement>(".hb-inspector__riders > li")!;
		fireEvent.mouseDown(row.querySelector("span")!, {
			button: 0,
			clientX: 10,
			clientY: 10,
		});
		fireEvent.mouseMove(document, { clientX: 10, clientY: 30 });
		await settle();
		expect(row.getAttribute("data-dragging")).toBe("true");
		fireEvent.keyDown(document, { code: "Escape", key: "Escape" });
		fireEvent.mouseUp(document);
		await act(async () => {
			// dnd-kit keeps swallowing clicks for 50ms after a pointer drag.
			await new Promise((resolve) => setTimeout(resolve, 60));
		});
	});

	it("cancels a keyboard drag on Escape without closing the inspector", async () => {
		const { seen, onChange } = actions();
		const { container } = render(
			<Harness
				onChange={onChange}
				bracket={makeBracket("running", [
					{ riderId: "a", rank: 1 },
					{ riderId: "b", rank: 2 },
					{ riderId: "c", rank: 3 },
				])}
			/>,
		);
		openHeatInspector(container, "h1");
		const grip = handle("Reorder A");
		await pickUp(grip);
		await press("ArrowDown");
		expect(document.querySelector('[data-dragging="true"]')).not.toBeNull();
		fireEvent.keyDown(grip, { code: "Escape", key: "Escape" });
		await settle();
		expect(document.querySelector('[data-dragging="true"]')).toBeNull();
		expect(screen.queryByRole("dialog")).not.toBeNull();
		expect(seen).toEqual([]);
		expect(inspectorOrder()).toEqual(["a", "b", "c"]);

		fireEvent.keyDown(grip, { code: "Escape", key: "Escape" });
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("keeps focus on the status trigger when a status is set and cleared", () => {
		const { container } = render(
			<Harness
				bracket={makeBracket("running", [
					{ riderId: "a", rank: 1 },
					{ riderId: "b", rank: 2 },
					{ riderId: "c", rank: 3 },
				])}
			/>,
		);
		const panel = openHeatInspector(container, "h1");
		fireEvent.click(statusTrigger(panel, "B"));
		fireEvent.click(statusItem(/^DNF /));
		expect(inspectorOrder()).toEqual(["a", "c", "b"]);
		expect(document.activeElement).toBe(statusTrigger(panel, "B"));

		fireEvent.click(statusTrigger(panel, "B"));
		fireEvent.click(statusItem(/^DNF /));
		expect(document.activeElement).toBe(statusTrigger(panel, "B"));
	});

	it("keeps the status menu usable and out of the drag", () => {
		const { container } = render(
			<Harness
				bracket={makeBracket("running", [
					{ riderId: "a", rank: 1 },
					{ riderId: "b", rank: 2 },
				])}
			/>,
		);
		const panel = openHeatInspector(container, "h1");
		const handles = panel.querySelectorAll("[aria-roledescription]");
		expect(handles).toHaveLength(2);
		for (const el of handles) {
			expect(el.tagName).toBe("BUTTON");
			expect(el.closest(".hb-status-menu-root")).toBeNull();
		}
		fireEvent.click(statusTrigger(panel, "B"));
		fireEvent.click(statusItem(/^DNF /));
		expect(cardRow("b").getAttribute("aria-roledescription")).toBeNull();
	});

	it("puts a rider back last when its status is unchecked", () => {
		const { container } = render(
			<Harness
				bracket={makeBracket("running", [
					{ riderId: "a", rank: 1 },
					{ riderId: "b", rank: 2 },
					{ riderId: "c", rank: 3 },
				])}
			/>,
		);
		const panel = openHeatInspector(container, "h1");
		const shown = (root: Element) =>
			root.querySelector("[data-result] [aria-hidden]")?.textContent;
		fireEvent.click(statusTrigger(panel, "A"));
		fireEvent.click(statusItem(/^DNF /));
		expect(shown(cardRow("a"))).toBe("DNF");

		fireEvent.click(statusTrigger(panel, "A"));
		expect(statusItem(/^DNF /).getAttribute("aria-checked")).toBe("true");
		fireEvent.click(statusItem(/^DNF /));
		expect(shown(cardRow("a"))).toBe("3");
		expect(
			shown(panel.querySelector(".hb-inspector__riders > li:last-child")!),
		).toBe("3");
		expect(cardOrder()).toEqual(["b", "c", "a"]);
		expect(inspectorOrder()).toEqual(["b", "c", "a"]);
	});

	it("does not start a pointer drag from the status trigger nor its menu", async () => {
		const { container } = render(
			<Harness
				bracket={makeBracket("running", [
					{ riderId: "a", rank: 1 },
					{ riderId: "b", rank: 2 },
				])}
			/>,
		);
		const panel = openHeatInspector(container, "h1");
		const row = panel.querySelector<HTMLElement>(".hb-inspector__riders > li")!;
		const trigger = statusTrigger(panel, "A");
		fireEvent.mouseDown(trigger, { button: 0, clientX: 10, clientY: 10 });
		fireEvent.mouseMove(document, { clientX: 10, clientY: 40 });
		await settle();
		expect(row.getAttribute("data-dragging")).toBeNull();
		fireEvent.mouseUp(document);
		fireEvent.click(trigger);
		expect(screen.getByRole("menu")).toBeTruthy();

		fireEvent.mouseDown(statusItem(/^DNF /), {
			button: 0,
			clientX: 10,
			clientY: 10,
		});
		fireEvent.mouseMove(document, { clientX: 10, clientY: 40 });
		await settle();
		expect(row.getAttribute("data-dragging")).toBeNull();
		fireEvent.mouseUp(document);
	});

	it("lists riders with a status last, without a handle", () => {
		const { container } = render(
			<Harness
				bracket={makeBracket("running", [
					{ riderId: "a", rank: null, status: "DSQ" },
					{ riderId: "b", rank: 1 },
				])}
			/>,
		);
		const panel = openHeatInspector(container, "h1");
		expect(inspectorOrder()).toEqual(["b", "a"]);
		expect(
			within(panel).queryByRole("button", { name: "Reorder A" }),
		).toBeNull();
		expect(
			within(panel).getByRole("button", { name: "Reorder B" }),
		).toBeTruthy();
	});

	it("offers no handle on a pending heat", () => {
		const { container } = render(
			<Harness bracket={makeBracket("pending", unranked("a", "b"))} />,
		);
		const panel = openHeatInspector(container, "h1");
		expect(within(panel).queryByRole("button", { name: /Reorder/ })).toBeNull();
	});
});

describe("cancelling the start from the inspector", () => {
	it("is not in the card row of icons", () => {
		render(<Harness bracket={makeBracket("running", unranked("a"))} />);
		expect(
			within(heatSection()).queryByRole("button", { name: "Cancel start" }),
		).toBeNull();
	});

	it("sends the heat back to pending", () => {
		const { seen, onChange } = actions();
		const { container } = render(
			<Harness
				onChange={onChange}
				bracket={makeBracket("running", unranked("a", "b"))}
			/>,
		);
		const panel = openHeatInspector(container, "h1");
		fireEvent.click(
			within(panel).getByRole("button", { name: "Cancel start" }),
		);
		expect(seen).toEqual([
			{ type: "setHeatStatus", heatId: "h1", status: "pending" },
		]);
		expect(heatSection().getAttribute("data-status")).toBe("pending");
	});

	it("is refused with the reason while ranks are entered", () => {
		const { container } = render(
			<Harness bracket={makeBracket("running", [{ riderId: "a", rank: 1 }])} />,
		);
		const panel = openHeatInspector(container, "h1");
		const cancel = within(panel).getByRole("button", { name: "Cancel start" });
		expect(cancel.getAttribute("aria-disabled")).toBe("true");
		expect(cancel.title).toBe(
			"Clear the ranks of this heat before cancelling its start.",
		);
	});

	it("is labelled in French", () => {
		const { container } = render(
			<Harness locale="fr" bracket={makeBracket("running", unranked("a"))} />,
		);
		const panel = openHeatInspector(container, "h1");
		expect(
			within(panel).getByRole("button", { name: "Annuler le départ" }),
		).toBeTruthy();
	});
});

describe("confirmation from a drop", () => {
	const bracket = () => makeBracket("pending", unranked("a", "b", "c"));

	async function dropOnPool() {
		await pickUp(cardRow("c"));
		await press("ArrowDown");
		await press("ArrowDown");
		await press("Space");
	}

	it("asks first, then dispatches again with confirm", async () => {
		const dispatchSpy = vi.fn<(action: Action) => void>();
		render(
			<Harness
				bracket={bracket()}
				destructive="remove"
				dispatchSpy={dispatchSpy}
			/>,
		);
		await dropOnPool();
		expect(screen.getByRole("alertdialog")).toBeTruthy();
		expect(cardOrder()).toEqual(["a", "b", "c"]);
		expect(screen.getByRole("status").textContent).toBe(
			"C was dropped. Confirm the change to apply it.",
		);
		fireEvent.click(
			within(screen.getByRole("alertdialog")).getByRole("button", {
				name: "Confirm",
			}),
		);
		expect(dispatchSpy.mock.calls.map(([action]) => action)).toEqual([
			{ type: "remove", riderId: "c", heatId: "h1" },
			{ type: "remove", riderId: "c", heatId: "h1", confirm: true },
		]);
		expect(cardOrder()).toEqual(["a", "b"]);
	});

	it("changes nothing when the confirmation is cancelled", async () => {
		const { seen, onChange } = actions();
		render(
			<Harness onChange={onChange} bracket={bracket()} destructive="remove" />,
		);
		await dropOnPool();
		fireEvent.click(
			within(screen.getByRole("alertdialog")).getByRole("button", {
				name: "Cancel",
			}),
		);
		expect(screen.queryByRole("alertdialog")).toBeNull();
		expect(seen).toEqual([]);
		expect(cardOrder()).toEqual(["a", "b", "c"]);
	});

	it("shows no error banner while waiting for the confirmation", async () => {
		render(<Harness bracket={bracket()} destructive="remove" />);
		await dropOnPool();
		expect(screen.queryByRole("alert")).toBeNull();
	});
});

describe("dropping on the unplaced riders", () => {
	for (const collapsed of [false, true]) {
		describe(collapsed ? "collapsed panel" : "open panel", () => {
			it("removes the rider from its heat", async () => {
				const { seen, onChange } = actions();
				render(
					<Harness
						onChange={onChange}
						collapsed={collapsed}
						bracket={makeBracket("pending", unranked("a", "b", "c"))}
					/>,
				);
				await pickUp(cardRow("c"));
				await press("ArrowDown");
				await press("ArrowDown");
				const pool = document.querySelector<HTMLElement>(".hb-pool")!;
				expect(pool.getAttribute("data-drop")).toBe("allowed");
				await press("Space");
				expect(seen).toEqual([{ type: "remove", riderId: "c", heatId: "h1" }]);
				expect(cardOrder()).toEqual(["a", "b"]);
				expect(screen.getByRole("status").textContent).toBe(
					"C was removed from the heat and is unplaced again.",
				);
				expect(pool.getAttribute("data-drop")).toBeNull();
				if (!collapsed) {
					expect(within(pool).getByText("C")).toBeTruthy();
				}
			});

			it("refuses a heat that has started, with the reason", async () => {
				const { seen, onChange } = actions();
				render(
					<Harness
						onChange={onChange}
						collapsed={collapsed}
						bracket={makeBracket("running", unranked("a", "b"))}
					/>,
				);
				await pickUp(cardRow("b"));
				for (let i = 0; i < 3; i++) await press("ArrowDown");
				const pool = document.querySelector<HTMLElement>(".hb-pool")!;
				expect(pool.getAttribute("data-drop")).toBe("denied");
				expect(pool.title).toBe(
					"This heat has started and can no longer be changed.",
				);
				await press("Space");
				expect(seen).toEqual([]);
				expect(cardOrder()).toEqual(["a", "b"]);
				expect(screen.getByRole("status").textContent).toBe(
					"B was not moved. This heat has started and can no longer be changed.",
				);
			});
		});
	}

	it("announces the removal in French", async () => {
		render(
			<Harness
				locale="fr"
				bracket={makeBracket("pending", unranked("a", "b"))}
			/>,
		);
		await pickUp(cardRow("b"));
		for (let i = 0; i < 3; i++) await press("ArrowDown");
		await press("Space");
		expect(screen.getByRole("status").textContent).toBe(
			"B a été retiré du heat et n'est plus placé.",
		);
	});
});
