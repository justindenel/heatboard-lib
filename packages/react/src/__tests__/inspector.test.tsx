import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InspectorProps } from "../index";
import { makeController } from "./helpers";
import { Board, BracketProvider } from "../index";
import {
	heatSection,
	inspector,
	makeRaceBracket,
	openBracketInspector,
	openHeatInspector,
	openRoundInspector,
	renderAdmin,
	roundSection,
	statusItem,
	statusTrigger,
} from "./admin-helpers";

afterEach(cleanup);

function names(root: HTMLElement, role: "button" | "combobox" | "textbox") {
	return within(root)
		.queryAllByRole(role)
		.map((el) => el.getAttribute("aria-label") ?? el.textContent);
}

describe("opening and closing", () => {
	it("opens on the target of the clicked trigger and names it", () => {
		const { container } = renderAdmin(makeRaceBracket());
		expect(screen.queryByRole("dialog")).toBeNull();

		const trigger = within(heatSection(container, "h1")).getByRole("button", {
			name: "Open the panel of Heat 1",
		});
		expect(trigger.getAttribute("aria-expanded")).toBe("false");
		fireEvent.click(trigger);
		const panel = inspector();
		expect(panel.dataset.target).toBe("heat");
		expect(within(panel).getByRole("heading", { name: "Heat 1" })).toBeTruthy();
		expect(trigger.getAttribute("aria-expanded")).toBe("true");
		expect(heatSection(container, "h1").dataset.selected).toBe("true");

		openRoundInspector(container, "round2");
		expect(screen.getAllByRole("dialog")).toHaveLength(1);
		expect(inspector().dataset.target).toBe("round");
		expect(
			within(inspector()).getByRole("heading", { name: "Round 2" }),
		).toBeTruthy();
		expect(heatSection(container, "h1").dataset.selected).toBeUndefined();
		expect(roundSection(container, "round2").dataset.selected).toBe("true");

		openBracketInspector(container);
		expect(inspector().dataset.target).toBe("bracket");
		expect(
			within(inspector()).getByRole("heading", { name: "Race Open" }),
		).toBeTruthy();
	});

	it("closes on Escape and gives the focus back to the trigger", () => {
		const { container } = renderAdmin(makeRaceBracket());
		const trigger = within(heatSection(container, "h1")).getByRole("button", {
			name: "Open the panel of Heat 1",
		});
		trigger.focus();
		fireEvent.click(trigger);
		fireEvent.keyDown(inspector(), { key: "Escape" });
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(document.activeElement).toBe(trigger);
		expect(trigger.getAttribute("aria-expanded")).toBe("false");
	});

	it("closes with its button and gives the focus back to the trigger", () => {
		const { container } = renderAdmin(makeRaceBracket());
		const trigger = within(
			roundSection(container, "round1").querySelector<HTMLElement>(
				".hb-round__header",
			)!,
		).getByRole("button", { name: "Options for Round 1" });
		fireEvent.click(trigger);
		const close = within(inspector()).getByRole("button", { name: "Close" });
		expect(close.title).toBe("Close");
		fireEvent.click(close);
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(document.activeElement).toBe(trigger);
	});

	it("moves the focus into the panel on open and when the target changes", () => {
		const { container } = renderAdmin(makeRaceBracket());
		const first = openHeatInspector(container, "h1");
		expect(document.activeElement).toBe(first);
		(document.activeElement as HTMLElement).blur();
		const second = openHeatInspector(container, "h2");
		expect(document.activeElement).toBe(second);
		expect(
			within(second).getByRole("heading", { name: "Heat 2" }),
		).toBeTruthy();
	});

	it("is not closed by an Escape that only cancels a confirmation", () => {
		const { container } = renderAdmin(makeRaceBracket());
		const panel = openHeatInspector(container, "h1");
		fireEvent.click(
			within(panel).getByRole("button", { name: "Remove Heat 1" }),
		);
		fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
		expect(screen.queryByRole("alertdialog")).toBeNull();
		expect(inspector()).toBe(panel);
	});

	it("can be replaced through components", () => {
		const seen: InspectorProps[] = [];
		const { container } = renderAdmin(makeRaceBracket(), {
			board: {
				components: {
					Inspector: (props) => {
						seen.push(props);
						return (
							<aside data-testid="custom">
								<button type="button" onClick={props.onClose}>
									bye
								</button>
							</aside>
						);
					},
				},
			},
		});
		fireEvent.click(
			within(
				container.querySelector<HTMLElement>(".hb-board__header")!,
			).getByRole("button", { name: "Options for Race Open" }),
		);
		expect(seen.at(-1)?.target).toEqual({ type: "bracket" });
		fireEvent.click(screen.getByRole("button", { name: "bye" }));
		expect(screen.queryByTestId("custom")).toBeNull();
	});
});

