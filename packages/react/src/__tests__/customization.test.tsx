import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
	Board,
	BracketProvider,
	HeatboardProvider,
	type EmptySlotProps,
	type HeatStatusBadgeProps,
	type LycraStripeProps,
	type ParticipantRowProps,
	type ResultBadgeProps,
	type RoundColumnProps,
} from "../index";
import { makeController } from "./helpers";

afterEach(cleanup);

function renderBoard(ui: React.ReactElement) {
	return render(
		<BracketProvider value={makeController()}>{ui}</BracketProvider>,
	);
}

describe("component replacement", () => {
	it("passes the original props to a replacement RoundColumn", () => {
		const seen: RoundColumnProps[] = [];
		renderBoard(
			<Board
				components={{
					RoundColumn: (props) => {
						seen.push(props);
						return <div data-testid="round">{props.round.name}</div>;
					},
				}}
			/>,
		);
		expect(screen.getAllByTestId("round")).toHaveLength(2);
		expect(seen[1]).toMatchObject({ round: { id: "round2" }, roundIndex: 1 });
	});

	it("passes the original props to a replacement EmptySlot", () => {
		const seen: EmptySlotProps[] = [];
		renderBoard(
			<Board
				components={{
					EmptySlot: (props) => {
						seen.push(props);
						return <span data-testid="empty" />;
					},
				}}
			/>,
		);
		expect(screen.getAllByTestId("empty")).toHaveLength(6);
		expect(seen[0]).toMatchObject({ heat: { id: "h2" }, index: 2 });
	});

	it("passes the original props to a replacement ResultBadge", () => {
		const seen: ResultBadgeProps[] = [];
		renderBoard(
			<Board
				components={{
					ResultBadge: (props) => {
						seen.push(props);
						return <b data-testid="result" />;
					},
				}}
			/>,
		);
		expect(screen.getAllByTestId("result")).toHaveLength(6);
		expect(seen[0]).toMatchObject({ slot: { riderId: "r1" }, qualified: true });
		expect(seen[2]).toMatchObject({
			slot: { status: "DNF" },
			qualified: false,
		});
	});

	it("passes the original props to a replacement HeatStatusBadge", () => {
		const seen: HeatStatusBadgeProps[] = [];
		renderBoard(
			<Board
				components={{
					HeatStatusBadge: (props) => {
						seen.push(props);
						return <b data-testid="heat-status">{props.status}</b>;
					},
				}}
			/>,
		);
		expect(screen.getAllByTestId("heat-status")).toHaveLength(3);
		expect(seen.map((p) => p.status)).toEqual(["judged", "pending", "pending"]);
	});

	it("passes the original props to a replacement LycraStripe", () => {
		const seen: LycraStripeProps[] = [];
		renderBoard(
			<Board
				lycraColors={["red", "blue"]}
				components={{
					LycraStripe: (props) => {
						seen.push(props);
						return <i data-testid="stripe" />;
					},
				}}
			/>,
		);
		expect(screen.getAllByTestId("stripe")).toHaveLength(6);
		expect(seen.slice(0, 3).map((p) => p.color)).toEqual([
			"red",
			"blue",
			"red",
		]);
	});

	it("keeps ol > li structure with a replacement that renders a div", () => {
		const { container } = renderBoard(
			<Board
				components={{
					ParticipantRow: (props: ParticipantRowProps) => (
						<div>{props.slot.riderId}</div>
					),
					EmptySlot: () => <div>free</div>,
				}}
			/>,
		);
		const lists = container.querySelectorAll(".hb-heat__participants");
		expect(lists).toHaveLength(3);
		for (const list of lists) {
			expect(list.tagName).toBe("OL");
			expect([...list.children].every((c) => c.tagName === "LI")).toBe(true);
			expect([...list.children].every((c) => c.children.length === 1)).toBe(
				true,
			);
		}
		expect(
			container.querySelectorAll(".hb-heat__participants > li"),
		).toHaveLength(4 + 4 + 4);
	});

	it("never nests an li inside the default pieces", () => {
		const { container } = renderBoard(<Board />);
		expect(
			container.querySelectorAll(".hb-participant li, .hb-empty-slot li"),
		).toHaveLength(0);
		expect(container.querySelectorAll(".hb-participant")).toHaveLength(6);
		expect(container.querySelectorAll(".hb-participant")[0]?.tagName).toBe(
			"DIV",
		);
	});
});

