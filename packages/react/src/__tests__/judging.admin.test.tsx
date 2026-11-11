import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HeatData, Ride, Score } from "@heatboard/core";
import { Board, BracketProvider, HeatTimer } from "../index";
import {
	heatSection,
	makeRaceBracket,
	openHeatInspector,
	renderAdmin,
} from "./admin-helpers";
import { makeController } from "./helpers";
import { STARTED_AT, makeScoredBracket, placingsWave } from "./judging-helpers";
import { scoringPresets } from "@heatboard/core";

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

const AT = "2030-01-01T10:05:00.000Z";

function dataFor(values: Record<string, number>): HeatData {
	const rides: Ride[] = [];
	const scores: Score[] = [];
	Object.entries(values).forEach(([riderId, value], i) => {
		rides.push({ id: `ride${i}`, riderId, type: "Wave", at: AT });
		scores.push({ rideId: `ride${i}`, judgeId: "j1", value, at: AT });
	});
	return { rides, scores };
}

describe("starting a heat with a scoring", () => {
	it("stamps the start time", () => {
		const bracket = makeRaceBracket({ scoring: scoringPresets.windsurfWave });
		const { container, actions } = renderAdmin(bracket);
		fireEvent.click(
			within(heatSection(container, "h1")).getByRole("button", {
				name: "Start heat 1",
			}),
		);
		const action = actions[0];
		expect(action).toMatchObject({ type: "setHeatStatus", status: "running" });
		expect(Date.parse((action as { at: string }).at)).not.toBeNaN();
		expect(heatSection(container, "h1").dataset.status).toBe("running");
	});

	it("sends no time without a scoring", () => {
		const { container, actions } = renderAdmin(makeRaceBracket());
		fireEvent.click(
			within(heatSection(container, "h1")).getByRole("button", {
				name: "Start heat 1",
			}),
		);
		expect(actions[0]).toEqual({
			type: "setHeatStatus",
			heatId: "h1",
			status: "running",
		});
	});
});

describe("judging from scores", () => {
	it("ranks the heat from the host's notes", () => {
		const data = dataFor({ r1: 5, r2: 9, r3: 7 });
		const { container, actions } = renderAdmin(makeScoredBracket(), {
			board: { getHeatData: () => data },
		});
		const panel = openHeatInspector(container, "h1");
		fireEvent.click(within(panel).getByRole("button", { name: "Judge" }));

		expect(actions[0]).toMatchObject({
			type: "judgeHeatFromScores",
			heatId: "h1",
		});
		const heat = heatSection(container, "h1");
		expect(heat.dataset.status).toBe("judged");
		const rank = (riderId: string) =>
			heat.querySelector(`[data-rider-id="${riderId}"] [data-result="rank"]`)
				?.textContent;
		expect(rank("r2")).toContain("1");
		expect(rank("r3")).toContain("2");
		expect(rank("r1")).toContain("3");
	});

	it("keeps the plain judge action without host data", () => {
		const { container, actions } = renderAdmin(
			makeScoredBracket({ scoring: placingsWave }),
		);
		const panel = openHeatInspector(container, "h1");
		fireEvent.click(
			within(panel).getByRole("button", { name: "Rank by order" }),
		);
		fireEvent.click(within(panel).getByRole("button", { name: "Judge" }));
		expect(actions.at(-1)).toMatchObject({
			type: "setHeatStatus",
			status: "judged",
		});
	});

	it("refuses a tie naming the riders, then judges once ranked by hand", () => {
		const data = dataFor({ r1: 7, r2: 7, r3: 9 });
		const { container, actions } = renderAdmin(
			makeScoredBracket({ scoring: placingsWave }),
			{
				board: { getHeatData: () => data },
			},
		);
		const panel = openHeatInspector(container, "h1");
		const judge = within(panel).getByRole("button", { name: "Judge" });
		expect(judge.getAttribute("aria-disabled")).toBe("true");
		expect(judge.title).toContain("Tied after scoring: Ann = Bob.");
		fireEvent.click(judge);
		expect(actions).toHaveLength(0);

		fireEvent.click(
			within(panel).getByRole("button", { name: "Rank by order" }),
		);
		fireEvent.click(within(panel).getByRole("button", { name: "Judge" }));
		expect(actions.at(-1)).toMatchObject({
			type: "setHeatStatus",
			status: "judged",
		});
		expect(heatSection(container, "h1").dataset.status).toBe("judged");
	});
});

