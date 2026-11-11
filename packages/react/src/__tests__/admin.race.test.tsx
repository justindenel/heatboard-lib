import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
	Board,
	BracketProvider,
	EntryPool,
	type BracketController,
	type HeatActionsProps,
	type HeatControlsProps,
} from "../index";
import { makeController } from "./helpers";
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
	statusItem,
	statusTrigger,
} from "./admin-helpers";

afterEach(cleanup);

function button(root: HTMLElement, name: string): HTMLButtonElement {
	return within(root).getByRole("button", { name });
}

describe("viewer mode", () => {
	it("renders no action control", () => {
		const controller: BracketController = makeController(makeRaceBracket());
		render(
			<BracketProvider value={controller}>
				<EntryPool roundId="round1" />
				<Board />
			</BracketProvider>,
		);
		expect(
			screen.getAllByRole("button").map((b) => b.getAttribute("aria-label")),
		).toEqual(["Show or hide unplaced riders"]);
		expect(screen.queryAllByRole("combobox")).toHaveLength(0);
		expect(screen.queryAllByRole("textbox")).toHaveLength(0);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("ignores a selection since it never shows the inspector", () => {
		render(
			<BracketProvider value={makeController(makeRaceBracket())}>
				<Board selection={{ type: "bracket" }} />
			</BracketProvider>,
		);
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});

describe("HeatActions", () => {
	it("starts a pending heat and moves the bracket to running", () => {
		const { container, actions } = renderAdmin(makeRaceBracket());
		fireEvent.click(button(heatSection(container, "h1"), "Start heat 1"));
		expect(actions).toEqual([
			{ type: "setHeatStatus", heatId: "h1", status: "running" },
		]);
		expect(heatSection(container, "h1").dataset.status).toBe("running");
		expect(
			screen.getByText("Running", { selector: ".hb-board__status" }),
		).toBeTruthy();
		expect(
			within(heatSection(container, "h1")).queryByRole("button", {
				name: "Start heat 1",
			}),
		).toBeNull();
	});

	it("shows no action on the card but Start, whatever the status", () => {
		const { container } = renderAdmin(makeJudgedRace());
		const heat = heatSection(container, "h1");
		const names = () =>
			within(heat.querySelector<HTMLElement>("header")!)
				.getAllByRole("button")
				.map((b) => b.getAttribute("aria-label"));
		expect(names()).toEqual(["Open the panel of Heat 1"]);
		const panel = openHeatInspector(container, "h1");
		fireEvent.click(button(panel, "Lock"));
		expect(names()).toEqual(["Open the panel of Heat 1"]);
		expect(
			heatSection(container, "h2").querySelector(".hb-actions"),
		).toBeNull();
	});

	it("starts only a pending heat from the card", () => {
		const { container } = renderAdmin(makeRaceBracket());
		const buttons = (id: string) =>
			within(heatSection(container, id).querySelector<HTMLElement>("header")!)
				.getAllByRole("button")
				.map((b) => b.getAttribute("aria-label"));
		expect(buttons("h1")).toEqual(["Open the panel of Heat 1", "Start heat 1"]);
		fireEvent.click(button(heatSection(container, "h1"), "Start heat 1"));
		expect(buttons("h1")).toEqual(["Open the panel of Heat 1"]);
	});

	it("judges, locks and reopens from the inspector", () => {
		const { container, actions } = renderAdmin(makeJudgedRace());
		const heat = heatSection(container, "h1");
		const panel = openHeatInspector(container, "h1");
		fireEvent.click(button(panel, "Lock"));
		expect(heat.dataset.status).toBe("locked");
		fireEvent.click(button(panel, "Reopen"));
		expect(heat.dataset.status).toBe("judged");
		fireEvent.click(button(panel, "Reopen"));
		expect(heat.dataset.status).toBe("running");
		fireEvent.click(button(panel, "Judge"));
		expect(heat.dataset.status).toBe("judged");
		expect(actions.every((a) => a.type === "setHeatStatus")).toBe(true);
	});

	it("greys a button with the translated reason when the core refuses", () => {
		const draft = renderAdmin(makeRaceBracket({ status: "draft" }));
		const start = button(heatSection(draft.container, "h1"), "Start heat 1");
		expectRefused(start);
		expect(start.title).toBe(
			"Mark the bracket as ready before starting a heat.",
		);
		cleanup();

		const running = makeRaceBracket({ status: "running" });
		running.rounds[0]!.heats[0] = {
			...running.rounds[0]!.heats[0]!,
			status: "running",
		};
		const view = renderAdmin(running);
		const panel = openHeatInspector(view.container, "h1");
		const judge = button(panel, "Judge");
		expectRefused(judge);
		expect(judge.title).toBe("Every rider needs a rank or a status first.");
		fireEvent.click(judge);
		expect(view.actions).toEqual([]);
	});

	it("gives every icon button a translated label and a tooltip", () => {
		const { container } = renderAdmin(makeRaceBracket({ status: "running" }), {
			locale: "fr",
		});
		const heat = heatSection(container, "h1");
		expect(button(heat, "Démarrer le heat 1").title).toBe("Démarrer le heat 1");
		expect(button(heat, "Ouvrir le panneau de Heat 1")).toBeTruthy();
		const round = roundSection(container, "round1");
		expect(button(round, "Options de Round 1").title).toBe(
			"Options de Round 1",
		);
		expect(screen.getByRole("button", { name: "Ajouter un tour" }).title).toBe(
			"Ajouter un tour",
		);
		for (const svg of container.querySelectorAll("svg")) {
			expect(svg.getAttribute("aria-hidden")).toBe("true");
		}
	});

	it("ranks by position and clears the ranks from the inspector", () => {
		const bracket = makeRaceBracket({ status: "running" });
		bracket.rounds[0]!.heats[0] = {
			...bracket.rounds[0]!.heats[0]!,
			status: "running",
		};
		const { container, actions } = renderAdmin(bracket);
		const heat = heatSection(container, "h1");
		const panel = openHeatInspector(container, "h1");
		fireEvent.click(button(panel, "Rank by order"));
		expect(actions).toEqual([{ type: "rankByPosition", heatId: "h1" }]);
		expect(
			Array.from(
				heat.querySelectorAll(".hb-result--rank .hb-visually-hidden"),
				(n) => n.textContent,
			),
		).toEqual(["1st", "2nd", "3rd"]);
		fireEvent.click(button(panel, "Clear ranks"));
		expect(actions[1]).toEqual({ type: "clearRanks", heatId: "h1" });
		expect(heat.querySelectorAll(".hb-result--rank")).toHaveLength(0);
		fireEvent.click(button(panel, "Rank by order"));
		expect(actions[2]).toEqual({ type: "rankByPosition", heatId: "h1" });
	});

	it("offers no ranking when scoring is configured", () => {
		const scoring = {
			method: "points" as const,
			scale: { min: 0, max: 10, step: 0.5 },
			categories: [{ type: "wave" as const, counted: 2 }],
			aggregation: "sum" as const,
		};
		const bracket = makeRaceBracket({ scoring, status: "running" });
		bracket.rounds[0]!.heats[0] = {
			...bracket.rounds[0]!.heats[0]!,
			status: "running",
		};
		const { container } = renderAdmin(bracket);
		const panel = openHeatInspector(container, "h1");
		expect(button(panel, "Judge")).toBeTruthy();
		expect(
			within(panel).queryByRole("button", { name: "Rank by order" }),
		).toBeNull();
		expect(
			within(panel).queryByRole("button", { name: "Clear ranks" }),
		).toBeNull();
	});

	it("refuses the ranking shortcuts on a pending heat, with the reason", () => {
		const { container, actions } = renderAdmin(makeRaceBracket());
		const panel = openHeatInspector(container, "h1");
		for (const name of ["Rank by order", "Clear ranks"]) {
			const shortcut = button(panel, name);
			expectRefused(shortcut);
			expect(shortcut.title).toBe("Only a running heat can be reordered.");
			fireEvent.click(shortcut);
		}
		expect(actions).toEqual([]);
	});

	it("keeps the ranking shortcuts when the scoring uses placings", () => {
		const scoring = {
			method: "placings" as const,
			scale: { min: 0, max: 10, step: 0.5 },
			categories: [{ type: "wave" as const, counted: 2 }],
			aggregation: "sum" as const,
		};
		const bracket = makeRaceBracket({ scoring, status: "running" });
		bracket.rounds[0]!.heats[0] = {
			...bracket.rounds[0]!.heats[0]!,
			status: "running",
		};
		const { container } = renderAdmin(bracket);
		const panel = openHeatInspector(container, "h1");
		expect(button(panel, "Rank by order")).toBeTruthy();
		expect(button(panel, "Clear ranks")).toBeTruthy();
	});

	it("can be replaced through components", () => {
		function Custom({ heat }: HeatActionsProps) {
			return <p>custom {heat.id}</p>;
		}
		renderAdmin(makeRaceBracket(), {
			board: { components: { HeatActions: Custom } },
		});
		expect(screen.getByText("custom h1")).toBeTruthy();
		expect(screen.queryAllByRole("button", { name: /^Start/ })).toHaveLength(0);
	});
});

describe("HeatControls", () => {
	it("can be replaced through components", () => {
		function Custom({ heat }: HeatControlsProps) {
			return <p>custom {heat.id}</p>;
		}
		const { container } = renderAdmin(makeRaceBracket(), {
			board: { components: { HeatControls: Custom } },
		});
		const panel = openHeatInspector(container, "h1");
		expect(within(panel).getByText("custom h1")).toBeTruthy();
		expect(
			within(panel).queryAllByRole("button", { name: /^Start/ }),
		).toHaveLength(0);
	});
});

describe("participant status in the inspector", () => {
	const open = (panel: HTMLElement, rider: string) => {
		fireEvent.click(statusTrigger(panel, rider));
		return screen.getByRole("menu");
	};

	it("lists the riders of the heat with a menu trigger each", () => {
		const { container } = renderAdmin(makeRaceBracket());
		const panel = openHeatInspector(container, "h1");
		const triggers = within(panel).getAllByRole("button", {
			name: /^Status of/,
		});
		expect(triggers.map((t) => t.getAttribute("aria-label"))).toEqual([
			"Status of Ann",
			"Status of Bob",
			"Status of Cy",
		]);
		expect(triggers[0]!.getAttribute("aria-haspopup")).toBe("menu");
		expect(triggers[0]!.getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByRole("menu")).toBeNull();
	});

	it("opens a menu of the three statuses with none checked by default", () => {
		const { container } = renderAdmin(makeRaceBracket());
		const panel = openHeatInspector(container, "h1");
		const menu = open(panel, "Ann");
		expect(statusTrigger(panel, "Ann").getAttribute("aria-expanded")).toBe(
			"true",
		);
		const items = within(menu).getAllByRole("menuitemcheckbox");
		expect(items.map((i) => i.textContent)).toEqual([
			"DNF — Did not finish",
			"DSQ — Disqualified",
			"DNS — Did not start",
		]);
		expect(items.map((i) => i.getAttribute("aria-checked"))).toEqual([
			"false",
			"false",
			"false",
		]);
		expect(document.activeElement).toBe(items[0]);
	});

	it("sets then clears a status, closing the menu and restoring focus", () => {
		const { container, actions } = renderAdmin(makeRaceBracket());
		const panel = openHeatInspector(container, "h1");
		const row = () =>
			heatSection(container, "h1").querySelector<HTMLElement>(
				'[data-rider-id="r1"]',
			)!;
		open(panel, "Ann");
		fireEvent.click(statusItem(/^DNS /));
		expect(actions[0]).toEqual({
			type: "setStatus",
			heatId: "h1",
			riderId: "r1",
			status: "DNS",
		});
		expect(row().querySelector(".hb-result--dns")).toBeTruthy();
		expect(
			panel.querySelector(".hb-inspector__rider .hb-result--dns"),
		).toBeTruthy();
		expect(screen.queryByRole("menu")).toBeNull();
		expect(document.activeElement).toBe(statusTrigger(panel, "Ann"));

		open(panel, "Ann");
		expect(statusItem(/^DNS /).getAttribute("aria-checked")).toBe("true");
		fireEvent.click(statusItem(/^DNS /));
		expect(actions).toHaveLength(2);
		expect(screen.queryByRole("menu")).toBeNull();
		expect(actions[1]).toMatchObject({ status: null });
		expect(row().querySelector(".hb-result--dns")).toBeNull();
	});

	it("moves with the arrows, selects with Enter and wraps around", () => {
		const { container, actions } = renderAdmin(makeRaceBracket());
		const panel = openHeatInspector(container, "h1");
		const menu = open(panel, "Ann");
		fireEvent.keyDown(menu, { key: "ArrowUp" });
		expect(document.activeElement).toBe(statusItem(/^DNS /));
		fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
		expect(document.activeElement).toBe(statusItem(/^DNF /));
		fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
		expect(document.activeElement).toBe(statusItem(/^DSQ /));
		fireEvent.keyDown(document.activeElement!, { key: "End" });
		expect(document.activeElement).toBe(statusItem(/^DNS /));
		fireEvent.keyDown(document.activeElement!, { key: "Home" });
		expect(document.activeElement).toBe(statusItem(/^DNF /));
		// A native button turns Enter and Space into a click.
		fireEvent.click(statusItem(/^DSQ /));
		expect(actions).toEqual([
			{ type: "setStatus", heatId: "h1", riderId: "r1", status: "DSQ" },
		]);
	});

	it("closes on Escape without changing anything nor closing the inspector", () => {
		const { container, actions } = renderAdmin(makeRaceBracket());
		const panel = openHeatInspector(container, "h1");
		open(panel, "Ann");
		fireEvent.keyDown(statusItem(/^DNF /), { key: "Escape" });
		expect(screen.queryByRole("menu")).toBeNull();
		expect(actions).toEqual([]);
		expect(inspector().dataset.target).toBe("heat");
		expect(document.activeElement).toBe(statusTrigger(panel, "Ann"));

		fireEvent.keyDown(statusTrigger(panel, "Ann"), { key: "Escape" });
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("closes on Tab and on a press outside", () => {
		const { container } = renderAdmin(makeRaceBracket());
		const panel = openHeatInspector(container, "h1");
		open(panel, "Ann");
		fireEvent.keyDown(statusItem(/^DNF /), { key: "Tab" });
		expect(screen.queryByRole("menu")).toBeNull();

		open(panel, "Ann");
		fireEvent.pointerDown(statusTrigger(panel, "Ann"));
		expect(screen.getByRole("menu")).toBeTruthy();
		fireEvent.pointerDown(document.body);
		expect(screen.queryByRole("menu")).toBeNull();
	});

	it("closes when another rider's menu is opened by a press elsewhere", () => {
		const { container } = renderAdmin(makeRaceBracket());
		const panel = openHeatInspector(container, "h1");
		open(panel, "Ann");
		fireEvent.pointerDown(statusTrigger(panel, "Bob"));
		fireEvent.click(statusTrigger(panel, "Bob"));
		expect(screen.getAllByRole("menu")).toHaveLength(1);
		expect(screen.getByRole("menu").getAttribute("aria-label")).toBe(
			"Status of Bob",
		);
	});

	it("greys the items with the reason when the heat is locked and keeps the menu open", () => {
		const bracket = makeJudgedRace();
		bracket.rounds[0]!.heats[0]!.status = "locked";
		const { container, actions } = renderAdmin(bracket);
		const panel = openHeatInspector(container, "h1");
		open(panel, "Ann");
		const option = statusItem(/^DSQ /);
		expectRefused(option);
		expect(option.title).toBe("This heat is locked.");
		fireEvent.click(option);
		expect(actions).toEqual([]);
		expect(screen.getByRole("menu")).toBeTruthy();
	});

	it("is hidden without the riderStatus permission", () => {
		const { container } = renderAdmin(makeRaceBracket(), {
			board: { permissions: { riderStatus: false } },
		});
		const panel = openHeatInspector(container, "h1");
		expect(
			within(panel).queryAllByRole("button", { name: /^Status of/ }),
		).toHaveLength(0);
	});

	it("leaves the rider rows without any control, the whole row being the drag handle", () => {
		const { container } = renderAdmin(makeRaceBracket());
		const rows = container.querySelectorAll(".hb-participant");
		expect(rows).toHaveLength(4);
		for (const row of rows) {
			expect(row.querySelector("button, input, select, a")).toBeNull();
		}
		for (const handle of container.querySelectorAll("[aria-roledescription]")) {
			expect(handle.querySelector("button, input, select, a")).toBeNull();
		}
	});
});

describe("round actions", () => {
	it("has no Advance button: qualifiers are placed when a heat is judged", () => {
		const { container } = renderAdmin(makeJudgedRace());
		expect(screen.queryAllByRole("button", { name: "Advance" })).toHaveLength(
			0,
		);
		expect(
			within(roundSection(container, "round1")).queryByRole("button", {
				name: "Advance",
			}),
		).toBeNull();
	});

	it("summarizes the size and qualification in one chip", () => {
		const { container } = renderAdmin(makeRaceBracket());
		const meta = roundSection(container, "round1").querySelector(
			".hb-round__meta",
		)!;
		expect(
			Array.from(meta.querySelectorAll("span"), (n) => n.textContent),
		).toEqual(["4 per heat", "2 qualified"]);
	});

	it("can be replaced through components", () => {
		renderAdmin(makeRaceBracket(), {
			board: {
				components: { RoundHeaderActions: ({ round }) => <p>c {round.id}</p> },
			},
		});
		expect(screen.getByText("c round1")).toBeTruthy();
		expect(screen.queryAllByRole("button", { name: "Advance" })).toHaveLength(
			0,
		);
	});
});

describe("RoundControls", () => {
	it("changes the heat size and refuses sizes below the current content", () => {
		const { container, actions } = renderAdmin(makeRaceBracket());
		const select = within(
			openRoundInspector(container, "round1"),
		).getByLabelText<HTMLSelectElement>("Riders per heat");
		const option = (n: number) =>
			within(select).getByRole<HTMLOptionElement>("option", {
				name: `${n} per heat`,
			});
		expect(option(2).disabled).toBe(true);
		expect(option(2).title).toBe("A heat already holds more riders than this.");
		expect(option(3).disabled).toBe(false);
		fireEvent.change(select, { target: { value: "6" } });
		expect(actions).toEqual([
			{ type: "setMaxPerHeat", roundId: "round1", max: 6 },
		]);
		expect(select.value).toBe("6");
	});

	it("changes the number of qualified riders", () => {
		const { container, actions } = renderAdmin(makeRaceBracket());
		const select = within(
			openRoundInspector(container, "round1"),
		).getByLabelText<HTMLSelectElement>("Qualified");
		expect(Array.from(select.options, (o) => o.value)).toEqual([
			"1",
			"2",
			"3",
			"4",
		]);
		fireEvent.change(select, { target: { value: "3" } });
		expect(actions).toEqual([
			{ type: "updateRound", roundId: "round1", advancing: 3 },
		]);
		expect(screen.getAllByText("3 qualified").length).toBeGreaterThan(0);
	});
});

describe("review flag", () => {
	function flagged() {
		const base = makeRaceBracket();
		const [first, ...others] = base.rounds[0]!.heats;
		return {
			...base,
			rounds: [
				{
					...base.rounds[0]!,
					heats: [{ ...first!, needsReview: true }, ...others],
				},
				base.rounds[1]!,
			],
		};
	}

	it("clears the flag from the heat panel", () => {
		const { container, actions } = renderAdmin(flagged());
		const panel = openHeatInspector(container, "h1");
		fireEvent.click(button(panel, "Mark as reviewed"));
		expect(actions).toEqual([{ type: "clearReview", heatId: "h1" }]);
		expect(screen.queryByText("Needs review")).toBeNull();
	});

	it("offers nothing on a heat that is not flagged", () => {
		const { container } = renderAdmin(flagged());
		const panel = openHeatInspector(container, "h2");
		expect(
			within(panel).queryByRole("button", { name: "Mark as reviewed" }),
		).toBeNull();
	});
});

describe("RoundControls with a stored format", () => {
	it("keeps only the judging mode", () => {
		const bracket = makeRaceBracket({
			format: { settings: {} as never, drawSeed: 1 },
		});
		const { container, actions } = renderAdmin(bracket);
		const panel = openRoundInspector(container, "round1");
		expect(within(panel).queryByLabelText("Qualified")).toBeNull();
		expect(within(panel).queryByLabelText("Riders per heat")).toBeNull();
		expect(within(panel).queryByText("4 per heat")).toBeNull();
		expect(
			within(panel).getByText("Heats and qualifiers are set by the format."),
		).toBeTruthy();
		expect(actions).toEqual([]);
	});

	it("hides the structure buttons of a bracket with a stored format", () => {
		const bracket = makeRaceBracket({
			format: { settings: {} as never, drawSeed: 1 },
		});
		const { container } = renderAdmin(bracket);
		expect(screen.queryByRole("button", { name: "Add round" })).toBeNull();
		const round = openRoundInspector(container, "round1");
		expect(
			within(round).queryByRole("button", { name: "Add heat" }),
		).toBeNull();
		expect(
			within(round).queryByRole("button", { name: "Remove Round 1" }),
		).toBeNull();
		const heat = openHeatInspector(container, "h1");
		expect(
			within(heat).queryByRole("button", { name: /^Remove Heat/ }),
		).toBeNull();
	});
});

describe("BracketToolbar", () => {
	it("walks draft and ready, then offers no status button while running", () => {
		const { container, actions } = renderAdmin(
			makeRaceBracket({ status: "draft" }),
		);
		openBracketInspector(container);
		const toolbar = () => container.querySelector<HTMLElement>(".hb-toolbar")!;
		fireEvent.click(button(toolbar(), "Mark as ready"));
		expect(button(toolbar(), "Back to draft")).toBeTruthy();
		fireEvent.click(button(toolbar(), "Back to draft"));
		fireEvent.click(button(toolbar(), "Mark as ready"));
		fireEvent.click(button(heatSection(container, "h1"), "Start heat 1"));
		expect(container.querySelector(".hb-board__status")!.textContent).toBe(
			"Running",
		);
		for (const name of [
			"Mark as ready",
			"Back to draft",
			"Finish",
			"Validate",
		]) {
			expect(within(toolbar()).queryByRole("button", { name })).toBeNull();
		}
		expect(
			actions.map((a) => (a.type === "setBracketStatus" ? a.status : a.type)),
		).toEqual(["published", "draft", "published", "setHeatStatus"]);
	});

	it("validates and unvalidates a finished bracket", () => {
		const { container, actions } = renderAdmin(
			makeRaceBracket({ status: "finished" }),
		);
		openBracketInspector(container);
		const toolbar = () => container.querySelector<HTMLElement>(".hb-toolbar")!;
		fireEvent.click(button(toolbar(), "Validate"));
		expect(container.querySelector(".hb-board__status")!.textContent).toBe(
			"Validated",
		);
		fireEvent.click(button(toolbar(), "Unvalidate"));
		expect(
			actions.map((a) => (a.type === "setBracketStatus" ? a.status : a.type)),
		).toEqual(["validated", "finished"]);
	});

	it("toggles visibility and shows it as a badge", () => {
		const { container, actions } = renderAdmin(makeRaceBracket());
		const panel = openBracketInspector(container);
		const badge = () =>
			container.querySelector(".hb-board__visibility")!.textContent;
		expect(badge()).toBe("Private");
		fireEvent.click(button(panel, "Make public"));
		expect(actions).toEqual([{ type: "setVisibility", visibility: "public" }]);
		expect(badge()).toBe("Public");
		fireEvent.click(button(panel, "Make private"));
		expect(actions[1]).toEqual({
			type: "setVisibility",
			visibility: "private",
		});
	});
});

describe("permissions", () => {
	it("hide the matching controls only", () => {
		const { container } = renderAdmin(makeJudgedRace(), {
			pool: true,
			board: {
				collapseFarRounds: false,
				permissions: {
					heatStatus: false,
					ranking: false,
					riderStatus: false,
					roundSettings: false,
					bracketStatus: false,
					visibility: false,
					reset: false,
					structure: false,
					entries: false,
					names: false,
				},
			},
		});
		expect(
			screen.getAllByRole("button").map((b) => b.getAttribute("aria-label")),
		).toEqual(["Show or hide unplaced riders"]);
		expect(container.querySelectorAll("select, input")).toHaveLength(0);
		expect(container.querySelectorAll(".hb-actions")).toHaveLength(0);
	});

	it("bracketPanel hides the bracket inspector trigger only", () => {
		const { container } = renderAdmin(makeRaceBracket(), {
			board: { permissions: { bracketPanel: false } },
		});
		expect(container.querySelector(".hb-board__header button")).toBeNull();
		expect(openRoundInspector(container, "round1")).toBeTruthy();
	});

	it("keep the others", () => {
		const { container } = renderAdmin(makeRaceBracket(), {
			board: { permissions: { heatStatus: false, names: false } },
		});
		const heat = heatSection(container, "h1");
		expect(within(heat).queryByRole("button", { name: /^Start/ })).toBeNull();
		const panel = openHeatInspector(container, "h1");
		expect(within(panel).queryByRole("textbox")).toBeNull();
		expect(within(panel).queryByRole("button", { name: /^Start/ })).toBeNull();
		expect(button(panel, "Rank by order")).toBeTruthy();
		expect(
			within(panel).getAllByRole("button", { name: /^Status of/ }),
		).toHaveLength(3);
	});
});

describe("french labels", () => {
	it("translates controls and refusal reasons", () => {
		const { container } = renderAdmin(makeRaceBracket({ status: "draft" }), {
			locale: "fr",
		});
		const heat = heatSection(container, "h1");
		const start = button(heat, "Démarrer le heat 1");
		expectRefused(start);
		expect(start.title).toBe(
			"Passez le tableau à « Prêt » avant de démarrer un heat.",
		);
		const panel = openHeatInspector(container, "h1");
		expect(button(panel, "Classer selon l'ordre")).toBeTruthy();
		expect(button(panel, "Effacer les rangs")).toBeTruthy();
		expect(within(panel).getByRole("button", { name: "Fermer" })).toBeTruthy();
		expect(
			within(panel).getByRole("button", { name: "Statut de Ann" }),
		).toBeTruthy();
		const bracketPanel = openBracketInspector(container);
		expect(button(bracketPanel, "Marquer comme prêt")).toBeTruthy();
		expect(button(bracketPanel, "Rendre public")).toBeTruthy();
		expect(button(bracketPanel, "Réinitialiser")).toBeTruthy();
		expect(container.querySelector(".hb-board__visibility")!.textContent).toBe(
			"Privé",
		);
		expect(inspector()).toBe(bracketPanel);
	});
});

describe("order of a heat on the admin board", () => {
	const riderIds = (container: HTMLElement) =>
		[...heatSection(container, "h1").querySelectorAll("[data-rider-id]")].map(
			(el) => el.getAttribute("data-rider-id"),
		);

	it("reads a judged heat by rank, like the public page", () => {
		const bracket = makeJudgedRace();
		bracket.rounds[0]!.heats[0]!.slots = [
			{ riderId: "r1", rank: 2 },
			{ riderId: "r2", rank: 1 },
			{ riderId: "r3", rank: 3 },
		];
		const { container } = renderAdmin(bracket);
		expect(riderIds(container)).toEqual(["r2", "r1", "r3"]);
	});

	it("keeps the lycra order of a heat that has not been judged", () => {
		const { container } = renderAdmin(makeRaceBracket());
		expect(riderIds(container)).toEqual(["r1", "r2", "r3"]);
	});
});
