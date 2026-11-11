import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Bracket, Entry } from "@heatboard/core";
import {
	Board,
	BracketProvider,
	EntryPool,
	HeadJudgePanel,
	HeatboardProvider,
	JudgePanel,
	useHeadJudging,
	useJudging,
} from "../index";
import {
	heatSection,
	makeJudgedRace,
	makeRaceBracket,
	openHeatInspector,
	openRoundInspector,
	renderAdmin,
} from "./admin-helpers";
import { makeController } from "./helpers";
import {
	actAsync,
	makeHeadJudgeBracket,
	makeHeadServer,
	makeScoredBracket,
	makeServer,
	sequence,
} from "./judging-helpers";

afterEach(cleanup);

const blank = (bracket: Bracket): Bracket => ({
	...bracket,
	entries: bracket.entries.map((entry) => ({ ...entry, displayName: "" })),
});

const getRiderLabel = (entry: Entry) => `Name ${entry.riderId}`;

describe("ParticipantStatusList", () => {
	it("labels names and status menus with getRiderLabel", () => {
		const { container } = renderAdmin(blank(makeRaceBracket()), {
			board: { getRiderLabel },
		});
		const panel = openHeatInspector(container, "h1");
		expect(within(panel).getByText("Name r1")).toBeTruthy();
		expect(
			within(panel).getByRole("button", { name: /Status of Name r1/ }),
		).toBeTruthy();
	});

	it("falls back to the rider id without getRiderLabel", () => {
		const { container } = renderAdmin(blank(makeRaceBracket()));
		const panel = openHeatInspector(container, "h1");
		expect(within(panel).getByText("r1")).toBeTruthy();
		expect(
			within(panel).getByRole("button", { name: /Status of r1/ }),
		).toBeTruthy();
	});

	it("keeps displayName when it is set", () => {
		const { container } = renderAdmin(makeRaceBracket(), {
			board: { getRiderLabel: (entry) => `X ${entry.displayName}` },
		});
		const panel = openHeatInspector(container, "h1");
		expect(within(panel).getByText("X Ann")).toBeTruthy();
	});
});

describe("visible names", () => {
	it("falls back to getRiderLabel when renderRiderName is absent", () => {
		const { container } = renderAdmin(blank(makeRaceBracket()), {
			board: { getRiderLabel },
		});
		expect(heatSection(container, "h1").textContent).toContain("Name r2");
	});

	it("prefers renderRiderName for the visible name", () => {
		const { container } = renderAdmin(blank(makeRaceBracket()), {
			board: {
				getRiderLabel,
				renderRiderName: (entry) => `Rendered ${entry.riderId}`,
			},
		});
		const text = heatSection(container, "h1").textContent;
		expect(text).toContain("Rendered r2");
		expect(text).not.toContain("Name r2");
	});
});

function renderPool(props: Partial<Parameters<typeof EntryPool>[0]> = {}) {
	return render(
		<HeatboardProvider>
			<BracketProvider value={makeController(blank(makeRaceBracket()))}>
				<EntryPool
					roundId="round1"
					mode="admin"
					defaultCollapsed={false}
					{...props}
				/>
			</BracketProvider>
		</HeatboardProvider>,
	);
}

describe("EntryPool and EntryMenu", () => {
	it("shows the label in the chip and the menu aria-labels", () => {
		renderPool({ getRiderLabel });
		expect(screen.getByText("Name r5")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: /Name r5/ }));
		expect(screen.getByRole("group", { name: /Name r5/ })).toBeTruthy();
		expect(screen.getByRole("spinbutton", { name: /Name r5/ })).toBeTruthy();
		expect(screen.getByRole("button", { name: /Remove Name r5/ })).toBeTruthy();
	});

	it("falls back to the rider id", () => {
		renderPool();
		expect(screen.getByText("r5")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: /r5/ }));
		expect(screen.getByRole("spinbutton", { name: /r5/ })).toBeTruthy();
	});
});

describe("ConfirmDialog", () => {
	it("names riders with getRiderLabel in the impact", () => {
		const { container } = renderAdmin(blank(makeJudgedRace()), {
			board: { getRiderLabel },
		});
		const select = within(
			openRoundInspector(container, "round1"),
		).getByLabelText("Qualified");
		fireEvent.change(select, { target: { value: "1" } });
		expect(
			within(screen.getByRole("alertdialog")).getByText(
				"Name r2 is no longer qualified",
			),
		).toBeTruthy();
	});

	it("falls back to the rider id", () => {
		const { container } = renderAdmin(blank(makeJudgedRace()));
		const select = within(
			openRoundInspector(container, "round1"),
		).getByLabelText("Qualified");
		fireEvent.change(select, { target: { value: "1" } });
		expect(
			within(screen.getByRole("alertdialog")).getByText(
				"r2 is no longer qualified",
			),
		).toBeTruthy();
	});
});

