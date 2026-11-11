import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	Board,
	BracketProvider,
	HeatboardProvider,
	HeatCard,
	ParticipantRow,
	type BracketController,
	type HeatCardProps,
	type ParticipantRowProps,
} from "../index";
import { makeDisplayBracket } from "./helpers";

afterEach(cleanup);

function controller(): BracketController {
	return {
		bracket: makeDisplayBracket(),
		dispatch: vi.fn(),
		canApply: vi.fn(),
		pending: false,
		error: null,
		clearError: vi.fn(),
	};
}

function Wrap({ children }: { children: ReactNode }) {
	return <BracketProvider value={controller()}>{children}</BracketProvider>;
}

function root(container: HTMLElement): HTMLElement {
	return container.querySelector<HTMLElement>(".hb-board, [role='region']")!;
}

describe("Board rendering", () => {
	it("renders rounds, heats, participants and open slots", () => {
		const { container } = render(
			<Wrap>
				<Board />
			</Wrap>,
		);
		expect(container.querySelectorAll("section[data-round-id]")).toHaveLength(
			2,
		);
		expect(container.querySelectorAll("section[data-heat-id]")).toHaveLength(3);
		expect(container.querySelectorAll("[data-rider-id]")).toHaveLength(6);
		expect(container.querySelectorAll(".hb-empty-slot")).toHaveLength(2 + 4);
		expect(screen.queryAllByRole("heading", { name: "Round 1" })).toHaveLength(
			1,
		);
		expect(
			screen.queryAllByRole("heading", { name: "Special heat" }),
		).toHaveLength(1);
		// Heats are numbered across the whole bracket, not per round.
		expect(screen.getAllByRole("heading", { name: "Heat 1" })).toHaveLength(1);
		expect(screen.getAllByRole("heading", { name: "Heat 3" })).toHaveLength(1);
		// The round column already names the round; a named heat keeps its number.
		expect(
			[...container.querySelectorAll(".hb-heat__round")].map(
				(tag) => tag.textContent,
			),
		).toEqual([" · Heat 2"]);
	});

	it("shows round size and qualification count", () => {
		render(
			<Wrap>
				<Board />
			</Wrap>,
		);
		expect(screen.getAllByText("4 per heat")).toHaveLength(2);
		expect(screen.queryAllByText("2 qualified")).toHaveLength(1);
		expect(screen.queryAllByText("1 qualified")).toHaveLength(1);
	});

	it("renders DNF, DSQ and DNS as text", () => {
		render(
			<Wrap>
				<Board />
			</Wrap>,
		);
		for (const [code, full] of [
			["DNF", "Did not finish"],
			["DSQ", "Disqualified"],
			["DNS", "Did not start"],
		] as const) {
			const sigil = screen.getByText(code);
			expect(sigil.getAttribute("title")).toBe(full);
			expect(sigil.getAttribute("aria-hidden")).toBe("true");
			expect(screen.queryAllByText(full)).toHaveLength(1);
		}
	});

	it("marks qualified riders and flags heats to review", () => {
		const { container } = render(
			<Wrap>
				<Board />
			</Wrap>,
		);
		const qualified = container.querySelectorAll("[data-qualified='true']");
		expect(
			[...qualified].map((el) => el.getAttribute("data-rider-id")),
		).toEqual(["r1", "r2"]);
		expect(qualified[0]?.classList.contains("hb-participant--qualified")).toBe(
			true,
		);
		expect(
			within(qualified[0] as HTMLElement).queryAllByText("Qualified"),
		).toHaveLength(1);
		expect(screen.getAllByText("Needs review")).toHaveLength(1);
		expect(screen.queryAllByText("Judged")).toHaveLength(1);
	});
});

describe("locale", () => {
	it("updates texts and lang when the provider locale changes", () => {
		const value = controller();
		const tree = (locale: "en" | "fr") => (
			<HeatboardProvider locale={locale}>
				<BracketProvider value={value}>
					<Board />
				</BracketProvider>
			</HeatboardProvider>
		);
		const { container, rerender } = render(tree("en"));
		expect(screen.queryAllByText("Judged")).toHaveLength(1);
		expect(screen.queryAllByText("2 qualified")).toHaveLength(1);
		expect(root(container).getAttribute("lang")).toBe("en");

		rerender(tree("fr"));
		expect(screen.queryAllByText("Jugé")).toHaveLength(1);
		expect(screen.queryAllByText("2 qualifiés")).toHaveLength(1);
		expect(screen.getAllByRole("heading", { name: "Heat 1" })).toHaveLength(1);
		expect(screen.getAllByRole("heading", { name: "Heat 3" })).toHaveLength(1);
		expect(screen.getAllByText("Place libre")).toHaveLength(6);
		expect(root(container).getAttribute("lang")).toBe("fr");
	});

	it("applies label overrides from the provider and from the board", () => {
		render(
			<HeatboardProvider labels={{ emptySlot: "Free" }}>
				<Wrap>
					<Board labels={{ needsReview: "Check me" }} />
				</Wrap>
			</HeatboardProvider>,
		);
		expect(screen.getAllByText("Free")).toHaveLength(6);
		expect(screen.queryAllByText("Check me")).toHaveLength(1);
	});

	it("works without a provider", () => {
		const { container } = render(
			<Wrap>
				<Board />
			</Wrap>,
		);
		expect(root(container).getAttribute("lang")).toBe("en");
		expect(root(container).getAttribute("data-hb-theme")).toBe("classic");
	});
});

