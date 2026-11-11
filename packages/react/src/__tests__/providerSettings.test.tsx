import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
	Board,
	BracketProvider,
	HeatCard,
	type BracketController,
} from "../index";
import { makeController } from "./helpers";

afterEach(cleanup);

const renderRiderName = (entry: { displayName: string }) => (
	<em data-testid="rider-name">{`<${entry.displayName}>`}</em>
);

function firstHeat(value: BracketController) {
	const round = value.bracket.rounds[0]!;
	return { round, heat: round.heats[0]! };
}

describe("BracketProvider settings", () => {
	it("gives a component outside a Board the rider names and classes of the provider", () => {
		const value = makeController();
		const { round, heat } = firstHeat(value);
		const { container } = render(
			<BracketProvider
				value={value}
				renderRiderName={renderRiderName}
				classNames={{ participant: "from-provider" }}
			>
				<HeatCard round={round} heat={heat} heatIndex={0} />
			</BracketProvider>,
		);
		expect(screen.getAllByTestId("rider-name")).toHaveLength(4);
		expect(screen.getByText("<Ann>")).toBeTruthy();
		expect(container.querySelectorAll(".from-provider")).toHaveLength(4);
	});

	it("lets a local prop override the provider and keeps the other settings", () => {
		const value = makeController();
		const { round, heat } = firstHeat(value);
		const { container } = render(
			<BracketProvider
				value={value}
				renderRiderName={renderRiderName}
				classNames={{ participant: "from-provider" }}
			>
				<Board
					renderRiderName={(entry) => <i>{`local ${entry.displayName}`}</i>}
					classNames={{ participant: "from-board" }}
				/>
				<HeatCard round={round} heat={heat} heatIndex={0} />
			</BracketProvider>,
		);
		expect(screen.queryAllByText("local Ann").length).toBeGreaterThan(0);
		expect(container.querySelector(".from-board")).not.toBeNull();
		expect(screen.getAllByText("<Ann>")).toHaveLength(1);
		expect(container.querySelectorAll(".from-provider")).toHaveLength(4);
	});

	it("renders two boards with different modes under one provider", () => {
		const value = makeController();
		render(
			<BracketProvider value={value} mode="admin">
				<Board headingLevel={2} />
				<Board mode="viewer" />
			</BracketProvider>,
		);
		expect(screen.getAllByRole("button", { name: "Add round" })).toHaveLength(
			1,
		);
	});
});
