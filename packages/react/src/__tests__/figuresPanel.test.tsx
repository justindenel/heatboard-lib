import { cleanup, fireEvent, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
	scoringPresets,
	type Action,
	type ScoringConfig,
} from "@heatboard/core";
import {
	makeRaceBracket,
	openBracketInspector,
	renderAdmin,
} from "./admin-helpers";

afterEach(cleanup);

function openJump(scoring: ScoringConfig = scoringPresets.windsurfWave) {
	const view = renderAdmin(makeRaceBracket({ scoring }));
	const panel = openBracketInspector(view.container);
	fireEvent.click(
		within(panel).getByRole("button", { name: /^Figures of Jump/ }),
	);
	return { ...view, panel };
}

function group(panel: HTMLElement, family: string) {
	return within(panel).getByRole("group", { name: `Family ${family}` });
}

/** Codes of the rows of a family, read from the code inputs. */
function codes(panel: HTMLElement, family: string): string[] {
	return within(group(panel, family))
		.getAllByLabelText("Code")
		.map((input) => (input as HTMLInputElement).value);
}

function sent(actions: Action[]) {
	const action = actions.at(-1);
	return action?.type === "setRaceFormat" ? action.scoring : undefined;
}

function save(panel: HTMLElement) {
	fireEvent.click(
		within(panel).getByRole("button", { name: "Save the format" }),
	);
}

const FORWARD = "Forward";
const BACKWARD = "Backward";
const COMBINED = "Combined";
const OTHER = "Other";

describe("opening", () => {
	it("replaces the sections with the families of the category, and goes back", () => {
		const { panel } = openJump();
		expect(within(panel).getByText("Figures · Jump")).toBeTruthy();
		expect(within(panel).queryByLabelText("Method")).toBeNull();
		expect(
			within(panel).getAllByRole("group", { name: /^Family / }),
		).toHaveLength(4);
		expect(within(panel).getByText("23 figures · 4 families")).toBeTruthy();
		fireEvent.click(
			within(panel).getByRole("button", { name: "Back to the format" }),
		);
		expect(within(panel).getByLabelText("Method")).toBeTruthy();
	});

	it("tags each figure row with its code", () => {
		const { panel } = openJump();
		const rows = [
			...group(panel, FORWARD).querySelectorAll("[data-figure-code]"),
		];
		expect(rows.map((row) => row.getAttribute("data-figure-code"))).toEqual([
			"CR",
			"G",
			"F",
			"FPL",
			"AC",
			"AS",
		]);
	});

	it("lists the figures of each family in order, with the count in the title", () => {
		const { panel } = openJump();
		expect(codes(panel, FORWARD)).toEqual(["CR", "G", "F", "FPL", "AC", "AS"]);
		expect(within(group(panel, FORWARD)).getByText("6 figures")).toBeTruthy();
		expect(codes(panel, OTHER)).toHaveLength(5);
	});

	it("starts a category without figures empty, and keeps the card summary in sync", () => {
		const view = renderAdmin(
			makeRaceBracket({ scoring: scoringPresets.windsurfWave }),
		);
		const panel = openBracketInspector(view.container);
		fireEvent.click(
			within(panel).getByRole("button", { name: /^Figures of Wave/ }),
		);
		expect(within(panel).queryAllByRole("group", { name: /^Family / })).toEqual(
			[],
		);
		fireEvent.click(
			within(panel).getByRole("button", { name: "Add a family of figures" }),
		);
		const name = within(panel).getByLabelText("Family name");
		fireEvent.change(name, { target: { value: "Rotations" } });
		fireEvent.keyDown(name, { key: "Enter" });
		fireEvent.click(
			within(panel).getByRole("button", { name: "Add a figure to Rotations" }),
		);
		fireEvent.change(within(panel).getByLabelText("Code"), {
			target: { value: "R1" },
		});
		fireEvent.click(
			within(panel).getByRole("button", { name: "Back to the format" }),
		);
		expect(
			within(panel).getByRole("button", {
				name: "Figures of Wave, 1 figure in 1 family",
			}),
		).toBeTruthy();
	});
});

