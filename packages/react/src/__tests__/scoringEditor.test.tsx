import { cleanup, fireEvent, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
	scoringPresets,
	type Bracket,
	type ScoringConfig,
} from "@heatboard/core";
import {
	expectRefused,
	makeJudgedRace,
	makeRaceBracket,
	openBracketInspector,
	renderAdmin,
} from "./admin-helpers";
import { placingsWave } from "./judging-helpers";

afterEach(cleanup);

const points: ScoringConfig = {
	method: "points",
	scale: { min: 0, max: 10, step: 1 },
	categories: [{ type: "Wave", counted: 1 }],
	aggregation: "mean",
};

function open(bracket: Bracket, board = {}) {
	const view = renderAdmin(bracket, { board });
	return { ...view, panel: openBracketInspector(view.container) };
}

function field(panel: HTMLElement, label: string) {
	return within(panel).getByLabelText(label);
}

function change(element: HTMLElement, value: string) {
	fireEvent.change(element, { target: { value } });
}

function saveButton(panel: HTMLElement) {
	return within(panel).getByRole("button", { name: "Save the format" });
}

function save(panel: HTMLElement) {
	fireEvent.click(saveButton(panel));
}

function mode(panel: HTMLElement, name: "Free" | "Head judge") {
	return within(panel).getByRole("radio", { name: new RegExp(`^${name}`) });
}

function tile(panel: HTMLElement, name: RegExp) {
	return within(panel).getByRole("button", { name });
}

describe("rendering", () => {
	it("shows the current scoring in the bracket panel", () => {
		const { panel } = open(makeRaceBracket({ scoring: placingsWave }));
		expect((field(panel, "Method") as HTMLSelectElement).value).toBe(
			"placings",
		);
		expect((field(panel, "Scale max") as HTMLInputElement).value).toBe("10");
		expect(within(panel).getAllByLabelText("Category name")).toHaveLength(2);
	});

	it("is hidden without the scoring permission", () => {
		const { panel } = open(makeRaceBracket(), {
			permissions: { scoring: false },
		});
		expect(within(panel).queryByLabelText("Method")).toBeNull();
	});

	it("only shows the method and the examples of a bracket without scoring", () => {
		const { panel } = open(makeRaceBracket());
		expect((field(panel, "Method") as HTMLSelectElement).value).toBe("manual");
		expect(within(panel).queryByLabelText("Scale max")).toBeNull();
		expect(within(panel).queryByRole("radio")).toBeNull();
		expect(within(panel).getByText("Import a scoring example")).toBeTruthy();
	});

	it("shows what is in force, then what a save would put in force", () => {
		const { panel } = open(makeRaceBracket({ scoring: points }));
		expect(panel.textContent).toContain("In force");
		expect(panel.textContent).not.toContain("After saving");
		change(field(panel, "Method"), "placings");
		expect(panel.textContent).toContain("After saving");
		const changed = panel.querySelector(".hb-format-lines__changed");
		expect(changed?.textContent).toBe("Places of each judge");
	});
});

describe("templates and sentence", () => {
	it("fills the draft from a template and writes the sentence", () => {
		const { panel, actions } = open(makeRaceBracket());
		fireEvent.click(tile(panel, /^Windsurf wave/));
		expect(panel.textContent).toContain(
			"Each judge scores from 0 to 10 in half-point steps.",
		);
		save(panel);
		expect(actions).toEqual([
			{ type: "setRaceFormat", scoring: scoringPresets.windsurfWave },
		]);
	});

	it("moves to the head-judge mode with the surf template", () => {
		const { panel, actions } = open(makeRaceBracket());
		fireEvent.click(tile(panel, /^Surf/));
		save(panel);
		expect(actions).toHaveLength(1);
		expect(actions[0]).toMatchObject({
			type: "setRaceFormat",
			judgingMode: "headJudge",
		});
		expect(actions[0]).toHaveProperty("scoring");
	});

	it("marks the template that matches and goes back to manual ranking", () => {
		const { panel, actions } = open(
			makeRaceBracket({ scoring: scoringPresets.windsurfWave }),
		);
		const wave = tile(panel, /^Windsurf wave/);
		expect(wave.getAttribute("aria-pressed")).toBe("true");
		fireEvent.click(tile(panel, /^Manual ranking/));
		expect(panel.textContent).toContain("No judges");
		save(panel);
		expect(actions).toEqual([{ type: "setRaceFormat", scoring: null }]);
	});

	it("keeps the scoring details and the examples collapsed, at the bottom", () => {
		const { panel } = open(makeRaceBracket({ scoring: points }));
		const examples = within(panel)
			.getByText("Import a scoring example")
			.closest("details");
		const details = within(panel)
			.getByText("Scoring details")
			.closest("details");
		expect(examples?.open).toBe(false);
		expect(details?.open).toBe(false);
		const scoring = panel.querySelector(".hb-scoring")!;
		expect([...scoring.querySelectorAll(":scope > details")]).toEqual([
			details,
			examples,
		]);
		expect(scoring.lastElementChild).toBe(examples);
	});

	it("has no preset select nor any list of problems", () => {
		const { panel } = open(makeRaceBracket({ scoring: points }));
		expect(within(panel).queryByLabelText("Preset")).toBeNull();
		change(field(panel, "Scale max"), "7.3");
		expect(within(panel).queryByRole("alert")).toBeNull();
	});
});

