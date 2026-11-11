import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	defaultPlan,
	editorFromPlan,
	exportFormat,
	formatFromPlan,
	type Action,
	type Bracket,
	type FormatPlan,
	type FormatSettings,
} from "@heatboard/core";
import {
	expectRefused,
	makeRaceBracket,
	openBracketInspector,
	renderAdmin,
} from "./admin-helpers";

afterEach(cleanup);

function entries(count: number) {
	return Array.from({ length: count }, (_, i) => ({
		riderId: `p${i + 1}`,
		displayName: `Rider ${i + 1}`,
	}));
}

/** A bracket without heats yet, so applying a format needs no confirmation. */
function emptyBracket(riders = 16, overrides: Partial<Bracket> = {}): Bracket {
	return makeRaceBracket({
		entries: entries(riders),
		rounds: [],
		links: [],
		...overrides,
	});
}

function open(bracket: Bracket = emptyBracket(), board = {}) {
	const view = renderAdmin(bracket, { board });
	return { ...view, panel: openBracketInspector(view.container) };
}

const press = (panel: HTMLElement, name: string | RegExp) =>
	fireEvent.click(within(panel).getByRole("button", { name }));

const APPLY = "Apply to the rounds";

const plan16 = () =>
	defaultPlan({ riders: 16, heats: 4, advance: 2, repechage: false });

function withFormat(
	plan: FormatPlan,
	overrides: Partial<Bracket> = {},
	riders = plan.riders,
): Bracket {
	return emptyBracket(riders, {
		format: {
			settings: formatFromPlan(plan),
			drawSeed: 3,
			editor: editorFromPlan(plan),
		},
		...overrides,
	});
}

function applied(actions: Action[]) {
	return actions.at(-1) as Extract<Action, { type: "applyFormat" }>;
}

function confirmDialog(name: string) {
	fireEvent.click(
		within(screen.getByRole("alertdialog")).getByRole("button", { name }),
	);
}

const ODD_FORMAT: FormatSettings = {
	heatboardFormat: 1,
	name: "Odd",
	fill: "serpentine",
	rounds: [
		{
			key: "a",
			name: "Qualifier",
			heats: 1,
			outcomes: [{ ranks: [1, 3], to: "b" }],
		},
		{ key: "b", name: "Semi", heats: 2 },
	],
};

describe("rendering", () => {
	it("starts from a plan for the entries when no format is set", () => {
		const { panel } = open(emptyBracket(24, { format: undefined }));
		expect(within(panel).getByLabelText<HTMLInputElement>("Riders").value).toBe(
			"24",
		);
		expect(
			within(panel).getByRole("group", { name: "Format preview" }),
		).toBeTruthy();
		expect(
			within(panel).getByRole("rowheader", { name: /^Final/ }),
		).toBeTruthy();
		expect(
			within(panel).getByRole("button", { name: "More options" }),
		).toBeTruthy();
		expect(
			within(panel)
				.getByRole("button", { name: APPLY })
				.getAttribute("aria-disabled"),
		).not.toBe("true");
	});

	it("is hidden without the format permission", () => {
		const { panel } = open(emptyBracket(), { permissions: { format: false } });
		expect(within(panel).queryByLabelText("Riders")).toBeNull();
	});

	it("opens an applied format as rows, with its auto and modified rounds", () => {
		const plan = {
			...plan16(),
			rounds: plan16().rounds.map((r, i) =>
				i === 1 ? { ...r, auto: false } : r,
			),
		};
		const { panel } = open(withFormat(plan));
		expect(within(panel).getByLabelText<HTMLInputElement>("Riders").value).toBe(
			"16",
		);
		expect(within(panel).getAllByText("modified")).toHaveLength(1);
		expect(within(panel).getAllByText("auto")).toHaveLength(1);
		expectRefused(within(panel).getByRole("button", { name: APPLY }));
	});

	it("opens a format saved without editor state with every round modified", () => {
		const plan = plan16();
		const { panel } = open(
			emptyBracket(16, {
				format: { settings: formatFromPlan(plan), drawSeed: 3 },
			}),
		);
		expect(within(panel).getAllByText("modified")).toHaveLength(2);
		expect(within(panel).queryByText("auto")).toBeNull();
	});

	it("speaks French with the round names", () => {
		const view = renderAdmin(withFormat(plan16()), { locale: "fr" });
		const panel = openBracketInspector(view.container);
		expect(
			within(panel).getByRole("rowheader", { name: /^Quarts/ }),
		).toBeTruthy();
		expect(
			within(panel).getByRole("group", { name: "Aperçu du format" }),
		).toBeTruthy();
		expect(
			within(panel).getByRole("button", { name: "Appliquer aux tours" }),
		).toBeTruthy();
	});
});

