import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	expectRefused,
	heatSection,
	inspector,
	makeJudgedRace,
	makeRaceBracket,
	openBracketInspector,
	openHeatInspector,
	openRoundInspector,
	renderAdmin,
	roundSection,
} from "./admin-helpers";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function confirmDialog(name: string) {
	fireEvent.click(
		within(screen.getByRole("alertdialog")).getByRole("button", { name }),
	);
}

function button(root: HTMLElement, name: string | RegExp): HTMLButtonElement {
	return within(root).getByRole("button", { name });
}

function nameField(panel: HTMLElement): HTMLInputElement {
	return within(panel).getByRole<HTMLInputElement>("textbox", { name: "Name" });
}

describe("renaming", () => {
	it("renames the bracket with Enter", () => {
		const { container, actions } = renderAdmin(makeRaceBracket());
		const panel = openBracketInspector(container);
		const field = nameField(panel);
		expect(field.value).toBe("Race Open");
		fireEvent.change(field, { target: { value: "  Final Cup " } });
		fireEvent.keyDown(field, { key: "Enter" });
		expect(actions).toEqual([{ type: "renameBracket", name: "Final Cup" }]);
		const header = container.querySelector<HTMLElement>("header")!;
		expect(
			within(header).getByRole("heading", { name: "Final Cup" }),
		).toBeTruthy();
		expect(field.value).toBe("Final Cup");
	});

	it("drops the edit on Escape, and ignores an unchanged or empty name", () => {
		const { container, actions } = renderAdmin(makeRaceBracket());
		const panel = openRoundInspector(container, "round1");
		const field = nameField(panel);
		fireEvent.change(field, { target: { value: "Other" } });
		fireEvent.keyDown(field, { key: "Escape" });
		expect(field.value).toBe("Round 1");
		expect(inspector()).toBe(panel);

		fireEvent.change(field, { target: { value: "  " } });
		fireEvent.keyDown(field, { key: "Enter" });
		expect(field.value).toBe("Round 1");
		fireEvent.keyDown(field, { key: "Enter" });
		expect(actions).toEqual([]);
		expect(
			within(roundSection(container, "round1")).getByRole("heading", {
				name: "Round 1",
			}),
		).toBeTruthy();
	});

	it("renames a round", () => {
		const { container, actions } = renderAdmin(makeRaceBracket());
		const field = nameField(openRoundInspector(container, "round1"));
		fireEvent.change(field, { target: { value: "Qualifiers" } });
		fireEvent.keyDown(field, { key: "Enter" });
		expect(actions).toEqual([
			{ type: "renameRound", roundId: "round1", name: "Qualifiers" },
		]);
		expect(
			within(roundSection(container, "round1")).getByRole("heading", {
				name: "Qualifiers",
			}),
		).toBeTruthy();
	});

	it("renames a heat and clears its name back to the default", () => {
		const { container, actions } = renderAdmin(makeRaceBracket());
		const heat = heatSection(container, "h1");
		const field = nameField(openHeatInspector(container, "h1"));
		expect(field.placeholder).toBe("Heat 1");
		fireEvent.change(field, { target: { value: "Big one" } });
		fireEvent.keyDown(field, { key: "Enter" });
		expect(actions[0]).toEqual({
			type: "renameHeat",
			heatId: "h1",
			name: "Big one",
		});
		expect(within(heat).getByRole("heading", { name: "Big one" })).toBeTruthy();

		fireEvent.change(field, { target: { value: "" } });
		fireEvent.keyDown(field, { key: "Enter" });
		expect(actions[1]).toEqual({ type: "renameHeat", heatId: "h1" });
		expect(within(heat).getByRole("heading", { name: "Heat 1" })).toBeTruthy();
	});

	it("commits on blur", () => {
		const { container, actions } = renderAdmin(makeRaceBracket());
		const field = nameField(openRoundInspector(container, "round1"));
		fireEvent.change(field, { target: { value: "Heats" } });
		fireEvent.blur(field);
		expect(actions).toEqual([
			{ type: "renameRound", roundId: "round1", name: "Heats" },
		]);
	});

	it("is not offered without the names permission", () => {
		const { container } = renderAdmin(makeRaceBracket(), {
			board: { permissions: { names: false } },
		});
		expect(
			within(openRoundInspector(container, "round1")).queryByRole("textbox"),
		).toBeNull();
	});
});