describe("contextual settings", () => {
	it("hides the judging mode in manual ranking", () => {
		const { panel } = open(makeRaceBracket());
		expect(within(panel).queryByText("Judging mode")).toBeNull();
	});

	it("hides the alignment window in head-judge mode and says why", () => {
		const { panel } = open(
			makeRaceBracket({ scoring: points, judgingMode: "headJudge" }),
		);
		expect(within(panel).queryByLabelText("Alignment window")).toBeNull();
		expect(panel.textContent).toContain("Alignment window hidden");
		fireEvent.click(mode(panel, "Free"));
		expect(within(panel).getByLabelText("Alignment window")).toBeTruthy();
	});

	it("keeps the judges' notes for the places method: its tie-break uses them", () => {
		const { panel } = open(makeRaceBracket({ scoring: placingsWave }));
		const scoring = panel.querySelector<HTMLElement>(".hb-scoring")!;
		expect(within(scoring).getByLabelText("Judges' notes")).toBeTruthy();
	});

	it("offers the trim of places only for the places method", () => {
		const { panel } = open(makeRaceBracket({ scoring: placingsWave }));
		expect(within(panel).getByLabelText("Trim placings")).toBeTruthy();
		change(field(panel, "Method"), "points");
		expect(within(panel).queryByLabelText("Trim placings")).toBeNull();
	});

	it("shows the families rule of a category only with two families or more", () => {
		const { panel } = open(
			makeRaceBracket({ scoring: scoringPresets.windsurfWave }),
		);
		const boxes = within(panel).getAllByRole("checkbox", {
			name: "Counted Jump must be of different families",
		});
		expect(boxes).toHaveLength(1);
		expect((boxes[0] as HTMLInputElement).checked).toBe(true);
		expect(panel.textContent).toContain(
			"The 2 counted Jump rides must be from different families",
		);
	});

	it("summarises the figures of each category in its card", () => {
		const { panel } = open(
			makeRaceBracket({ scoring: scoringPresets.windsurfWave }),
		);
		expect(
			within(panel).getByRole("button", { name: /^Figures of Wave, none/ }),
		).toBeTruthy();
		expect(
			within(panel).getByRole("button", {
				name: /^Figures of Jump, 23 figures in 4 families/,
			}),
		).toBeTruthy();
	});
});

describe("live validation", () => {
	it("refuses a scale max that does not fit the step, under its field, and opens the details", () => {
		const { panel, actions } = open(
			makeRaceBracket({ scoring: scoringPresets.windsurfWave }),
		);
		const details = within(panel)
			.getByText("Scoring details")
			.closest("details");
		expect(details?.open).toBe(false);
		change(field(panel, "Scale max"), "7.3");
		expect(panel.textContent).toContain("scale maximum");
		expect(details?.open).toBe(true);
		expect(panel.textContent).toContain("1 point to fix");
		const button = saveButton(panel);
		expectRefused(button);
		fireEvent.click(button);
		expect(actions).toEqual([]);
	});

	it("flags unnamed and duplicate categories under their card", () => {
		const { panel } = open(
			makeRaceBracket({ scoring: scoringPresets.windsurfWave }),
		);
		const names = within(panel).getAllByLabelText("Category name");
		change(names[1]!, "Wave");
		expect(panel.textContent).toContain("unique");
		expect(names[1]!.getAttribute("aria-invalid")).toBe("true");
		change(names[1]!, "");
		expect(panel.textContent).toContain("needs a name");
	});

	it("keeps the tie-break category when it is renamed", () => {
		const { panel, actions } = open(makeRaceBracket({ scoring: placingsWave }));
		change(within(panel).getAllByLabelText("Category name")[0]!, "Surf");
		expect((field(panel, "Tie-break") as HTMLSelectElement).value).toBe("Surf");
		save(panel);
		const sent = actions[0];
		expect(sent?.type === "setRaceFormat" && sent.scoring?.priorityType).toBe(
			"Surf",
		);
	});

	it("keeps free mode out of reach while ride means are chosen", () => {
		const { panel } = open(makeRaceBracket({ scoring: points }));
		change(field(panel, "Method"), "rideMeans");
		expect(mode(panel, "Head judge")).toHaveProperty("checked", true);
		expect(mode(panel, "Free")).toHaveProperty("disabled", true);
		expect(panel.textContent).toContain("Ride means need the head-judge mode.");
	});
});

