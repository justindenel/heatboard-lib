import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
	scoringPresets,
	type Action,
	type Bracket,
	type HeatSlot,
} from "@heatboard/core";
import {
	BracketProvider,
	HeatboardProvider,
	JudgeRanking,
	useBracket,
} from "../index";
import { makeRaceBracket } from "./admin-helpers";

afterEach(cleanup);

function runningRace(slots?: HeatSlot[]): Bracket {
	const bracket = makeRaceBracket({
		status: "running",
		scoring: scoringPresets.windsurfWave,
	});
	const round = bracket.rounds[0]!;
	round.heats[0] = {
		...round.heats[0]!,
		status: "running",
		...(slots && { slots }),
	};
	return bracket;
}

function Harness(props: {
	bracket: Bracket;
	actions: Action[];
	locale?: "en" | "fr";
	standings?: Record<string, { rank: number }>;
	tiedRiderIds?: string[][];
}) {
	const controller = useBracket({
		defaultBracket: props.bracket,
		onChange: (_next, cause) => {
			if (cause.type === "action") props.actions.push(cause.action);
		},
	});
	const round = controller.bracket.rounds[0]!;
	return (
		<HeatboardProvider locale={props.locale ?? "en"}>
			<BracketProvider value={controller}>
				<JudgeRanking
					round={round}
					heat={round.heats[0]!}
					standings={props.standings}
					tiedRiderIds={props.tiedRiderIds}
				/>
			</BracketProvider>
		</HeatboardProvider>
	);
}

function setup(
	bracket: Bracket,
	locale?: "en" | "fr",
	standings?: Record<string, { rank: number }>,
) {
	const actions: Action[] = [];
	render(
		<Harness
			bracket={bracket}
			actions={actions}
			locale={locale}
			standings={standings}
		/>,
	);
	return actions;
}

describe("JudgeRanking", () => {
	it("moves a rider down and sends setRanks with override", () => {
		const actions = setup(runningRace());
		fireEvent.click(screen.getByRole("button", { name: "Move Ann down" }));
		expect(actions).toEqual([
			{
				type: "setRanks",
				heatId: "h1",
				riderIds: ["r2", "r1", "r3"],
				override: true,
			},
		]);
		const names = screen
			.getAllByRole("listitem")
			.map((li) => li.textContent?.replace(/^\d+/, ""));
		expect(names).toEqual(["Bob", "Ann", "Cy"]);
	});

	it("moves a rider up", () => {
		const actions = setup(runningRace());
		expect(
			screen.getAllByRole("button", { name: /^Move .* up$/ }),
		).toHaveLength(3);
		fireEvent.click(screen.getByRole("button", { name: "Move Cy up" }));
		expect(actions[0]).toMatchObject({
			riderIds: ["r1", "r3", "r2"],
			override: true,
		});
	});

	it("starts from the computed ranking, not from the draw", () => {
		const actions = setup(runningRace(), "en", {
			r1: { rank: 3 },
			r2: { rank: 1 },
			r3: { rank: 2 },
		});
		const names = () =>
			screen
				.getAllByRole("listitem")
				.map((li) => li.textContent?.replace(/^\d+/, ""));
		expect(names()).toEqual(["Bob", "Cy", "Ann"]);
		expect(screen.getByText("Computed from the notes")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Move Cy up" }));
		expect(actions[0]).toMatchObject({ riderIds: ["r3", "r2", "r1"] });
	});

	it("shows the manual order and goes back to the computed ranking", () => {
		const actions = setup(runningRace(), "en", {
			r1: { rank: 3 },
			r2: { rank: 1 },
			r3: { rank: 2 },
		});
		fireEvent.click(screen.getByRole("button", { name: "Move Cy up" }));
		expect(screen.getByText("Manual order active")).toBeTruthy();
		fireEvent.click(
			screen.getByRole("button", { name: "Back to the computed ranking" }),
		);
		expect(actions.at(-1)).toEqual({ type: "clearRanks", heatId: "h1" });
		expect(screen.queryByText("Manual order active")).toBeNull();
		expect(
			screen
				.getAllByRole("listitem")
				.map((li) => li.textContent?.replace(/^\d+/, "")),
		).toEqual(["Bob", "Cy", "Ann"]);
	});

	it("is collapsed by default and flags an active manual order in its summary", () => {
		setup(runningRace());
		const details = document.querySelector("details")!;
		expect(details.open).toBe(false);
		expect(details.querySelector("summary [role=status]")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Move Cy up" }));
		expect(details.open).toBe(false);
		expect(details.querySelector("summary")?.textContent).toContain(
			"Manual order active",
		);
	});

	it("leaves riders with a status out of the order", () => {
		const slots: HeatSlot[] = [
			{ riderId: "r1", rank: null },
			{ riderId: "r2", rank: null, status: "DNS" },
			{ riderId: "r3", rank: null },
		];
		setup(runningRace(slots));
		expect(screen.queryByRole("button", { name: "Move Bob down" })).toBeNull();
		expect(screen.getAllByRole("listitem")).toHaveLength(2);
	});

	it("renders nothing on a heat that is not running", () => {
		const bracket = runningRace();
		bracket.rounds[0]!.heats[0]!.status = "pending";
		const { container } = render(<Harness bracket={bracket} actions={[]} />);
		expect(container.querySelector(".hb-judge-ranking")).toBeNull();
	});

	it("speaks french", () => {
		setup(runningRace(), "fr");
		expect(
			screen.getByText("Forcer l'ordre du heat (exceptionnel)"),
		).toBeTruthy();
		expect(screen.getByRole("button", { name: "Descendre Ann" })).toBeTruthy();
	});

	it("opens itself and flags the tied riders after an unresolved tie", () => {
		const { rerender } = render(
			<Harness bracket={runningRace()} actions={[]} />,
		);
		const details = document.querySelector("details")!;
		expect(details.open).toBe(false);
		rerender(
			<Harness
				bracket={runningRace()}
				actions={[]}
				tiedRiderIds={[["r1", "r3"]]}
			/>,
		);
		expect(details.open).toBe(true);
		const rows = screen.getAllByRole("listitem");
		expect(rows.map((li) => li.getAttribute("data-tied"))).toEqual([
			"true",
			null,
			"true",
		]);
		expect(screen.getAllByText("Tied")).toHaveLength(2);
	});
});