describe("read-only format", () => {
	function openOdd() {
		return open(
			emptyBracket(5, { format: { settings: ODD_FORMAT, drawSeed: 3 } }),
		);
	}

	it("shows the whole format with a notice and no editing control", () => {
		const { panel } = openOdd();
		expect(
			within(panel).getByText(/cannot be written as one row per round/),
		).toBeTruthy();
		expect(within(panel).queryByLabelText("Riders")).toBeNull();
		expect(within(panel).queryByRole("table")).toBeNull();
		const shape = within(panel).getByRole("group", { name: "Format preview" });
		expect(within(shape).getByText("Qualifier")).toBeTruthy();
		expect(within(shape).getByText("Semi")).toBeTruthy();
		expectRefused(within(panel).getByRole("button", { name: APPLY }));
	});

	it("still exports the format as JSON and hands it to onExportFormat", () => {
		const onExport = vi.fn();
		const view = renderAdmin(
			emptyBracket(5, { format: { settings: ODD_FORMAT, drawSeed: 3 } }),
			{ board: { onExportFormat: onExport } },
		);
		const panel = openBracketInspector(view.container);
		press(panel, "Export JSON");
		expect(onExport).toHaveBeenCalledWith(exportFormat(ODD_FORMAT));
		expect(
			within(panel).getByLabelText<HTMLTextAreaElement>("Round settings JSON")
				.value,
		).toBe(exportFormat(ODD_FORMAT));
	});

	it("shows a JSON import that does not fit the rows the same way, and applies it without editor state", () => {
		const { panel, actions } = open(emptyBracket(5));
		press(panel, "More options");
		press(panel, "Import JSON");
		fireEvent.change(within(panel).getByLabelText("Round settings JSON"), {
			target: { value: exportFormat(ODD_FORMAT) },
		});
		press(panel, "Load this JSON");
		expect(
			within(panel).getByText(/cannot be written as one row per round/),
		).toBeTruthy();
		press(panel, APPLY);
		const action = applied(actions);
		expect(action.format.rounds.map((r) => r.key)).toEqual(["a", "b"]);
		expect(action.editor).toBeUndefined();
	});

	it("brings a JSON written as rows back into the editor", () => {
		const { panel } = openOdd();
		press(panel, "Import JSON");
		fireEvent.change(within(panel).getByLabelText("Round settings JSON"), {
			target: { value: exportFormat(formatFromPlan(plan16())) },
		});
		press(panel, "Load this JSON");
		expect(within(panel).getByRole("table")).toBeTruthy();
		expect(within(panel).getAllByText("modified")).toHaveLength(2);
	});
});

describe("editing and preview", () => {
	it("recalculates the rows and the preview when round 1 changes", () => {
		const { panel } = open(withFormat(plan16()));
		fireEvent.change(within(panel).getByLabelText("Riders"), {
			target: { value: "64" },
		});
		const shape = within(panel).getByRole("group", { name: "Format preview" });
		expect(within(shape).getByText("Round 1")).toBeTruthy();
		expect(shape.textContent).toContain("64 riders");
	});

	it("focuses the row of a round when its preview column is clicked", () => {
		const { panel } = open(withFormat(plan16()));
		const shape = within(panel).getByRole("group", { name: "Format preview" });
		fireEvent.click(
			within(shape).getByRole("button", { name: /^Semi-finals$/ }),
		);
		expect(document.activeElement).toBe(
			within(panel).getByRole("button", { name: "Semi-finals · Heats: less" }),
		);
	});

	it("goes back to the applied format when the changes are discarded", () => {
		const { panel } = open(withFormat(plan16()));
		const discard = within(panel).getByRole("button", {
			name: "Discard round changes",
		});
		expect(discard.hasAttribute("disabled")).toBe(true);
		press(panel, "Heats in round 1: more");
		expect(discard.hasAttribute("disabled")).toBe(false);
		fireEvent.click(discard);
		expect(
			within(panel).getByRole("rowheader", { name: /^Quarter-finals/ }),
		).toBeTruthy();
		expect(discard.hasAttribute("disabled")).toBe(true);
	});

	it("explains the placement in the more options", () => {
		const { panel } = open(withFormat(plan16()));
		press(panel, "More options");
		press(panel, "Show the detail");
		const zoom = within(panel).getByRole("group", {
			name: "Placement · Quarter-finals → Semi-finals",
		});
		expect(zoom.textContent).toContain(
			"Semi-finals, Heat 1: the top 2 of Quarter-finals heats 1 and 2.",
		);
	});
});

