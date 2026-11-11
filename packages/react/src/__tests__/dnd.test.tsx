import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import type { Action, Bracket, Entry } from "@heatboard/core";
import { useMemo, type ComponentProps } from "react";
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
import { makeController } from "./helpers";

afterEach(cleanup);

function makeDndBracket(): Bracket {
	return {
		id: "dnd",
		name: "Dnd Open",
		entries: [
			{ riderId: "a", displayName: "Ann" },
			{ riderId: "b", displayName: "Bob" },
			{ riderId: "c", displayName: "Cy" },
			{ riderId: "d", displayName: "Dee" },
			{ riderId: "e", displayName: "Eve", entryRoundId: "round2" },
		],
		rounds: [
			{
				id: "round1",
				name: "Round 1",
				group: "main",
				maxPerHeat: 2,
				advancing: 1,
				heats: [
					{
						id: "h1",
						status: "pending",
						slots: [
							{ riderId: "a", rank: null },
							{ riderId: "b", rank: null },
						],
					},
					{
						id: "h2",
						status: "pending",
						slots: [{ riderId: "c", rank: null }],
					},
				],
			},
			{
				id: "round2",
				name: "Round 2",
				group: "main",
				maxPerHeat: 2,
				advancing: 1,
				heats: [{ id: "h3", status: "pending", slots: [] }],
			},
		],
		links: [],
		status: "draft",
		visibility: "private",
	};
}

// jsdom has no layout: stack draggables and open slots in document order so
// the keyboard coordinates of dnd-kit have rectangles to work with.
function layoutRect(el: HTMLElement): DOMRect {
	const dragged = document.querySelector<HTMLElement>('[data-dragging="true"]');
	if (dragged && el.classList.contains("hb-drag-overlay")) {
		return layoutRect(dragged);
	}
	const stops = [
		...document.querySelectorAll("[aria-roledescription], .hb-empty-slot"),
	];
	const index = stops.findIndex(
		(stop) =>
			stop === el ||
			(el.firstElementChild === stop && el.childElementCount === 1),
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
	mode?: "viewer" | "admin";
	onChange?: (next: Bracket, cause: BracketChangeCause) => void;
	dispatchSpy?: (action: Action) => void;
	bracket?: Bracket;
	poolProps?: ComponentProps<typeof EntryPool>;
	boardProps?: Partial<ComponentProps<typeof Board>>;
	locale?: "en" | "fr";
	getRiderLabel?: (entry: Entry) => string;
}

function Harness({
	mode = "admin",
	onChange,
	dispatchSpy,
	bracket,
	poolProps,
	boardProps,
	locale,
	getRiderLabel,
}: HarnessProps) {
	const real = useBracket({
		defaultBracket: bracket ?? makeDndBracket(),
		...(onChange && { onChange }),
	});
	const controller = useMemo(
		(): BracketController => ({
			...real,
			dispatch: (action) => {
				dispatchSpy?.(action);
				return real.dispatch(action);
			},
		}),
		[real, dispatchSpy],
	);
	return (
		<HeatboardProvider {...(locale && { locale })}>
			<BracketProvider value={controller}>
				<HeatboardDnd {...(getRiderLabel && { getRiderLabel })}>
					<Board mode={mode} {...boardProps} />
					<EntryPool roundId="round1" defaultCollapsed={false} {...poolProps} />
				</HeatboardDnd>
			</BracketProvider>
		</HeatboardProvider>
	);
}

/** One round with a single heat holding the given riders, `e` left in the pool. */
function makeSingleHeatBracket(riderIds: string[]): Bracket {
	return {
		id: "single",
		name: "Single",
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
				advancing: 1,
				heats: [
					{
						id: "h1",
						status: "pending",
						slots: riderIds.map((riderId) => ({ riderId, rank: null })),
					},
				],
			},
		],
		links: [],
		status: "draft",
		visibility: "private",
	};
}

function actions() {
	const seen: Action[] = [];
	const onChange = vi.fn((_next: Bracket, cause: BracketChangeCause) => {
		if (cause.type === "action") seen.push(cause.action);
	});
	return { seen, onChange };
}

function draggable(riderId: string): HTMLElement {
	const el = document
		.querySelector(`[data-rider-id="${riderId}"]`)
		?.closest<HTMLElement>("[aria-roledescription]");
	if (!el) throw new Error(`No draggable for ${riderId}`);
	return el;
}