describe("families", () => {
	it("renames a family on the spot: Enter keeps the name, Escape drops it", () => {
		const { panel, actions } = openJump();
		fireEvent.click(
			within(panel).getByRole("button", { name: `Rename the family ${OTHER}` }),
		);
		const input = within(panel).getByLabelText("Family name");
		fireEvent.change(input, { target: { value: "Misc" } });
		fireEvent.keyDown(input, { key: "Enter" });
		expect(group(panel, "Misc")).toBeTruthy();

		fireEvent.click(
			within(panel).getByRole("button", { name: "Rename the family Misc" }),
		);
		const again = within(panel).getByLabelText("Family name");
		fireEvent.change(again, { target: { value: "Nope" } });
		fireEvent.keyDown(again, { key: "Escape" });
		expect(group(panel, "Misc")).toBeTruthy();

		save(panel);
		const jump = sent(actions)?.categories[1];
		expect(jump?.families?.map((f) => f.name)).toContain("Misc");
		expect(jump?.families?.find((f) => f.name === "Misc")?.id).toBe("other");
	});

	it("flags an empty name and a repeated one", () => {
		const { panel } = openJump();
		fireEvent.click(
			within(panel).getByRole("button", { name: "Add a family of figures" }),
		);
		const name = within(panel).getByLabelText("Family name");
		expect(name.getAttribute("aria-invalid")).toBe("true");
		fireEvent.change(name, { target: { value: FORWARD } });
		fireEvent.keyDown(name, { key: "Enter" });
		expect(panel.textContent).toContain("Family names must be unique");
		expect(panel.textContent).toContain("1 point to fix");
	});

	it("moves a family up and down, announcing it", () => {
		const { panel } = openJump();
		fireEvent.click(
			within(panel).getByRole("button", {
				name: `Move the family ${OTHER} up`,
			}),
		);
		expect(
			within(panel)
				.getAllByRole("group", { name: /^Family / })
				.map((g) => g.getAttribute("aria-label")),
		).toEqual([
			`Family ${FORWARD}`,
			`Family ${BACKWARD}`,
			`Family ${OTHER}`,
			`Family ${COMBINED}`,
		]);
		expect(panel.textContent).toContain(`${OTHER} moved to position 3`);
	});

	it("removes an empty family at once", () => {
		const { panel } = openJump();
		fireEvent.click(
			within(panel).getByRole("button", { name: "Add a family of figures" }),
		);
		fireEvent.keyDown(within(panel).getByLabelText("Family name"), {
			key: "Escape",
		});
		fireEvent.click(
			within(panel).getAllByRole("button", { name: /^Remove the family$/ })[0]!,
		);
		expect(
			within(panel).getAllByRole("group", { name: /^Family / }),
		).toHaveLength(4);
	});

	it("asks where the figures of a family go before removing it", () => {
		const { panel, actions } = openJump();
		fireEvent.click(
			within(panel).getByRole("button", { name: `Remove the family ${OTHER}` }),
		);
		const confirm = within(panel).getByRole("dialog", {
			name: `Remove the family "${OTHER}"?`,
		});
		expect(confirm.textContent).toContain("It holds 5 figures");
		fireEvent.change(within(confirm).getByLabelText("Destination family"), {
			target: { value: "forward" },
		});
		fireEvent.click(
			within(confirm).getByRole("button", { name: "Remove and move" }),
		);
		expect(
			within(panel).queryByRole("group", { name: `Family ${OTHER}` }),
		).toBeNull();
		expect(codes(panel, FORWARD)).toHaveLength(11);
		save(panel);
		const jump = sent(actions)?.categories[1];
		expect(jump?.families).toHaveLength(3);
		expect(jump?.figures?.every((f) => f.family !== "other")).toBe(true);
	});

	it("lets a removal be cancelled", () => {
		const { panel } = openJump();
		fireEvent.click(
			within(panel).getByRole("button", { name: `Remove the family ${OTHER}` }),
		);
		const confirm = within(panel).getByRole("dialog");
		fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
		expect(group(panel, OTHER)).toBeTruthy();
		expect(within(panel).queryByRole("dialog")).toBeNull();
	});

	it("drops the different-families rule once fewer than two families are left", () => {
		const { panel, actions } = openJump();
		for (const family of [OTHER, COMBINED, BACKWARD]) {
			fireEvent.click(
				within(panel).getByRole("button", {
					name: `Remove the family ${family}`,
				}),
			);
			fireEvent.click(
				within(panel).getByRole("button", { name: "Remove and move" }),
			);
		}
		save(panel);
		const jump = sent(actions)?.categories[1];
		expect(jump?.families).toHaveLength(1);
		expect(jump).not.toHaveProperty("distinctFamilies");
	});
});