describe("customization", () => {
	it("replaces HeatCard and ParticipantRow with the same props", () => {
		const cardProps: HeatCardProps[] = [];
		const rowProps: ParticipantRowProps[] = [];
		render(
			<Wrap>
				<Board
					components={{
						HeatCard: (props) => {
							cardProps.push(props);
							return <div data-testid="card">{props.heat.id}</div>;
						},
					}}
				/>
			</Wrap>,
		);
		expect(screen.getAllByTestId("card")).toHaveLength(3);
		expect(cardProps[0]).toMatchObject({
			round: { id: "round1" },
			heat: { id: "h1" },
			heatIndex: 0,
		});
		cleanup();

		render(
			<Wrap>
				<Board
					components={{
						ParticipantRow: (props) => {
							rowProps.push(props);
							return <div data-testid="row">{props.slot.riderId}</div>;
						},
					}}
				/>
			</Wrap>,
		);
		expect(screen.getAllByTestId("row")).toHaveLength(6);
		expect(rowProps[0]).toMatchObject({
			slot: { riderId: "r1" },
			index: 0,
			qualified: true,
			entry: { displayName: "Ann" },
		});
		expect(rowProps[2]?.qualified).toBe(false);
	});

	it("applies classNames and styles on top of built-in classes", () => {
		const { container } = render(
			<Wrap>
				<Board
					classNames={{ heat: "custom-heat" }}
					styles={{ board: { padding: "7px" } }}
				/>
			</Wrap>,
		);
		const heat = container.querySelector("section[data-heat-id]")!;
		expect(heat.classList.contains("hb-heat")).toBe(true);
		expect(heat.classList.contains("custom-heat")).toBe(true);
		expect(
			(container.querySelector(".hb-board") as HTMLElement).style.padding,
		).toBe("7px");
	});

	it("drops every hb- class when unstyled", () => {
		const { container } = render(
			<Wrap>
				<Board
					unstyled
					classNames={{ heat: "custom-heat" }}
					styles={{ participant: { color: "red" } }}
				/>
			</Wrap>,
		);
		expect(container.querySelector("[class*='hb-']")).toBeNull();
		expect(container.querySelector(".custom-heat")).not.toBeNull();
		expect(
			(container.querySelector("[data-rider-id]") as HTMLElement).style.color,
		).toBe("red");
	});

	it("renders host rider records through renderRiderName", () => {
		render(
			<Wrap>
				<Board<{ sail: string }>
					riders={{ r1: { sail: "FRA 12" } }}
					renderRiderName={(entry, rider) =>
						rider ? `${entry.displayName} #${rider.sail}` : entry.displayName
					}
				/>
			</Wrap>,
		);
		expect(screen.queryAllByText("Ann #FRA 12")).toHaveLength(1);
		expect(screen.queryAllByText("Bob")).toHaveLength(1);
	});

	it("uses custom lycra colors", () => {
		const { container } = render(
			<Wrap>
				<Board
					getLycraColor={(_slot, index) => (index === 0 ? "pink" : undefined)}
				/>
			</Wrap>,
		);
		const stripes = container.querySelectorAll("[data-color]");
		expect(stripes).toHaveLength(2);
		expect(stripes[0]?.getAttribute("data-color")).toBe("pink");
	});

	it("assigns lycra colors by position by default", () => {
		const { container } = render(
			<Wrap>
				<Board lycraColors={["red", "blue"]} />
			</Wrap>,
		);
		const first = container.querySelector("section[data-heat-id='h1']")!;
		const colors = [...first.querySelectorAll("[data-color]")].map((el) =>
			el.getAttribute("data-color"),
		);
		expect(colors).toEqual(["red", "blue", "red", "blue"]);
	});
});

describe("standalone pieces", () => {
	it("renders a HeatCard inside a BracketProvider without a Board", () => {
		const value = controller();
		const round = value.bracket.rounds[0]!;
		const heat = round.heats[0]!;
		const { container } = render(
			<BracketProvider value={value}>
				<HeatCard round={round} heat={heat} heatIndex={0} />
			</BracketProvider>,
		);
		expect(screen.queryAllByRole("heading", { name: "Heat 1" })).toHaveLength(
			1,
		);
		expect(container.querySelectorAll("[data-rider-id]")).toHaveLength(4);
		expect(container.querySelector("[data-qualified='true']")).not.toBeNull();
	});

	it("names the round in the header of a HeatCard outside a round column", () => {
		const value = controller();
		const round = value.bracket.rounds[0]!;
		const { container } = render(
			<BracketProvider value={value}>
				<HeatCard round={round} heat={round.heats[0]!} heatIndex={0} />
			</BracketProvider>,
		);
		expect(container.querySelector(".hb-heat__round")?.textContent).toBe(
			" · Round 1",
		);
	});

	it("shows a cut rider name in full in its tooltip, and only then", () => {
		const { container } = render(
			<Wrap>
				<Board />
			</Wrap>,
		);
		const name = container.querySelector<HTMLElement>(".hb-participant__name")!;
		const sizes = (scrollWidth: number) =>
			Object.defineProperties(name, {
				scrollWidth: { value: scrollWidth, configurable: true },
				clientWidth: { value: 100, configurable: true },
			});
		sizes(100);
		fireEvent.mouseEnter(name);
		expect(name.hasAttribute("title")).toBe(false);
		sizes(140);
		fireEvent.mouseEnter(name);
		expect(name.getAttribute("title")).toBe(name.textContent);
	});

	it("renders a ParticipantRow alone", () => {
		const value = controller();
		const round = value.bracket.rounds[0]!;
		const heat = round.heats[0]!;
		render(
			<BracketProvider value={value}>
				<ul>
					<ParticipantRow
						round={round}
						heat={heat}
						slot={heat.slots[0]!}
						index={0}
						entry={value.bracket.entries[0]}
						qualified
					/>
				</ul>
			</BracketProvider>,
		);
		expect(screen.queryAllByText("Ann")).toHaveLength(1);
		expect(screen.queryAllByText("1st")).toHaveLength(1);
	});
});