function heatSection(heatId: string): HTMLElement {
	return document.querySelector<HTMLElement>(
		`section[data-heat-id="${heatId}"]`,
	)!;
}

function riderOrder(heatId: string): string[] {
	return [...heatSection(heatId).querySelectorAll("[data-rider-id]")].map(
		(el) => el.getAttribute("data-rider-id")!,
	);
}

async function settle() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 20));
	});
}

async function press(target: Element | Document, code: string) {
	fireEvent.keyDown(target, { code, key: code });
	await settle();
}

async function pickUp(riderId: string) {
	const el = draggable(riderId);
	el.focus();
	await press(el, "Space");
}

describe("viewer mode", () => {
	it("renders nothing draggable, pool included", () => {
		render(<Harness mode="viewer" />);
		expect(document.querySelectorAll("[aria-roledescription]")).toHaveLength(0);
	});

	it("leaves the pool undraggable without an admin board", () => {
		render(
			<BracketProvider value={makeController(makeDndBracket())}>
				<HeatboardDnd>
					<EntryPool defaultCollapsed={false} />
				</HeatboardDnd>
			</BracketProvider>,
		);
		expect(document.querySelectorAll("[aria-roledescription]")).toHaveLength(0);
	});

	it("keeps gesture styles inline when unstyled", () => {
		render(<Harness boardProps={{ unstyled: true }} />);
		const style = draggable("a").style;
		expect(style.touchAction).toBe("manipulation");
		expect(style.userSelect).toBe("none");
	});

	it("mounts no drag and drop at all for a lone viewer board", () => {
		render(
			<BracketProvider value={makeController(makeDndBracket())}>
				<Board />
			</BracketProvider>,
		);
		expect(document.querySelectorAll("[aria-roledescription]")).toHaveLength(0);
		expect(screen.queryByRole("button")).toBeNull();
		expect(document.querySelector("[aria-live]")).toBeNull();
	});
});

describe("draggable items", () => {
	it("keeps every control out of the draggable rows and chips", () => {
		render(<Harness poolProps={{ mode: "admin" }} />);
		const handles = document.querySelectorAll("[aria-roledescription]");
		expect(handles.length).toBe(4);
		for (const handle of handles) {
			expect(
				handle.querySelector("button, input, select, textarea, a"),
			).toBeNull();
		}
		const trigger = screen.getByRole("button", { name: "Options for Dee" });
		expect(trigger.closest("[aria-roledescription]")).toBeNull();
		expect(
			trigger.closest("li")!.querySelector("[aria-roledescription]"),
		).toBeTruthy();
	});
});