describe("applying", () => {
	it("starts from the presets given to the board when manual ranking becomes a method", () => {
		const { panel, actions } = open(makeRaceBracket(), {
			scoringPresets: { club: points },
		});
		change(field(panel, "Method"), "points");
		save(panel);
		expect(actions).toEqual([{ type: "setRaceFormat", scoring: points }]);
	});

	it("sends ride means and the head-judge mode in one action", () => {
		const { panel, actions } = open(
			makeRaceBracket({ scoring: scoringPresets.windsurfWave }),
		);
		change(field(panel, "Method"), "rideMeans");
		save(panel);
		expect(actions).toHaveLength(1);
		expect(actions[0]).toMatchObject({
			type: "setRaceFormat",
			judgingMode: "headJudge",
		});
	});

	it("leaves ride means and goes back to free mode in one action", () => {
		const { panel, actions } = open(
			makeRaceBracket({
				scoring: { ...scoringPresets.windsurfWave, method: "rideMeans" },
				judgingMode: "headJudge",
			}),
		);
		change(field(panel, "Method"), "placings");
		fireEvent.click(mode(panel, "Free"));
		save(panel);
		expect(actions).toHaveLength(1);
		expect(actions[0]).toMatchObject({
			type: "setRaceFormat",
			judgingMode: "free",
		});
	});

	it("changes the judging mode of the bracket through setRaceFormat", () => {
		const { panel, actions } = open(makeRaceBracket({ scoring: points }));
		fireEvent.click(mode(panel, "Head judge"));
		save(panel);
		expect(actions).toEqual([
			{ type: "setRaceFormat", judgingMode: "headJudge" },
		]);
	});

	it("goes back to manual ranking with a null scoring", () => {
		const { panel, actions } = open(
			makeRaceBracket({ scoring: scoringPresets.windsurfWave }),
		);
		change(field(panel, "Method"), "manual");
		save(panel);
		expect(actions).toEqual([{ type: "setRaceFormat", scoring: null }]);
		expect((field(panel, "Method") as HTMLSelectElement).value).toBe("manual");
	});

	it("has nothing to save until something changes, then says it saved", () => {
		const { panel } = open(makeRaceBracket({ scoring: points }));
		expectRefused(saveButton(panel));
		expect(panel.textContent).toContain("No change");
		change(field(panel, "Method"), "placings");
		expect(panel.textContent).toContain("1 change");
		save(panel);
		expect(panel.textContent).toContain("Saved.");
	});

	it("cancels the edits back to the format in force", () => {
		const { panel } = open(makeRaceBracket({ scoring: points }));
		change(field(panel, "Method"), "placings");
		fireEvent.click(within(panel).getByRole("button", { name: "Cancel" }));
		expect((field(panel, "Method") as HTMLSelectElement).value).toBe("points");
	});
});

describe("started heats", () => {
	it("says the new format only applies to heats that start from now on", () => {
		const { panel } = open(makeRaceBracket({ scoring: points }));
		expect(panel.textContent).toContain(
			"Applies to heats that start from now on; the heat in progress keeps its format.",
		);
	});

	it("applies a scoring change on a judged bracket without confirmation", () => {
		const { panel, actions } = open({
			...makeJudgedRace(),
			scoring: placingsWave,
		});
		change(field(panel, "Method"), "points");
		save(panel);
		expect(actions).toHaveLength(1);
		expect(actions[0]).toMatchObject({ type: "setRaceFormat" });
		expect(actions[0]).not.toHaveProperty("confirm");
		expect(actions[0]).not.toHaveProperty("recomputedRanks");
	});
});