describe("totals on the board", () => {
	it("shows each rider's total next to the rank when the host provides data", () => {
		const data = dataFor({ r1: 5, r2: 9 });
		const { container } = renderAdmin(makeScoredBracket(), {
			board: { getHeatData: () => data },
		});
		const total = (riderId: string) =>
			heatSection(container, "h1")
				.querySelector(`[data-rider-id="${riderId}"] .hb-total`)
				?.getAttribute("data-total");
		expect(total("r1")).toBe("5");
		expect(total("r2")).toBe("9");
		const shown = heatSection(container, "h1").querySelector(
			'[data-rider-id="r1"] .hb-total [aria-hidden="true"]',
		);
		expect(shown?.textContent).toBe("5.00");
	});

	it("shows none without host data or on a pending heat", () => {
		const { container } = renderAdmin(makeScoredBracket());
		expect(container.querySelector(".hb-total")).toBeNull();
		const pending = renderAdmin(
			makeRaceBracket({ scoring: scoringPresets.windsurfWave }),
			{
				board: { getHeatData: () => dataFor({ r1: 5 }) },
			},
		);
		expect(pending.container.querySelector(".hb-total")).toBeNull();
	});
});

describe("HeatTimer", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(AT));
	});

	it("counts the remaining time down every second", () => {
		render(
			<BracketProvider value={makeController(makeScoredBracket())}>
				<HeatTimer heatId="h1" />
			</BracketProvider>,
		);
		expect(STARTED_AT < AT).toBe(true);
		const timer = screen.getByRole("timer");
		expect(timer.textContent).toBe("7:00");
		expect(timer.getAttribute("aria-label")).toBe("7:00 remaining");
		act(() => {
			vi.advanceTimersByTime(1000);
		});
		expect(screen.getByRole("timer").textContent).toBe("6:59");
	});

	it("flags the end of the time", () => {
		vi.setSystemTime(new Date("2030-01-01T10:13:00.000Z"));
		render(
			<BracketProvider value={makeController(makeScoredBracket())}>
				<HeatTimer heatId="h1" />
			</BracketProvider>,
		);
		const timer = screen.getByRole("timer");
		expect(timer.textContent).toBe("0:00");
		expect(timer.getAttribute("aria-label")).toBe("Time is up");
	});

	it("shows the elapsed time when the round has no duration", () => {
		const bracket = makeScoredBracket();
		const noDuration = { ...bracket };
		delete noDuration.timing;
		render(
			<BracketProvider value={makeController(noDuration)}>
				<HeatTimer heatId="h1" />
			</BracketProvider>,
		);
		expect(screen.getByRole("timer").textContent).toBe("5:00");
	});

	it("renders nothing for a heat that has not started", () => {
		const { container } = render(
			<BracketProvider value={makeController(makeScoredBracket())}>
				<HeatTimer heatId="h2" />
			</BracketProvider>,
		);
		expect(container.querySelector("time")).toBeNull();
	});

	it("appears on the card of a running heat", () => {
		const { container } = render(
			<BracketProvider value={makeController(makeScoredBracket())}>
				<Board />
			</BracketProvider>,
		);
		expect(
			within(heatSection(container, "h1")).getByRole("timer").textContent,
		).toBe("7:00");
		expect(
			within(heatSection(container, "h2")).queryByRole("timer"),
		).toBeNull();
	});
});