describe("keyboard drag and drop", () => {
	it("reorders a rider within its heat", async () => {
		const { seen, onChange } = actions();
		render(<Harness onChange={onChange} />);
		await pickUp("a");
		await press(document, "ArrowDown");
		await press(document, "Space");
		expect(seen).toEqual([
			{
				type: "move",
				riderId: "a",
				fromHeatId: "h1",
				toHeatId: "h1",
				index: 1,
			},
		]);
		expect(riderOrder("h1")).toEqual(["b", "a"]);
	});

	it("moves a rider to another heat", async () => {
		const { seen, onChange } = actions();
		render(<Harness onChange={onChange} />);
		await pickUp("b");
		await press(document, "ArrowDown");
		await press(document, "Space");
		expect(seen).toEqual([
			{
				type: "move",
				riderId: "b",
				fromHeatId: "h1",
				toHeatId: "h2",
				index: 0,
			},
		]);
		expect(riderOrder("h1")).toEqual(["a"]);
		expect(riderOrder("h2")).toEqual(["b", "c"]);
	});

	it("places an unplaced entry from the pool", async () => {
		const { seen, onChange } = actions();
		const dispatchSpy = vi.fn();
		render(<Harness onChange={onChange} dispatchSpy={dispatchSpy} />);
		await pickUp("d");
		for (let i = 0; i < 3; i++) await press(document, "ArrowUp");
		expect(heatSection("h2").getAttribute("data-drop")).toBe("allowed");
		await press(document, "Space");
		expect(seen).toEqual([
			{ type: "place", riderId: "d", heatId: "h2", index: 0 },
		]);
		expect(dispatchSpy).toHaveBeenCalledTimes(1);
		expect(riderOrder("h2")).toEqual(["d", "c"]);
		expect(
			within(document.querySelector(".hb-pool")!).queryByText("Dee"),
		).toBeNull();
	});

	it("moves a rider up within a heat of four", async () => {
		const { seen, onChange } = actions();
		render(
			<Harness
				onChange={onChange}
				bracket={makeSingleHeatBracket(["a", "b", "c", "d"])}
			/>,
		);
		await pickUp("d");
		await press(document, "ArrowUp");
		await press(document, "ArrowUp");
		await press(document, "Space");
		expect(seen).toEqual([
			{
				type: "move",
				riderId: "d",
				fromHeatId: "h1",
				toHeatId: "h1",
				index: 1,
			},
		]);
		expect(riderOrder("h1")).toEqual(["a", "d", "b", "c"]);
	});

	it("moves a rider down within a heat of four", async () => {
		const { seen, onChange } = actions();
		render(
			<Harness
				onChange={onChange}
				bracket={makeSingleHeatBracket(["a", "b", "c", "d"])}
			/>,
		);
		await pickUp("a");
		for (let i = 0; i < 3; i++) await press(document, "ArrowDown");
		await press(document, "Space");
		expect(seen).toEqual([
			{
				type: "move",
				riderId: "a",
				fromHeatId: "h1",
				toHeatId: "h1",
				index: 3,
			},
		]);
		expect(riderOrder("h1")).toEqual(["b", "c", "d", "a"]);
	});

	it("drops on the open slot of its own heat as the last position", async () => {
		const { seen, onChange } = actions();
		render(
			<Harness
				onChange={onChange}
				bracket={makeSingleHeatBracket(["a", "b", "c"])}
			/>,
		);
		await pickUp("a");
		for (let i = 0; i < 3; i++) await press(document, "ArrowDown");
		await press(document, "Space");
		expect(seen).toEqual([
			{
				type: "move",
				riderId: "a",
				fromHeatId: "h1",
				toHeatId: "h1",
				index: 2,
			},
		]);
		expect(riderOrder("h1")).toEqual(["b", "c", "a"]);
	});

	it("flags a full heat as denied and dispatches nothing on drop", async () => {
		const { seen, onChange } = actions();
		const dispatchSpy = vi.fn();
		render(<Harness onChange={onChange} dispatchSpy={dispatchSpy} />);
		await pickUp("c");
		await press(document, "ArrowUp");
		const heat = heatSection("h1");
		expect(heat.getAttribute("data-drop")).toBe("denied");
		expect(heat.classList.contains("hb-drop--denied")).toBe(true);
		expect(heat.getAttribute("title")).toBe("This heat is full.");
		await press(document, "Space");
		expect(dispatchSpy).not.toHaveBeenCalled();
		expect(seen).toEqual([]);
		expect(riderOrder("h2")).toEqual(["c"]);
		expect(heat.getAttribute("data-drop")).toBeNull();
	});

	it("adds a rider to a later round without removing it from its heat", async () => {
		const { seen, onChange } = actions();
		render(<Harness onChange={onChange} />);
		await pickUp("c");
		await press(document, "ArrowDown");
		await press(document, "ArrowDown");
		const heat = heatSection("h3");
		expect(heat.getAttribute("data-drop")).toBe("allowed");
		expect(heat.getAttribute("data-drop-kind")).toBe("place");
		expect(heat.classList.contains("hb-drop--place")).toBe(true);
		expect(draggable("c").hasAttribute("data-dragging")).toBe(false);
		await press(document, "Space");
		expect(seen).toEqual([
			{ type: "place", riderId: "c", heatId: "h3", index: 0 },
		]);
		expect(riderOrder("h2")).toEqual(["c"]);
		expect(riderOrder("h3")).toEqual(["c"]);
	});

	it("refuses a drop towards an earlier round", async () => {
		const bracket = makeDndBracket();
		const final = bracket.rounds[1]!.heats[0]!;
		final.slots = [{ riderId: "e", rank: null }];
		const dispatchSpy = vi.fn();
		render(<Harness bracket={bracket} dispatchSpy={dispatchSpy} />);
		await pickUp("e");
		await press(document, "ArrowUp");
		const heat = heatSection("h2");
		expect(heat.getAttribute("data-drop")).toBe("denied");
		expect(heat.hasAttribute("data-drop-kind")).toBe(false);
		expect(heat.getAttribute("title")).toBe(
			"Riders cannot be moved from one round to another.",
		);
		await press(document, "Space");
		expect(dispatchSpy).not.toHaveBeenCalled();
		expect(riderOrder("h3")).toEqual(["e"]);
	});

	it("refuses a later round that already holds the rider elsewhere", async () => {
		const bracket = makeDndBracket();
		const round2 = bracket.rounds[1]!;
		round2.heats[0]!.slots = [{ riderId: "c", rank: null }];
		round2.heats.push({ id: "h4", status: "pending", slots: [] });
		const dispatchSpy = vi.fn();
		render(<Harness bracket={bracket} dispatchSpy={dispatchSpy} />);
		await pickUp("c");
		for (let i = 0; i < 4; i++) await press(document, "ArrowDown");
		const heat = heatSection("h4");
		expect(heat.getAttribute("data-drop")).toBe("denied");
		expect(heat.getAttribute("title")).toBe(
			"This rider is already in this round.",
		);
		await press(document, "Space");
		expect(dispatchSpy).not.toHaveBeenCalled();
		expect(riderOrder("h4")).toEqual([]);
	});

	it("refuses to place a pool entry in another round than its list", async () => {
		const dispatchSpy = vi.fn();
		render(<Harness dispatchSpy={dispatchSpy} />);
		await pickUp("d");
		await press(document, "ArrowUp");
		const heat = heatSection("h3");
		expect(heat.getAttribute("data-drop")).toBe("denied");
		expect(heat.getAttribute("title")).toBe(
			"This is not the round this list is for.",
		);
		await press(document, "Space");
		expect(dispatchSpy).not.toHaveBeenCalled();
		expect(riderOrder("h3")).toEqual([]);
	});

	it("flags an open spot as allowed", async () => {
		render(<Harness />);
		await pickUp("b");
		await press(document, "ArrowDown");
		expect(heatSection("h2").getAttribute("data-drop")).toBe("allowed");
		await press(document, "Escape");
		expect(heatSection("h2").getAttribute("data-drop")).toBeNull();
		expect(riderOrder("h1")).toEqual(["a", "b"]);
	});

	it("previews a pool entry with the settings of the pool", async () => {
		render(
			<Harness
				poolProps={{
					components: {
						EntryPoolItem: ({ entry }) => (
							<b data-testid="pool-preview" data-rider-id={entry.riderId}>
								{entry.riderId}
							</b>
						),
					},
				}}
			/>,
		);
		await pickUp("d");
		const overlay = document.querySelector(".hb-drag-overlay")!;
		expect(
			within(overlay as HTMLElement).getByTestId("pool-preview"),
		).toBeTruthy();
	});
});