describe("apply", () => {
	it("dispatches applyFormat with the format, the seed and the editor state", () => {
		const { panel, actions } = open(emptyBracket(16), {
			createDrawSeed: () => 42,
		});
		press(panel, "Semi-finals · Qualifiers / heat: more");
		press(panel, APPLY);
		expect(actions).toHaveLength(1);
		const action = applied(actions);
		expect(action.drawSeed).toBe(42);
		expect(action.format.rounds[0]).toMatchObject({ key: "r1", heats: 4 });
		expect(action.editor?.riders).toBe(16);
		expect(action.editor?.rounds.some((r) => !r.auto)).toBe(true);
		expect(action.editor?.rounds).toHaveLength(action.format.rounds.length);
	});

	it("sends the plan options: fill, small final and repechage", () => {
		const { panel, actions } = open(emptyBracket(16), {
			createDrawSeed: () => 1,
		});
		fireEvent.click(within(panel).getByLabelText("Small final"));
		fireEvent.click(within(panel).getByLabelText("Repechage after round 1"));
		press(panel, "More options");
		fireEvent.change(within(panel).getByLabelText("Placement in round 1"), {
			target: { value: "draw" },
		});
		press(panel, APPLY);
		const { format, editor } = applied(actions);
		expect(format.fill).toBe("draw");
		expect(format.rounds.map((r) => r.key)).toContain("small-final");
		expect(format.rounds.map((r) => r.key)).toContain("rep-r1");
		expect(editor?.rounds[0]).toEqual({ auto: false, repechageAuto: true });
	});

	it("asks for confirmation before replacing rounds that hold riders, and dispatches nothing on cancel", () => {
		const { panel, actions } = open(makeRaceBracket({ format: undefined }));
		press(panel, APPLY);
		const dialog = screen.getByRole("alertdialog");
		expect(
			within(dialog).getByText(
				"Applying replaces the rounds and redraws round 1. Riders placed by hand will be moved. Continue?",
			),
		).toBeTruthy();
		expect(actions).toEqual([]);
		confirmDialog("Cancel");
		expect(actions).toEqual([]);
		press(panel, APPLY);
		confirmDialog("Confirm");
		expect(actions).toHaveLength(1);
		expect(actions[0]?.type).toBe("applyFormat");
	});

	it("applies without confirmation when no rider is placed yet", () => {
		const { panel, actions } = open();
		press(panel, APPLY);
		expect(screen.queryByRole("alertdialog")).toBeNull();
		expect(actions).toHaveLength(1);
	});

	it("is refused with its reason once a heat has started", () => {
		const bracket = makeRaceBracket({ status: "running", format: undefined });
		bracket.rounds[0]!.heats[0] = {
			...bracket.rounds[0]!.heats[0]!,
			status: "running",
		};
		const { panel, actions } = open(bracket);
		const button = within(panel).getByRole("button", { name: APPLY });
		expectRefused(button);
		expect(button.title).toBe(
			"A heat has started: the rounds can no longer be changed.",
		);
		fireEvent.click(button);
		expect(actions).toEqual([]);
	});

	it("is refused while a plan does not lead to a final or leaves a heat empty", () => {
		const { panel } = open(emptyBracket(20));
		fireEvent.change(within(panel).getByLabelText("Riders"), {
			target: { value: "2" },
		});
		const button = within(panel).getByRole("button", { name: APPLY });
		expectRefused(button);
		expect(button.title).toContain("a heat has no rider");
		expect(within(panel).getByRole("alert").textContent).toContain(
			"a heat has no rider",
		);
	});

	it("can be applied again after a change of riders", () => {
		const { panel, actions } = open(withFormat(plan16(), {}, 20));
		expect(within(panel).getByLabelText<HTMLInputElement>("Riders").value).toBe(
			"20",
		);
		press(panel, APPLY);
		expect(applied(actions).editor?.riders).toBe(20);
	});

	it("is refused when nothing changed", () => {
		const { panel } = open(withFormat(plan16()));
		const button = within(panel).getByRole("button", { name: APPLY });
		expectRefused(button);
		expect(button.title).toBe("No change to apply.");
	});
});