describe("qualified marker", () => {
	it("keeps a screen reader text on the qualified row", () => {
		const { container } = renderBoard(<Board />);
		const rows = container.querySelectorAll("[data-qualified='true']");
		expect(rows).toHaveLength(2);
		for (const row of rows) {
			expect(row.querySelectorAll(":scope > .hb-visually-hidden")).toHaveLength(
				1,
			);
		}
	});
});

describe("lycra color names", () => {
	const labelsOf = (container: HTMLElement) =>
		[...container.querySelectorAll("[data-color]")].map((el) =>
			el.getAttribute("aria-label"),
		);

	it("translates default color names", () => {
		const { container } = render(
			<HeatboardProvider locale="fr">
				<BracketProvider value={makeController()}>
					<Board lycraColors={["red", "white", "grey", "#abc123"]} />
				</BracketProvider>
			</HeatboardProvider>,
		);
		expect(labelsOf(container).slice(0, 4)).toEqual([
			"Lycra : rouge",
			"Lycra : blanche",
			"Lycra : grise",
			"Lycra : #abc123",
		]);
	});

	it("uses English names by default", () => {
		const { container } = renderBoard(
			<Board lycraColors={["pink", "purple"]} />,
		);
		expect(labelsOf(container).slice(0, 2)).toEqual([
			"Lycra: pink",
			"Lycra: purple",
		]);
	});
});

describe("nested HeatboardProvider", () => {
	it("inherits unset values and merges labels over the parent's", () => {
		const { container } = render(
			<HeatboardProvider
				locale="fr"
				colorScheme="dark"
				labels={{ emptySlot: "Libre", needsReview: "Contrôler" }}
			>
				<HeatboardProvider labels={{ needsReview: "A verifier" }}>
					<BracketProvider value={makeController()}>
						<Board />
					</BracketProvider>
				</HeatboardProvider>
			</HeatboardProvider>,
		);
		const root = container.querySelector(".hb-board")!;
		expect(root.getAttribute("lang")).toBe("fr");
		expect(root.getAttribute("data-hb-color-scheme")).toBe("dark");
		expect(screen.getAllByText("Libre")).toHaveLength(6);
		expect(screen.getAllByText("A verifier")).toHaveLength(1);
		expect(screen.getAllByText("Jugé")).toHaveLength(1);
	});

	it("lets the child override locale and color scheme", () => {
		const { container } = render(
			<HeatboardProvider locale="fr" colorScheme="dark">
				<HeatboardProvider locale="en" colorScheme="light">
					<BracketProvider value={makeController()}>
						<Board />
					</BracketProvider>
				</HeatboardProvider>
			</HeatboardProvider>,
		);
		const root = container.querySelector(".hb-board")!;
		expect(root.getAttribute("lang")).toBe("en");
		expect(root.getAttribute("data-hb-color-scheme")).toBe("light");
		expect(screen.getAllByText("Open slot")).toHaveLength(6);
	});
});

describe("headingLevel", () => {
	const levels = (container: HTMLElement) => ({
		board: container.querySelectorAll("h2").length,
		h3: container.querySelectorAll("h3").length,
		h4: container.querySelectorAll("h4").length,
		h5: container.querySelectorAll("h5").length,
		h6: container.querySelectorAll("h6").length,
	});

	it("defaults to h2 / h3 / h4", () => {
		const { container } = renderBoard(<Board />);
		expect(levels(container)).toEqual({ board: 1, h3: 2, h4: 3, h5: 0, h6: 0 });
	});

	it("shifts rounds and heats with the board level", () => {
		const { container } = renderBoard(<Board headingLevel={4} />);
		expect(container.querySelectorAll("h2")).toHaveLength(0);
		expect(container.querySelectorAll("h4")).toHaveLength(1);
		expect(container.querySelectorAll("h5")).toHaveLength(2);
		expect(container.querySelectorAll("h6")).toHaveLength(3);
	});

	it("caps heat headings at h6", () => {
		const { container } = renderBoard(<Board headingLevel={5} />);
		expect(container.querySelectorAll("h5")).toHaveLength(1);
		expect(container.querySelectorAll("h6")).toHaveLength(2 + 3);
	});
});