describe("content by target", () => {
	it("shows the actions of a heat", () => {
		const { container } = renderAdmin(makeRaceBracket());
		const panel = openHeatInspector(container, "h1");
		expect(names(panel, "textbox")).toEqual(["Name"]);
		expect(names(panel, "combobox")).toEqual([]);
		const buttons = names(panel, "button");
		for (const expected of [
			"Close",
			"Start",
			"Rank by order",
			"Clear ranks",
			"Remove Heat 1",
		]) {
			expect(buttons).toContain(expected);
		}
		expect(buttons).not.toContain("Add heat");
		expect(buttons).not.toContain("Publish");
		expect(
			within(panel).getAllByRole("button", { name: /^Status of/ }),
		).toHaveLength(3);
	});

	it("shows the rank of each rider in the heat inspector and drops it on Clear ranks", () => {
		const base = makeRaceBracket({ status: "running" });
		const [h1, h2] = base.rounds[0]!.heats;
		const { container } = renderAdmin({
			...base,
			rounds: [
				{
					...base.rounds[0]!,
					heats: [
						{
							...h1!,
							status: "running",
							slots: [
								{ riderId: "r1", rank: 2 },
								{ riderId: "r2", rank: 1 },
								{ riderId: "r3", rank: 3 },
							],
						},
						h2!,
					],
				},
				base.rounds[1]!,
			],
		});
		const panel = openHeatInspector(container, "h1");
		const riderRows = () =>
			Array.from(panel.querySelectorAll<HTMLElement>(".hb-inspector__rider"));
		const rankOf = (row: HTMLElement) =>
			row.querySelector(".hb-inspector__rider-rank")?.textContent;

		expect(riderRows().map((row) => row.textContent)).toEqual([
			expect.stringContaining("Bob"),
			expect.stringContaining("Ann"),
			expect.stringContaining("Cy"),
		]);
		expect(riderRows().map((row) => rankOf(row))).toEqual([
			expect.stringContaining("1"),
			expect.stringContaining("2"),
			expect.stringContaining("3"),
		]);
		const first = riderRows()[0]!.querySelector(".hb-result");
		expect(first?.className).toContain("hb-result--qualified");
		expect(riderRows()[2]!.querySelector(".hb-result--qualified")).toBeNull();

		fireEvent.click(within(panel).getByRole("button", { name: "Clear ranks" }));
		expect(
			panel.querySelectorAll(".hb-inspector__rider .hb-result"),
		).toHaveLength(0);
		expect(riderRows().map((row) => rankOf(row))).toEqual(["", "", ""]);
		expect(
			heatSection(container, "h1").querySelectorAll(".hb-result"),
		).toHaveLength(0);
	});

	it("shows the settings of a round", () => {
		const { container } = renderAdmin(makeRaceBracket());
		const panel = openRoundInspector(container, "round1");
		expect(names(panel, "textbox")).toEqual(["Name"]);
		expect(names(panel, "combobox")).toEqual(["Riders per heat", "Qualified"]);
		const buttons = names(panel, "button");
		for (const expected of ["Add heat", "Remove Round 1"]) {
			expect(buttons).toContain(expected);
		}
		expect(buttons).not.toContain("Start");
		expect(
			within(panel).queryAllByRole("button", { name: /^Status of/ }),
		).toHaveLength(0);
	});

	it("shows the controls of the bracket", () => {
		const { container } = renderAdmin(makeRaceBracket());
		const panel = openBracketInspector(container);
		expect(names(panel, "textbox")).toEqual(["Name"]);
		// Manual ranking: only the method of the scoring editor.
		expect(within(panel).getAllByRole("combobox")).toHaveLength(1);
		expect(within(panel).getByLabelText("Method")).toBeTruthy();
		const buttons = names(panel, "button");
		for (const expected of ["Back to draft", "Make public", "Reset"]) {
			expect(buttons).toContain(expected);
		}
		expect(buttons).not.toContain("Add heat");
		expect(buttons).not.toContain("Start");
	});

	it("sets DNF, DSQ and DNS on a rider from the heat inspector", () => {
		const { container, actions } = renderAdmin(makeRaceBracket());
		const panel = openHeatInspector(container, "h1");
		for (const [riderName, riderId, status] of [
			["Ann", "r1", "DNF"],
			["Bob", "r2", "DSQ"],
			["Cy", "r3", "DNS"],
		] as const) {
			fireEvent.click(statusTrigger(panel, riderName));
			fireEvent.click(statusItem(new RegExp(`^${status} `)));
			expect(actions.at(-1)).toEqual({
				type: "setStatus",
				heatId: "h1",
				riderId,
				status,
			});
			expect(
				heatSection(container, "h1").querySelector(
					`[data-rider-id="${riderId}"] .hb-result--${status.toLowerCase()}`,
				),
			).toBeTruthy();
		}
	});
});

