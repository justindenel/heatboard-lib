import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import type { Bracket } from "@heatboard/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	Board,
	BracketProvider,
	HeatboardProvider,
	RacePauseButton,
	type Locale,
} from "../index";
import { makeController } from "./helpers";
import { makeRaceBracket } from "./admin-helpers";

const START = "2026-03-01T10:00:00.000Z";
const RACE = { heatDurationSec: 600, breakSec: 120 };

function running(overrides: Partial<Bracket> = {}): Bracket {
	const base = makeRaceBracket({
		status: "running",
		timing: RACE,
		...overrides,
	});
	const [first, ...rest] = base.rounds[0]!.heats;
	return {
		...base,
		rounds: [
			{
				...base.rounds[0]!,
				heats: [
					{ ...first!, status: "running", startedAt: START, timing: RACE },
					...rest,
				],
			},
			base.rounds[1]!,
		],
	};
}

function mount(bracket: Bracket, locale: Locale = "en") {
	const controller = makeController(bracket);
	render(
		<HeatboardProvider locale={locale}>
			<BracketProvider value={controller}>
				<RacePauseButton />
				<Board mode="admin" />
			</BracketProvider>
		</HeatboardProvider>,
	);
	return controller;
}

const at = (seconds: number) => {
	vi.setSystemTime(new Date(Date.parse(START) + seconds * 1000));
};

beforeEach(() => {
	vi.useFakeTimers();
	at(60);
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe("RacePauseButton", () => {
	it("pauses during a heat, with its tooltip", () => {
		const controller = mount(running());
		const button = screen.getByRole("button", { name: "Pause the race" });
		expect(button.title).toBe(
			"The heat in progress runs to the end of its timer, then the race stops.",
		);
		fireEvent.click(button);
		expect(controller.dispatch).toHaveBeenCalledWith({ type: "pauseRace" });
	});

	it("shows the request, and a click cancels it", () => {
		const controller = mount(running({ chain: { pause: "requested" } }));
		const button = screen.getByRole("button", {
			name: "Pause after this heat",
		});
		expect(button.title).toBe(
			"The race will stop at the end of the heat in progress. Click to cancel.",
		);
		fireEvent.click(button);
		expect(controller.dispatch).toHaveBeenCalledWith({
			type: "cancelPauseRequest",
		});
	});

	it("resumes a paused race and announces the break", () => {
		at(15 * 60);
		const controller = mount(running({ chain: { pause: "paused" } }), "fr");
		const button = screen.getByRole("button", { name: "Reprendre" });
		expect(button.title).toBe(
			"La reprise commence par une pause de 2 min avant le heat suivant.",
		);
		fireEvent.click(button);
		expect(controller.dispatch).toHaveBeenCalledWith({ type: "resumeRace" });
	});

	it("is absent when the race has nothing to pause", () => {
		mount(makeRaceBracket({ status: "published" }));
		expect(screen.queryByRole("button", { name: /pause/i })).toBeNull();
	});

	it("is absent when the heats have no timer", () => {
		const bracket = running({ timing: {} });
		const [first] = bracket.rounds[0]!.heats;
		delete first!.timing;
		mount(bracket);
		expect(screen.queryByRole("button", { name: /pause/i })).toBeNull();
	});
});

describe("break countdown", () => {
	it("is shown on the next heat while the break runs", () => {
		at(10 * 60 + 60);
		mount(running());
		const timer = screen.getByText("Starts in 1:00");
		expect(timer.getAttribute("role")).toBe("timer");
		act(() => {
			vi.advanceTimersByTime(1000);
		});
		expect(screen.getByText("Starts in 0:59")).toBeTruthy();
	});

	it("is not shown while the heat is still running", () => {
		mount(running());
		expect(screen.queryByText(/Starts in/)).toBeNull();
	});
});