describe("tie message", () => {
	const scores = (values: Record<string, number>) => {
		const at = "2030-01-01T10:05:00.000Z";
		const entries = Object.entries(values);
		return {
			rides: entries.map(([riderId], i) => ({
				id: `ride${i}`,
				riderId,
				type: "Wave",
				at,
			})),
			scores: entries.map(([, value], i) => ({
				rideId: `ride${i}`,
				judgeId: "j1",
				value,
				at,
			})),
		};
	};

	it("names tied riders with getRiderLabel", () => {
		const data = scores({ r1: 7, r2: 7, r3: 9 });
		const { container } = renderAdmin(blank(makeScoredBracket()), {
			board: { getRiderLabel, getHeatData: () => data },
		});
		const panel = openHeatInspector(container, "h1");
		expect(
			within(panel).getByRole("button", { name: "Judge" }).title,
		).toContain("Tied after scoring: Name r1 = Name r2.");
	});

	it("falls back to the rider id", () => {
		const data = scores({ r1: 7, r2: 7, r3: 9 });
		const { container } = renderAdmin(blank(makeScoredBracket()), {
			board: { getHeatData: () => data },
		});
		const panel = openHeatInspector(container, "h1");
		expect(
			within(panel).getByRole("button", { name: "Judge" }).title,
		).toContain("Tied after scoring: r1 = r2.");
	});
});

const judgedBracket = blank(makeScoredBracket());
const headBracket = blank(makeHeadJudgeBracket());
const headServer = makeHeadServer();
const judgeServer = makeServer();

function JudgeHarness(props: { withLabel: boolean }) {
	const bracket = judgedBracket;
	const judging = useJudging({
		bracket,
		heatId: "h1",
		judgeId: "j1",
		server: judgeServer,
		createId: sequence(),
	});
	return (
		<HeatboardProvider>
			<BracketProvider value={makeController(bracket)}>
				<JudgePanel
					heatId="h1"
					judging={judging}
					{...(props.withLabel && { getRiderLabel })}
				/>
			</BracketProvider>
		</HeatboardProvider>
	);
}

describe("JudgePanel", () => {
	it("labels rows with getRiderLabel", async () => {
		render(<JudgeHarness withLabel />);
		await actAsync(() => undefined);
		expect(screen.getByRole("button", { name: "Score Name r1" })).toBeTruthy();
		expect(screen.getByText("Name r1")).toBeTruthy();
	});

	it("falls back to the rider id", async () => {
		render(<JudgeHarness withLabel={false} />);
		await actAsync(() => undefined);
		expect(screen.getByRole("button", { name: "Score r1" })).toBeTruthy();
	});
});

function HeadHarness(props: { withLabel: boolean }) {
	const bracket = headBracket;
	const headJudging = useHeadJudging({
		bracket,
		heatId: "h1",
		server: headServer,
		judgeCount: 3,
		createId: sequence("ride"),
	});
	return (
		<HeatboardProvider>
			<BracketProvider value={makeController(bracket)}>
				<HeadJudgePanel
					heatId="h1"
					headJudging={headJudging}
					{...(props.withLabel && { getRiderLabel })}
				/>
			</BracketProvider>
		</HeatboardProvider>
	);
}

describe("HeadJudgePanel", () => {
	it("labels rows with getRiderLabel", async () => {
		render(<HeadHarness withLabel />);
		await actAsync(() => undefined);
		expect(
			screen.getByRole("button", { name: "Announce a ride for Name r1" }),
		).toBeTruthy();
	});

	it("falls back to the rider id", async () => {
		render(<HeadHarness withLabel={false} />);
		await actAsync(() => undefined);
		expect(
			screen.getByRole("button", { name: "Announce a ride for r1" }),
		).toBeTruthy();
	});
});

describe("Board", () => {
	it("passes getRiderLabel to nested components", () => {
		render(
			<HeatboardProvider>
				<BracketProvider value={makeController(blank(makeRaceBracket()))}>
					<Board mode="admin" getRiderLabel={getRiderLabel} />
				</BracketProvider>
			</HeatboardProvider>,
		);
		expect(screen.getAllByText("Name r1").length).toBeGreaterThan(0);
	});
});
