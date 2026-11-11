import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
	scoringPresets,
	type Action,
	type Bracket,
	type Penalty,
} from "@heatboard/core";
import {
	BracketProvider,
	HeatboardProvider,
	JudgePenalties,
	useBracket,
} from "../index";
import { makeRaceBracket } from "./admin-helpers";

afterEach(cleanup);

function runningRace(penalties?: Penalty[]): Bracket {
	const bracket = makeRaceBracket({
		status: "running",
		scoring: scoringPresets.windsurfWave,
	});
	const round = bracket.rounds[0]!;
	round.heats[0] = {
		...round.heats[0]!,
		status: "running",
		...(penalties && { penalties }),
	};
	return bracket;
}

function Harness(props: { bracket: Bracket; actions: Action[] }) {
	const controller = useBracket({
		defaultBracket: props.bracket,
		onChange: (_next, cause) => {
			if (cause.type === "action") props.actions.push(cause.action);
		},
	});
	const round = controller.bracket.rounds[0]!;
	return (
		<HeatboardProvider>
			<BracketProvider value={controller}>
				<JudgePenalties
					round={round}
					heat={round.heats[0]!}
					riders={{ r1: "Ada Doe" }}
					getRiderLabel={(entry, rider) => rider ?? entry.displayName}
				/>
			</BracketProvider>
		</HeatboardProvider>
	);
}

function setup(bracket: Bracket) {
	const actions: Action[] = [];
	render(<Harness bracket={bracket} actions={actions} />);
	return actions;
}

describe("JudgePenalties", () => {
	it("adds a penalty without a Board around it", () => {
		const actions = setup(runningRace());
		expect(screen.getByText("No penalty.")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Add penalty · Cy" }));
		expect(actions).toEqual([
			{
				type: "addPenalty",
				heatId: "h1",
				penalty: { riderId: "r3", type: "Wave", kind: "zeroBest" },
			},
		]);
	});

	it("removes a penalty and names the rider through getRiderLabel", () => {
		const actions = setup(
			runningRace([{ riderId: "r1", type: "Wave", kind: "zeroBest" }]),
		);
		fireEvent.click(
			screen.getByRole("button", {
				name: "Remove Ada Doe · Wave · Best ride at 0",
			}),
		);
		expect(actions).toEqual([
			{
				type: "removePenalty",
				heatId: "h1",
				penalty: { riderId: "r1", type: "Wave", kind: "zeroBest" },
			},
		]);
	});

	it("renders nothing once the heat is no longer running", () => {
		const bracket = runningRace();
		bracket.rounds[0]!.heats[0]!.status = "judged";
		setup(bracket);
		expect(
			screen.queryAllByRole("button", { name: /^Add penalty/ }),
		).toHaveLength(0);
	});
});