describe("announcements with getRiderLabel", () => {
	it("names the rider with the label when displayNames are empty", async () => {
		const bracket = makeDndBracket();
		render(
			<Harness
				bracket={{
					...bracket,
					entries: bracket.entries.map((e) => ({ ...e, displayName: "" })),
				}}
				getRiderLabel={(entry) => `Name ${entry.riderId}`}
			/>,
		);
		await pickUp("b");
		await press(document, "ArrowDown");
		await press(document, "Space");
		expect(screen.getByRole("status").textContent).toBe(
			"Name b was dropped in Heat 2.",
		);
	});

	it("falls back to the rider id when displayName is empty", async () => {
		const bracket = makeDndBracket();
		render(
			<Harness
				bracket={{
					...bracket,
					entries: bracket.entries.map((e) => ({ ...e, displayName: "" })),
				}}
			/>,
		);
		await pickUp("b");
		await press(document, "ArrowDown");
		await press(document, "Space");
		expect(screen.getByRole("status").textContent).toBe(
			"b was dropped in Heat 2.",
		);
	});
});

describe("announcements", () => {
	const cases = [
		{
			locale: "en" as const,
			moved: "Bob was dropped in Heat 2.",
			placed: "Dee was dropped in Heat 2.",
			over: "Cy is over Heat 1. This heat is full.",
			refused: "Cy was not moved. This heat is full.",
			cancelled: "Move cancelled, Bob was not moved.",
			willCopy: "Cy will be added to Heat 3 of Round 2.",
			copied: "Cy was added to Heat 3 of Round 2.",
		},
		{
			locale: "fr" as const,
			moved: "Bob a été déposé dans Heat 2.",
			placed: "Dee a été déposé dans Heat 2.",
			over: "Cy est au-dessus de Heat 1. Ce heat est complet.",
			refused: "Cy n'a pas bougé. Ce heat est complet.",
			cancelled: "Déplacement annulé, Bob n'a pas bougé.",
			willCopy: "Cy sera ajouté à Heat 3 de Round 2.",
			copied: "Cy a été ajouté à Heat 3 de Round 2.",
		},
	];

	for (const c of cases) {
		describe(c.locale, () => {
			it("announces a move between heats", async () => {
				render(<Harness locale={c.locale} />);
				await pickUp("b");
				await press(document, "ArrowDown");
				await press(document, "Space");
				expect(screen.getByRole("status").textContent).toBe(c.moved);
			});

			it("announces a placement from the pool", async () => {
				render(<Harness locale={c.locale} />);
				await pickUp("d");
				for (let i = 0; i < 3; i++) await press(document, "ArrowUp");
				await press(document, "Space");
				expect(screen.getByRole("status").textContent).toBe(c.placed);
			});

			it("announces the reason of a refusal, hovering then dropping", async () => {
				render(<Harness locale={c.locale} />);
				await pickUp("c");
				await press(document, "ArrowUp");
				expect(screen.getByRole("status").textContent).toBe(c.over);
				await press(document, "Space");
				expect(screen.getByRole("status").textContent).toBe(c.refused);
			});

			it("announces an addition to a later round", async () => {
				render(<Harness locale={c.locale} />);
				await pickUp("c");
				await press(document, "ArrowDown");
				await press(document, "ArrowDown");
				expect(screen.getByRole("status").textContent).toBe(c.willCopy);
				await press(document, "Space");
				expect(screen.getByRole("status").textContent).toBe(c.copied);
			});

			it("announces a cancellation", async () => {
				render(<Harness locale={c.locale} />);
				await pickUp("b");
				await press(document, "ArrowDown");
				await press(document, "Escape");
				expect(screen.getByRole("status").textContent).toBe(c.cancelled);
			});
		});
	}
});