describe("controlled selection", () => {
	it("shows the given target and reports the requested changes without applying them", () => {
		const onSelectionChange = vi.fn();
		const { container } = renderAdmin(makeRaceBracket(), {
			board: {
				selection: { type: "round", roundId: "round1" },
				onSelectionChange,
			},
		});
		expect(inspector().dataset.target).toBe("round");

		fireEvent.keyDown(inspector(), { key: "Escape" });
		expect(onSelectionChange).toHaveBeenLastCalledWith(null);
		expect(inspector().dataset.target).toBe("round");

		fireEvent.click(
			within(heatSection(container, "h2")).getByRole("button", {
				name: "Open the panel of Heat 2",
			}),
		);
		expect(onSelectionChange).toHaveBeenLastCalledWith({
			type: "heat",
			heatId: "h2",
		});
		expect(inspector().dataset.target).toBe("round");
	});

	it("shows nothing for a null selection", () => {
		renderAdmin(makeRaceBracket(), { board: { selection: null } });
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("asks to clear a selection whose target no longer exists", () => {
		const onSelectionChange = vi.fn();
		renderAdmin(makeRaceBracket(), {
			board: {
				selection: { type: "heat", heatId: "gone" },
				onSelectionChange,
			},
		});
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(onSelectionChange).toHaveBeenCalledWith(null);
	});
});

describe("styling", () => {
	it("applies classNames and styles to the new parts", () => {
		const { container } = renderAdmin(makeRaceBracket(), {
			board: {
				classNames: { heatTitleButton: "mine-title", inspector: "mine-panel" },
				styles: { inspector: { color: "red" } },
			},
		});
		const trigger = within(heatSection(container, "h1")).getByRole("button", {
			name: "Open the panel of Heat 1",
		});
		expect(trigger.className).toBe("hb-heat__title-button mine-title");
		fireEvent.click(trigger);
		expect(inspector().className).toBe("hb-inspector mine-panel");
		expect(inspector().style.color).toBe("red");
	});

	it("drops the built-in classes when unstyled", () => {
		const { container } = renderAdmin(makeRaceBracket(), {
			board: { unstyled: true, classNames: { inspector: "mine-panel" } },
		});
		openHeatInspector(container, "h1");
		expect(inspector().className).toBe("mine-panel");
		expect(container.querySelectorAll('[class*="hb-"]')).toHaveLength(0);
	});
});

describe("heat header", () => {
	const titleButton = (container: HTMLElement, heatId: string) =>
		within(heatSection(container, heatId)).getByRole("button", {
			name: /^Open the panel of /,
		});
	const header = (container: HTMLElement, heatId: string) =>
		heatSection(container, heatId).querySelector<HTMLElement>("header")!;

	it("toggles the inspector from the title button", () => {
		const { container } = renderAdmin(makeRaceBracket());
		const title = titleButton(container, "h1");
		expect(title.getAttribute("aria-expanded")).toBe("false");
		expect(title.hasAttribute("aria-controls")).toBe(false);
		fireEvent.click(title);
		expect(title.getAttribute("aria-expanded")).toBe("true");
		expect(title.getAttribute("aria-controls")).toBe(inspector().id);
		expect(inspector().id).not.toBe("");
		fireEvent.click(title);
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(title.getAttribute("aria-expanded")).toBe("false");
	});

	it("opens from any part of the header but not from the Start button", () => {
		const { container } = renderAdmin(makeRaceBracket());
		fireEvent.click(header(container, "h1"));
		expect(inspector().dataset.target).toBe("heat");
		fireEvent.click(header(container, "h1"));
		expect(screen.queryByRole("dialog")).toBeNull();

		fireEvent.click(
			within(header(container, "h2")).getByRole("button", {
				name: "Start heat 2",
			}),
		);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("renders the title as a native button, so Enter and Space open it", () => {
		const { container } = renderAdmin(makeRaceBracket());
		const title = titleButton(container, "h1");
		expect(title.tagName).toBe("BUTTON");
		expect(title.getAttribute("type")).toBe("button");
	});

	it("gives the focus back to the title button on close", () => {
		const { container } = renderAdmin(makeRaceBracket());
		fireEvent.click(header(container, "h1"));
		fireEvent.keyDown(inspector(), { key: "Escape" });
		expect(document.activeElement).toBe(titleButton(container, "h1"));
	});

	it("shows Start on pending heats only", () => {
		const { container } = renderAdmin(makeRaceBracket({ status: "running" }));
		const start = (id: string) =>
			within(header(container, id)).queryAllByRole("button", {
				name: `Start heat ${id.slice(1)}`,
			});
		expect(start("h1")).toHaveLength(1);
		fireEvent.click(start("h1")[0]!);
		expect(start("h1")).toHaveLength(0);
		expect(start("h2")).toHaveLength(1);
	});

	it("renders a plain title without button or pointer in viewer mode", () => {
		const { container } = render(
			<BracketProvider value={makeController(makeRaceBracket())}>
				<Board />
			</BracketProvider>,
		);
		const head = container.querySelector<HTMLElement>(
			'[data-heat-id="h1"] header',
		)!;
		expect(within(head).queryAllByRole("button")).toHaveLength(0);
		expect(head.dataset.interactive).toBeUndefined();
		fireEvent.click(head);
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});