describe("figures", () => {
	it("adds a figure at the end of its family and refuses it until it has a code", () => {
		const { panel } = openJump();
		fireEvent.click(
			within(panel).getByRole("button", {
				name: `Add a figure to ${FORWARD}`,
			}),
		);
		expect(codes(panel, FORWARD).at(-1)).toBe("");
		expect(panel.textContent).toContain("A figure needs a code.");
		expect(panel.textContent).toContain("1 point to fix");
		fireEvent.click(
			within(panel).getByRole("button", { name: "Save the format" }),
		);
		const rows = within(group(panel, FORWARD)).getAllByLabelText("Code");
		fireEvent.change(rows.at(-1)!, { target: { value: "NEW" } });
		expect(panel.textContent).not.toContain("A figure needs a code.");
	});

	it("flags a code already used in the category", () => {
		const { panel } = openJump();
		const rows = within(group(panel, BACKWARD)).getAllByLabelText("Code");
		fireEvent.change(rows[0]!, { target: { value: "CR" } });
		expect(panel.textContent).toContain("already used in this category");
	});

	it("names a figure or leaves the code as its name", () => {
		const { panel, actions } = openJump();
		const row = within(group(panel, FORWARD)).getAllByLabelText("Name")[0]!;
		fireEvent.change(row, { target: { value: "Cheese" } });
		save(panel);
		expect(
			sent(actions)?.categories[1]?.figures?.find((f) => f.code === "CR")?.name,
		).toBe("Cheese");
	});

	it("deletes a figure", () => {
		const { panel } = openJump();
		fireEvent.click(within(panel).getByRole("button", { name: "Delete CR" }));
		expect(codes(panel, FORWARD)).toEqual(["G", "F", "FPL", "AC", "AS"]);
	});

	it("moves a figure with the arrows, across the edge of its family, and announces it", () => {
		const { panel } = openJump();
		fireEvent.click(
			within(panel).getByRole("button", { name: "Move CR down" }),
		);
		expect(codes(panel, FORWARD)[0]).toBe("G");
		expect(panel.textContent).toContain(`CR moved to ${FORWARD}, position 2`);

		const last = within(group(panel, FORWARD)).getByRole("button", {
			name: "Move AS down",
		});
		fireEvent.click(last);
		expect(codes(panel, BACKWARD)[0]).toBe("AS");
		expect(panel.textContent).toContain(`AS moved to ${BACKWARD}, position 1`);
	});

	it("has no way up for the first figure nor down for the last one", () => {
		const { panel } = openJump();
		expect(
			within(panel).getByRole("button", { name: "Move CR up" }),
		).toHaveProperty("disabled", true);
		expect(
			within(panel).getByRole("button", { name: "Move AS down" }),
		).toHaveProperty("disabled", false);
		const lastRow = within(group(panel, OTHER))
			.getAllByLabelText("Code")
			.at(-1)!;
		const code = (lastRow as HTMLInputElement).value;
		expect(
			within(panel).getByRole("button", { name: `Move ${code} down` }),
		).toHaveProperty("disabled", true);
	});

	it("moves a figure from the keyboard on its handle", () => {
		const { panel } = openJump();
		fireEvent.keyDown(within(panel).getByRole("button", { name: "Move G" }), {
			key: "ArrowUp",
		});
		expect(codes(panel, FORWARD).slice(0, 2)).toEqual(["G", "CR"]);
	});

	it("filters the rows and keeps the handles quiet while filtering", () => {
		const { panel } = openJump();
		fireEvent.change(within(panel).getByLabelText("Find a code or a name"), {
			target: { value: "loop" },
		});
		expect(
			within(panel).queryByRole("group", { name: `Family ${FORWARD}` }),
		).toBeNull();
		expect(codes(panel, BACKWARD)).toEqual(["B", "P"]);
		expect(
			within(panel).getByRole("button", { name: "Move B" }),
		).toHaveProperty("disabled", true);
		fireEvent.change(within(panel).getByLabelText("Find a code or a name"), {
			target: { value: "zzz" },
		});
		expect(panel.textContent).toContain("No figure matches.");
	});
});