describe("error banner", () => {
	function withError(controller: BracketController) {
		return (
			<BracketProvider value={controller}>
				<Board />
			</BracketProvider>
		);
	}

	it("shows a translated alert for a server refusal and dismisses it", () => {
		const controller: BracketController = {
			...makeController(makeDndBracket()),
			error: { code: "SERVER_ERROR", message: "boom" },
		};
		render(
			<HeatboardProvider locale="fr">
				{withError(controller)}
			</HeatboardProvider>,
		);
		const alert = screen.getByRole("alert");
		expect(alert.textContent).toContain("Le serveur a refusé la modification.");
		fireEvent.click(within(alert).getByRole("button", { name: "Fermer" }));
		expect(controller.clearError).toHaveBeenCalledTimes(1);
	});

	it("falls back to a generic message for unknown codes", () => {
		const controller: BracketController = {
			...makeController(makeDndBracket()),
			error: { code: "UNKNOWN_ACTION", message: "x" },
		};
		render(withError(controller));
		expect(screen.getByRole("alert").textContent).toContain(
			"This change is not allowed.",
		);
	});

	it("can be replaced through components", () => {
		const controller: BracketController = {
			...makeController(makeDndBracket()),
			error: { code: "HEAT_FULL", message: "x" },
		};
		render(
			<BracketProvider value={controller}>
				<Board
					components={{
						BoardError: ({ message }) => <p data-testid="custom">{message}</p>,
					}}
				/>
			</BracketProvider>,
		);
		expect(screen.getByTestId("custom").textContent).toBe("This heat is full.");
	});
});