describe("rounds and heats", () => {
	it("appends a round with a generated id and the size of the last one", () => {
		const { container, actions } = renderAdmin(makeRaceBracket());
		fireEvent.click(screen.getByRole("button", { name: "Add round" }));
		expect(actions).toEqual([
			{
				type: "addRound",
				round: {
					id: "id-1",
					name: "Round 3",
					group: "main",
					maxPerHeat: 4,
					advancing: 1,
				},
			},
		]);
		expect(container.querySelectorAll("section[data-round-id]")).toHaveLength(
			3,
		);
		expect(container.querySelector('[data-round-id="id-1"]')).toBeTruthy();
	});

	it("removes a round after confirmation", () => {
		const { container, actions } = renderAdmin(makeRaceBracket());
		fireEvent.click(
			button(openRoundInspector(container, "round2"), "Remove Round 2"),
		);
		expect(actions).toEqual([]);
		const dialog = screen.getByRole("alertdialog");
		expect(within(dialog).getByText("Are you sure?")).toBeTruthy();
		expect(
			within(dialog).getByText(
				"Round 2 will be removed, with 1 heat and 0 placements.",
			),
		).toBeTruthy();
		confirmDialog("Confirm");
		expect(actions).toEqual([
			{ type: "removeRound", roundId: "round2", confirm: true },
		]);
		expect(container.querySelector('[data-round-id="round2"]')).toBeNull();
		expect(document.activeElement?.textContent).toBe("Race Open");
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("adds a heat, then removes it after confirmation", () => {
		const { container, actions } = renderAdmin(makeRaceBracket());
		fireEvent.click(
			button(openRoundInspector(container, "round2"), "Add heat"),
		);
		expect(actions[0]).toEqual({
			type: "addHeat",
			roundId: "round2",
			heat: { id: "id-1" },
		});
		expect(container.querySelector('[data-heat-id="id-1"]')).toBeTruthy();
		fireEvent.click(
			button(openHeatInspector(container, "id-1"), "Remove Heat 4"),
		);
		expect(actions).toHaveLength(1);
		expect(
			within(screen.getByRole("alertdialog")).getByText(
				"Heat 4 will be removed, along with 0 placements.",
			),
		).toBeTruthy();
		confirmDialog("Confirm");
		expect(actions[1]).toEqual({
			type: "removeHeat",
			heatId: "id-1",
			confirm: true,
		});
		expect(container.querySelector('[data-heat-id="id-1"]')).toBeNull();
	});

	it("leaves a removal untouched on Cancel and gives the focus back", () => {
		const { container, actions } = renderAdmin(makeRaceBracket());
		const panel = openHeatInspector(container, "h1");
		const remove = button(panel, "Remove Heat 1");
		remove.focus();
		fireEvent.click(remove);
		expect(
			within(screen.getByRole("alertdialog")).getByText(
				"Heat 1 will be removed, along with 3 placements.",
			),
		).toBeTruthy();
		confirmDialog("Cancel");
		expect(actions).toEqual([]);
		expect(container.querySelector('[data-heat-id="h1"]')).toBeTruthy();
		expect(document.activeElement).toBe(remove);
		expect(inspector()).toBe(panel);
	});

	it("moves the focus to the round title when the confirmed heat is gone", () => {
		const { container } = renderAdmin(makeRaceBracket());
		const remove = button(openHeatInspector(container, "h1"), "Remove Heat 1");
		remove.focus();
		fireEvent.click(remove);
		confirmDialog("Confirm");
		expect(container.querySelector('[data-heat-id="h1"]')).toBeNull();
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(document.activeElement).toBe(
			within(roundSection(container, "round1")).getByRole("heading", {
				name: "Round 1",
			}),
		);
	});

	it("keeps structure controls in a running bracket and hides them once finished", () => {
		const running = renderAdmin(makeJudgedRace());
		expect(screen.getByRole("button", { name: "Add round" })).toBeTruthy();
		const round = openRoundInspector(running.container, "round1");
		expect(button(round, "Add heat")).toBeTruthy();
		expect(button(round, "Remove Round 1")).toBeTruthy();
		cleanup();

		const finished = renderAdmin({ ...makeJudgedRace(), status: "finished" });
		expect(screen.queryByRole("button", { name: "Add round" })).toBeNull();
		const finishedRound = openRoundInspector(finished.container, "round1");
		expect(
			within(finishedRound).queryByRole("button", { name: /^Remove/ }),
		).toBeNull();
		expect(
			within(finishedRound).queryByRole("button", { name: "Add heat" }),
		).toBeNull();
		const finishedHeat = openHeatInspector(finished.container, "h1");
		expect(
			within(finishedHeat).queryByRole("button", { name: /^Remove/ }),
		).toBeNull();
	});

	it("greys a removal the core refuses", () => {
		const bracket = makeRaceBracket({
			entries: [{ riderId: "r1", displayName: "Ann", entryRoundId: "round2" }],
		});
		const { container, actions } = renderAdmin(bracket);
		const remove = button(
			openRoundInspector(container, "round2"),
			"Remove Round 2",
		);
		expectRefused(remove);
		expect(remove.title).toBe("A rider enters the bracket at this round.");
		remove.focus();
		expect(document.activeElement).toBe(remove);
		fireEvent.click(remove);
		expect(actions).toEqual([]);
		expect(screen.queryByRole("alertdialog")).toBeNull();
	});
});

function openEntryMenu(name: string): HTMLElement {
	fireEvent.click(screen.getByRole("button", { name: `Options for ${name}` }));
	return screen.getByRole("group", { name: `Options for ${name}` });
}

describe("entries", () => {
	it("adds an entry with an optional seed", () => {
		const { actions } = renderAdmin(makeRaceBracket(), { pool: true });
		const name = screen.getByRole("textbox", { name: "Rider name" });
		fireEvent.change(name, { target: { value: " Fay " } });
		fireEvent.change(screen.getByRole("spinbutton", { name: "Seed" }), {
			target: { value: "3" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Add rider" }));
		expect(actions).toEqual([
			{
				type: "addEntry",
				entry: { riderId: "id-1", displayName: "Fay", seed: 3 },
			},
		]);
		expect((name as HTMLInputElement).value).toBe("");
		expect(screen.getByText("Fay")).toBeTruthy();

		fireEvent.change(name, { target: { value: "Gus" } });
		fireEvent.click(screen.getByRole("button", { name: "Add rider" }));
		expect(actions[1]).toEqual({
			type: "addEntry",
			entry: { riderId: "id-2", displayName: "Gus" },
		});
	});

	it("edits a seed in a controlled field and removes an entry", () => {
		const { actions } = renderAdmin(makeRaceBracket(), { pool: true });
		openEntryMenu("Eve");
		const seed = screen.getByRole<HTMLInputElement>("spinbutton", {
			name: "Seed of Eve",
		});
		fireEvent.change(seed, { target: { value: "2" } });
		fireEvent.keyDown(seed, { key: "Enter" });
		expect(actions[0]).toEqual({ type: "updateEntry", riderId: "r5", seed: 2 });
		expect(screen.getByRole("spinbutton", { name: "Seed of Eve" })).toBe(seed);
		expect(seed.value).toBe("2");

		fireEvent.click(screen.getByRole("button", { name: "Remove Eve" }));
		expect(actions[1]).toEqual({ type: "removeEntry", riderId: "r5" });
		expect(screen.queryByRole("button", { name: "Remove Eve" })).toBeNull();
	});

	it("keeps the seed and removal behind a menu that closes on Escape", () => {
		renderAdmin(makeRaceBracket(), { pool: true });
		expect(
			screen.queryByRole("spinbutton", { name: "Seed of Eve" }),
		).toBeNull();
		expect(screen.queryByRole("button", { name: "Remove Eve" })).toBeNull();
		const trigger = screen.getByRole("button", { name: "Options for Eve" });
		expect(trigger.getAttribute("aria-expanded")).toBe("false");
		const menu = openEntryMenu("Eve");
		expect(trigger.getAttribute("aria-expanded")).toBe("true");
		expect(trigger.getAttribute("aria-controls")).toBe(menu.id);
		fireEvent.keyDown(within(menu).getByRole("spinbutton"), { key: "Escape" });
		expect(screen.queryByRole("group", { name: "Options for Eve" })).toBeNull();
		expect(document.activeElement).toBe(trigger);
	});

	it("commits a pending seed and closes on a press elsewhere", () => {
		const { actions } = renderAdmin(makeRaceBracket(), { pool: true });
		openEntryMenu("Eve");
		fireEvent.change(screen.getByRole("spinbutton", { name: "Seed of Eve" }), {
			target: { value: "5" },
		});
		fireEvent.pointerDown(document.body);
		expect(actions).toEqual([{ type: "updateEntry", riderId: "r5", seed: 5 }]);
		expect(screen.queryByRole("group", { name: "Options for Eve" })).toBeNull();
	});

	it("stays open on a press elsewhere while the seed is invalid", () => {
		const { actions } = renderAdmin(makeRaceBracket(), { pool: true });
		openEntryMenu("Eve");
		fireEvent.change(screen.getByRole("spinbutton", { name: "Seed of Eve" }), {
			target: { value: "0" },
		});
		fireEvent.pointerDown(document.body);
		expect(screen.getByRole("alert")).toBeTruthy();
		expect(screen.getByRole("group", { name: "Options for Eve" })).toBeTruthy();
		expect(actions).toEqual([]);
	});

	it("refuses invalid seeds inline without dispatching", () => {
		const { actions } = renderAdmin(makeRaceBracket(), { pool: true });
		openEntryMenu("Eve");
		const seed = screen.getByRole("spinbutton", { name: "Seed of Eve" });
		for (const value of ["0", "1.5", "-2"]) {
			fireEvent.change(seed, { target: { value } });
			fireEvent.keyDown(seed, { key: "Enter" });
			expect(screen.getByRole("alert").textContent).toBe(
				"The seed must be a whole number, 1 or more.",
			);
			expect(seed.getAttribute("aria-invalid")).toBe("true");
		}
		fireEvent.change(seed, { target: { value: "4" } });
		expect(screen.queryByRole("alert")).toBeNull();
		expect(actions).toEqual([]);

		fireEvent.change(screen.getByRole("textbox", { name: "Rider name" }), {
			target: { value: "Fay" },
		});
		fireEvent.change(screen.getByRole("spinbutton", { name: "Seed" }), {
			target: { value: "0" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Add rider" }));
		expect(screen.getByRole("alert").textContent).toBe(
			"The seed must be a whole number, 1 or more.",
		);
		expect(actions).toEqual([]);
	});

	it("disables the seed field when the core refuses", () => {
		const { actions } = renderAdmin(makeRaceBracket({ status: "validated" }), {
			pool: true,
		});
		openEntryMenu("Eve");
		const seed = screen.getByRole<HTMLInputElement>("spinbutton", {
			name: "Seed of Eve",
		});
		expect(seed.disabled).toBe(true);
		expect(seed.title).toBe(
			"The bracket is validated and can no longer be changed.",
		);
		expect(actions).toEqual([]);
	});

	it("gives new entries the entry round of the pool, except for the first round", () => {
		const second = renderAdmin(makeRaceBracket(), {
			pool: true,
			poolRoundId: "round2",
		});
		fireEvent.change(screen.getByRole("textbox", { name: "Rider name" }), {
			target: { value: "Fay" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Add rider" }));
		expect(second.actions).toEqual([
			{
				type: "addEntry",
				entry: { riderId: "id-1", displayName: "Fay", entryRoundId: "round2" },
			},
		]);
	});

	it("shows nothing for entries without the permission", () => {
		renderAdmin(makeRaceBracket(), {
			pool: true,
			board: { permissions: { entries: false } },
		});
		expect(screen.queryByRole("button", { name: "Add rider" })).toBeNull();
		expect(
			screen.queryByRole("button", { name: "Options for Eve" }),
		).toBeNull();
	});
});

describe("confirmation of destructive changes", () => {
	function lowerAdvancing() {
		const view = renderAdmin(makeJudgedRace());
		const select = within(
			openRoundInspector(view.container, "round1"),
		).getByLabelText("Qualified");
		fireEvent.change(select, { target: { value: "1" } });
		return { ...view, select: select as HTMLSelectElement };
	}

	it("opens a dialog with the impact instead of applying", () => {
		const { actions, select } = lowerAdvancing();
		const dialog = screen.getByRole("alertdialog");
		expect(
			within(dialog).getByText("Change the number of qualified riders?"),
		).toBeTruthy();
		expect(
			within(dialog).getByText("This affects 2 judged heats."),
		).toBeTruthy();
		expect(within(dialog).getByText("Bob is no longer qualified")).toBeTruthy();
		expect(actions).toEqual([]);
		expect(select.value).toBe("2");
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("redispatches with confirm: true on Confirm", () => {
		const { actions, select } = lowerAdvancing();
		fireEvent.click(
			within(screen.getByRole("alertdialog")).getByRole("button", {
				name: "Confirm",
			}),
		);
		expect(actions).toEqual([
			{ type: "updateRound", roundId: "round1", advancing: 1, confirm: true },
		]);
		expect(select.value).toBe("1");
		expect(screen.queryByRole("alertdialog")).toBeNull();
	});

	it("changes nothing on Cancel or Escape", () => {
		const { actions, select } = lowerAdvancing();
		fireEvent.click(
			within(screen.getByRole("alertdialog")).getByRole("button", {
				name: "Cancel",
			}),
		);
		expect(screen.queryByRole("alertdialog")).toBeNull();

		fireEvent.change(select, { target: { value: "1" } });
		fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
		expect(screen.queryByRole("alertdialog")).toBeNull();
		expect(actions).toEqual([]);
		expect(select.value).toBe("2");
	});

	it("confirms a reset of a running bracket", () => {
		const { container, actions } = renderAdmin(makeJudgedRace());
		openBracketInspector(container);
		fireEvent.click(
			button(container.querySelector<HTMLElement>(".hb-toolbar")!, "Reset"),
		);
		const dialog = screen.getByRole("alertdialog");
		expect(within(dialog).getByText("Reset the bracket?")).toBeTruthy();
		expect(
			within(dialog).getByText("This affects 2 judged heats."),
		).toBeTruthy();
		expect(
			within(dialog).getByText("4 ranks will be cleared and 0 rounds emptied."),
		).toBeTruthy();
		expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
		fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
		expect(actions).toEqual([{ type: "reset", confirm: true }]);
		expect(screen.queryByRole("alertdialog")).toBeNull();
		expect(heatSection(container, "h1").dataset.status).toBe("pending");
	});

	it("confirms a reset while preparing and empties the later rounds", () => {
		const bracket = makeRaceBracket();
		bracket.rounds[1]!.heats[0] = {
			...bracket.rounds[1]!.heats[0]!,
			slots: [{ riderId: "r1", rank: null }],
		};
		const { container, actions } = renderAdmin(bracket);
		openBracketInspector(container);
		fireEvent.click(
			button(container.querySelector<HTMLElement>(".hb-toolbar")!, "Reset"),
		);
		const dialog = screen.getByRole("alertdialog");
		expect(within(dialog).getByText("Are you sure?")).toBeTruthy();
		expect(
			within(dialog).getByText("0 ranks will be cleared and 1 round emptied."),
		).toBeTruthy();
		expect(actions).toEqual([]);
		expect(
			heatSection(container, "h3").querySelectorAll("[data-rider-id]"),
		).toHaveLength(1);
		confirmDialog("Confirm");
		expect(actions).toEqual([{ type: "reset", confirm: true }]);
		expect(
			heatSection(container, "h3").querySelectorAll("[data-rider-id]"),
		).toHaveLength(0);
	});

	it("translates the dialog", () => {
		const { container } = renderAdmin(makeJudgedRace(), { locale: "fr" });
		openBracketInspector(container);
		fireEvent.click(
			button(
				container.querySelector<HTMLElement>(".hb-toolbar")!,
				"Réinitialiser",
			),
		);
		const dialog = screen.getByRole("alertdialog");
		expect(within(dialog).getByText("Réinitialiser le tableau ?")).toBeTruthy();
		expect(
			within(dialog).getByText("Cela concerne 2 heats jugés."),
		).toBeTruthy();
		expect(
			within(dialog).getByRole("button", { name: "Annuler" }),
		).toBeTruthy();
	});

	it("uses a native modal dialog when available", () => {
		const showModal = vi.fn();
		const close = vi.fn();
		const proto = window.HTMLDialogElement.prototype;
		const saved = (["showModal", "close"] as const).map(
			(name) => [name, Object.getOwnPropertyDescriptor(proto, name)] as const,
		);
		Object.defineProperty(proto, "showModal", {
			configurable: true,
			value: showModal,
		});
		Object.defineProperty(proto, "close", { configurable: true, value: close });
		try {
			const { actions, container } = renderAdmin(makeJudgedRace());
			openBracketInspector(container);
			fireEvent.click(
				button(container.querySelector<HTMLElement>(".hb-toolbar")!, "Reset"),
			);
			const dialog = container.querySelector("dialog")!;
			expect(showModal).toHaveBeenCalledTimes(1);
			const cancel = new Event("cancel", { cancelable: true });
			fireEvent(dialog, cancel);
			expect(cancel.defaultPrevented).toBe(true);
			expect(container.querySelector("dialog")).toBeNull();
			expect(close).toHaveBeenCalled();
			expect(actions).toEqual([]);
		} finally {
			for (const [name, descriptor] of saved) {
				if (descriptor) Object.defineProperty(proto, name, descriptor);
				else Reflect.deleteProperty(proto, name);
			}
		}
	});
});
