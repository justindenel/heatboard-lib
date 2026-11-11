import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	scoringPresets,
	type Action,
	type Bracket,
	type RaceTiming,
} from "@heatboard/core";
import {
	BracketProvider,
	HeatboardProvider,
	RaceFormatFooter,
	RaceFormatLines,
	RaceFormatProvider,
	ScoringSections,
	useBracket,
	type HostTiming,
} from "../index";
import { makeRaceBracket } from "./admin-helpers";

afterEach(cleanup);

function Host(props: {
	bracket: Bracket;
	actions: Action[];
	timing: HostTiming;
	locale: "en" | "fr";
}) {
	const controller = useBracket({
		defaultBracket: props.bracket,
		onChange: (_next, cause) => {
			if (cause.type === "action") props.actions.push(cause.action);
		},
	});
	return (
		<HeatboardProvider locale={props.locale}>
			<BracketProvider value={controller}>
				<RaceFormatProvider timing={props.timing}>
					<div data-testid="panel">
						<RaceFormatLines />
						<ScoringSections />
						<RaceFormatFooter />
					</div>
				</RaceFormatProvider>
			</BracketProvider>
		</HeatboardProvider>
	);
}

function setup(
	next: RaceTiming,
	options: {
		errors?: number;
		bracket?: Partial<Bracket>;
		locale?: "en" | "fr";
	} = {},
) {
	const actions: Action[] = [];
	const reset = vi.fn();
	const bracket = makeRaceBracket({
		scoring: scoringPresets.windsurfWave,
		timing: { heatDurationSec: 600, breakSec: 120 },
		...options.bracket,
	});
	const view = render(
		<Host
			bracket={bracket}
			actions={actions}
			timing={{ next, errors: options.errors ?? 0, reset }}
			locale={options.locale ?? "en"}
		/>,
	);
	const panel = view.getByTestId("panel");
	return { ...view, actions, reset, panel };
}

const save = (panel: HTMLElement) =>
	fireEvent.click(
		within(panel).getByRole("button", { name: "Save the format" }),
	);

describe("in French", () => {
	it("speaks the language of the provider", () => {
		const { panel } = setup(
			{ heatDurationSec: 720, breakSec: 120 },
			{ locale: "fr" },
		);
		expect(panel.textContent).toContain("En vigueur");
		expect(panel.textContent).toContain("Après enregistrement");
		expect(panel.textContent).toContain("1 modification");
		expect(
			within(panel).getByRole("button", { name: "Enregistrer le format" }),
		).toBeTruthy();
		expect(panel.textContent).toContain(
			"Les Jump comptés doivent être de familles différentes",
		);
	});
});

describe("timing owned by the host", () => {
	it("counts a changed duration and shows what a save would put in force", () => {
		const { panel } = setup({ heatDurationSec: 720, breakSec: 120 });
		expect(panel.textContent).toContain("1 change");
		expect(panel.textContent).toContain("After saving");
		expect(panel.querySelector(".hb-format-lines__changed")?.textContent).toBe(
			"Heat 12 min",
		);
	});

	it("saves the timing alone in one action", () => {
		const { panel, actions } = setup({ heatDurationSec: 720, breakSec: 120 });
		save(panel);
		expect(actions).toEqual([
			{
				type: "setRaceFormat",
				timing: { heatDurationSec: 720, breakSec: 120 },
			},
		]);
	});

	it("saves the timing, the scoring and the mode together in one action", () => {
		const { panel, actions } = setup({ heatDurationSec: 720, breakSec: 120 });
		fireEvent.change(within(panel).getByLabelText("Method"), {
			target: { value: "rideMeans" },
		});
		expect(panel.textContent).toContain("3 changes");
		save(panel);
		expect(actions).toHaveLength(1);
		expect(actions[0]).toMatchObject({
			type: "setRaceFormat",
			timing: { heatDurationSec: 720, breakSec: 120 },
			judgingMode: "headJudge",
		});
		expect(actions[0]).toHaveProperty("scoring");
	});

	it("blocks the save while a field of the host is invalid, and says so", () => {
		const { panel, actions } = setup({}, { errors: 1 });
		expect(panel.textContent).toContain("1 point to fix");
		expect(panel.textContent).toContain("1 point to fix first");
		save(panel);
		expect(actions).toEqual([]);
	});

	it("adds the problems of the host to those of the scoring", () => {
		const { panel } = setup({}, { errors: 2 });
		fireEvent.change(within(panel).getAllByLabelText("Category name")[1]!, {
			target: { value: "" },
		});
		expect(panel.textContent).toContain("3 points to fix");
	});

	it("puts the host's fields back when the edits are cancelled", () => {
		const { panel, reset } = setup({ heatDurationSec: 720 });
		fireEvent.click(within(panel).getByRole("button", { name: "Cancel" }));
		expect(reset).toHaveBeenCalledTimes(1);
	});

	it("keeps the input and shows the reason when the core refuses the format", () => {
		const { panel, actions } = setup({ heatDurationSec: -5 });
		save(panel);
		expect(actions).toEqual([]);
		const alert = within(panel).getByRole("alert");
		expect(alert.textContent).toContain("The format was not saved");
		expect(alert.textContent).toContain("Your input is kept.");
	});
});