describe("variants", () => {
	it("shows the shared list and edits it", () => {
		const { panel, actions } = openJump();
		expect(within(panel).getAllByText(/One hand/).length).toBeGreaterThan(0);
		fireEvent.click(within(panel).getByRole("button", { name: "Edit" }));
		const codesInput = within(panel).getAllByLabelText("Variant code");
		expect(codesInput).toHaveLength(5);
		fireEvent.change(codesInput[0]!, { target: { value: "OH" } });
		save(panel);
		const sentScoring = sent(actions);
		expect(sentScoring?.variants?.[0]).toMatchObject({
			code: "OH",
			suffix: "OH",
		});
		expect(
			sentScoring?.categories[1]?.figures?.find((f) => f.code === "F")
				?.variants,
		).toContain("OH");
	});

	it("adds a variant and refuses it until it has a code and a name", () => {
		const { panel } = openJump();
		fireEvent.click(within(panel).getByRole("button", { name: "Edit" }));
		fireEvent.click(
			within(panel).getByRole("button", { name: "Add a variant" }),
		);
		expect(panel.textContent).toContain("A variant needs a code.");
		expect(panel.textContent).toContain("2 points to fix");
	});

	it("removes a variant from the list and from the figures", () => {
		const { panel, actions } = openJump();
		fireEvent.click(within(panel).getByRole("button", { name: "Edit" }));
		fireEvent.click(
			within(panel).getByRole("button", { name: "Remove the variant 1H" }),
		);
		save(panel);
		const result = sent(actions);
		expect(result?.variants?.some((v) => v.code === "1H")).toBe(false);
		expect(
			result?.categories[1]?.figures?.some((f) => f.variants?.includes("1H")),
		).toBe(false);
	});

	it("ticks the variants a figure accepts from the list of the scoring", () => {
		const { panel, actions } = openJump();
		fireEvent.click(
			within(panel).getByRole("button", { name: "Variants of CR" }),
		);
		const menu = within(panel).getByRole("group", {
			name: "Variants allowed for CR",
		});
		expect(within(menu).getAllByRole("checkbox")).toHaveLength(5);
		fireEvent.click(within(menu).getAllByRole("checkbox")[0]!);
		expect(menu.textContent).toContain("CR1H");
		fireEvent.keyDown(document, { key: "Escape" });
		expect(
			within(panel).queryByRole("group", { name: "Variants allowed for CR" }),
		).toBeNull();
		save(panel);
		expect(
			sent(actions)?.categories[1]?.figures?.find((f) => f.code === "CR")
				?.variants,
		).toEqual(["1H"]);
	});
});

describe("the format as a whole", () => {
	it("keeps what was moved for the one save of the format", () => {
		const { panel, actions } = openJump();
		fireEvent.click(
			within(panel).getByRole("button", { name: "Move AS down" }),
		);
		fireEvent.click(
			within(panel).getByRole("button", { name: "Back to the format" }),
		);
		expect(panel.textContent).toContain("1 change");
		save(panel);
		expect(actions).toHaveLength(1);
	});
});