describe("EntryPool", () => {
	it("lists entries without a place whose entry round is not later", () => {
		render(
			<BracketProvider value={makeController(makeDndBracket())}>
				<EntryPool roundId="round1" defaultCollapsed={false} />
			</BracketProvider>,
		);
		const names = screen.getAllByRole("listitem").map((li) => li.textContent);
		expect(names).toEqual(["Dee"]);
		expect(
			screen.getByRole("heading", { name: "Unplaced riders" }),
		).toBeTruthy();
	});

	it("groups by entry round without roundId and includes later entries for later rounds", () => {
		const controller = makeController(makeDndBracket());
		const { unmount } = render(
			<BracketProvider value={controller}>
				<EntryPool defaultCollapsed={false} />
			</BracketProvider>,
		);
		expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(
			["Dee", "Eve"],
		);
		expect(screen.getByRole("heading", { name: "Round 2" })).toBeTruthy();
		unmount();
		render(
			<BracketProvider value={controller}>
				<EntryPool roundId="round2" defaultCollapsed={false} />
			</BracketProvider>,
		);
		expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(
			["Ann", "Bob", "Cy", "Dee", "Eve"],
		);
	});

	it("does not list a seed already placed in a later round", () => {
		const bracket = makeDndBracket();
		bracket.rounds[1]!.heats[0]!.slots = [{ riderId: "d", rank: null }];
		render(
			<BracketProvider value={makeController(bracket)}>
				<EntryPool defaultCollapsed={false} />
			</BracketProvider>,
		);
		expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(
			["Eve"],
		);
		cleanup();
		render(
			<BracketProvider value={makeController(bracket)}>
				<EntryPool roundId="round1" defaultCollapsed={false} />
			</BracketProvider>,
		);
		expect(screen.queryByText("Dee")).toBeNull();
	});

	it("shows a translated empty state", () => {
		const bracket = makeDndBracket();
		bracket.entries = bracket.entries.slice(0, 3);
		render(
			<HeatboardProvider locale="fr">
				<BracketProvider value={makeController(bracket)}>
					<EntryPool defaultCollapsed={false} />
				</BracketProvider>
			</HeatboardProvider>,
		);
		expect(screen.getByText("Tous les inscrits sont placés")).toBeTruthy();
		expect(screen.queryAllByRole("listitem")).toHaveLength(0);
	});

	it("is not draggable outside a HeatboardDnd and accepts a custom item", () => {
		render(
			<BracketProvider value={makeController(makeDndBracket())}>
				<EntryPool
					defaultCollapsed={false}
					components={{
						EntryPoolItem: ({ entry }) => (
							<b data-testid="item">{entry.riderId}</b>
						),
					}}
				/>
			</BracketProvider>,
		);
		expect(screen.getAllByTestId("item").map((e) => e.textContent)).toEqual([
			"d",
			"e",
		]);
		expect(document.querySelector("[aria-roledescription]")).toBeNull();
	});
});

describe("buildAction", () => {
	const bracket = makeDndBracket();

	it("appends at the end of another heat for an end target", () => {
		expect(
			buildAction(
				bracket,
				{ kind: "slot", heatId: "h1", riderId: "a" },
				{ kind: "end", heatId: "h2" },
			),
		).toEqual({
			type: "move",
			riderId: "a",
			fromHeatId: "h1",
			toHeatId: "h2",
			index: 1,
		});
	});

	it("uses the last position for an end target in the same heat", () => {
		expect(
			buildAction(
				bracket,
				{ kind: "slot", heatId: "h1", riderId: "a" },
				{ kind: "end", heatId: "h1" },
			),
		).toMatchObject({ index: 1 });
	});

	it("places a rider into a later round and keeps its heat", () => {
		expect(
			buildAction(
				bracket,
				{ kind: "slot", heatId: "h2", riderId: "c" },
				{ kind: "end", heatId: "h3" },
			),
		).toEqual({ type: "place", riderId: "c", heatId: "h3", index: 0 });
	});

	it("keeps a move for an earlier round, left to the core to refuse", () => {
		const withFinal = makeDndBracket();
		withFinal.rounds[1]!.heats[0]!.slots = [{ riderId: "e", rank: null }];
		expect(
			buildAction(
				withFinal,
				{ kind: "slot", heatId: "h3", riderId: "e" },
				{ kind: "end", heatId: "h2" },
			),
		).toMatchObject({ type: "move", fromHeatId: "h3", toHeatId: "h2" });
	});

	it("keeps a move within the same round", () => {
		expect(
			buildAction(
				bracket,
				{ kind: "slot", heatId: "h1", riderId: "a" },
				{ kind: "slot", heatId: "h2", riderId: "c" },
			),
		).toMatchObject({ type: "move", toHeatId: "h2", index: 0 });
	});

	it("returns null for an unknown heat", () => {
		expect(
			buildAction(
				bracket,
				{ kind: "pool", roundId: "round1", riderId: "d" },
				{ kind: "end", heatId: "nope" },
			),
		).toBeNull();
	});
});
