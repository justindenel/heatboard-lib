import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { scoringPresets, type Bracket } from "@heatboard/core";
import {
	BracketProvider,
	HeatboardProvider,
	JudgePanel,
	useJudging,
	type Locale,
} from "../index";
import { makeController } from "./helpers";
import {
	actAsync,
	makeScoredBracket,
	makeServer,
	sequence,
	type FakeServer,
} from "./judging-helpers";

afterEach(cleanup);

function Harness(props: {
	bracket: Bracket;
	server: FakeServer;
	locale?: Locale;
}) {
	const [createId] = useState(() => sequence());
	const judging = useJudging({
		bracket: props.bracket,
		heatId: "h1",
		judgeId: "j1",
		server: props.server,
		createId,
	});
	return (
		<HeatboardProvider locale={props.locale ?? "en"}>
			<BracketProvider value={makeController(props.bracket)}>
				<JudgePanel heatId="h1" judging={judging} />
			</BracketProvider>
		</HeatboardProvider>
	);
}

async function renderPanel(
	bracket: Bracket = makeScoredBracket(),
	server: FakeServer = makeServer(),
	locale?: Locale,
) {
	const view = render(
		<Harness bracket={bracket} server={server} {...(locale && { locale })} />,
	);
	await actAsync(() => undefined);
	return { ...view, server };
}

const rowButton = (name: string) =>
	screen.getByRole("button", { name: `Score ${name}` });
const sheet = () => screen.getByRole("dialog");
const value = (text: string) =>
	within(sheet()).getByRole("button", { name: text });

async function note(rider: string, text: string) {
	fireEvent.click(rowButton(rider));
	await actAsync(() => {
		fireEvent.click(value(text));
	});
}

function withFrozenHeatScoring(): Bracket {
	const base = makeScoredBracket({
		scoring: {
			...scoringPresets.surf,
			scale: { min: 0, max: 5, step: 0.5 },
		},
	});
	const [round, ...rest] = base.rounds;
	const [heat, ...heats] = round!.heats;
	return {
		...base,
		rounds: [
			{
				...round!,
				heats: [{ ...heat!, scoring: scoringPresets.windsurfWave }, ...heats],
			},
			...rest,
		],
	};
}

describe("scoring changed after the heat started", () => {
	it("builds the grid from the heat's frozen scoring, not the bracket's", async () => {
		const { server } = await renderPanel(withFrozenHeatScoring());
		fireEvent.click(rowButton("Ann"));
		expect(within(sheet()).getByRole("radio", { name: "Jump" })).toBeTruthy();
		await actAsync(() => {
			fireEvent.click(value("7.5"));
		});
		expect(screen.getByRole("button", { name: "Wave: 7.5" })).toBeTruthy();
		expect(server.remote.notes.scores.map((s) => s.value)).toEqual([7.5]);
	});
});

describe("scoring a rider", () => {
	it("records a note with one tap on the value, closes the sheet and keeps the category", async () => {
		const { server } = await renderPanel();
		expect(screen.queryByRole("dialog")).toBeNull();

		fireEvent.click(rowButton("Ann"));
		expect(
			within(sheet()).getAllByRole("button", { name: /^\d+(\.5)?$/ }),
		).toHaveLength(21);
		await actAsync(() => {
			fireEvent.click(value("7.5"));
		});

		expect(screen.queryByRole("dialog")).toBeNull();
		expect(screen.getByRole("button", { name: "Wave: 7.5" })).toBeTruthy();
		expect(server.remote.notes.scores.map((s) => s.value)).toEqual([7.5]);
		expect(server.remote.notes.rides[0]).toMatchObject({
			riderId: "r1",
			type: "Wave",
		});

		fireEvent.click(rowButton("Bob"));
		fireEvent.click(within(sheet()).getByRole("radio", { name: "Jump" }));
		await actAsync(() => {
			fireEvent.click(value("6"));
		});
		fireEvent.click(rowButton("Cy"));
		expect(
			within(sheet())
				.getByRole("radio", { name: "Jump" })
				.getAttribute("aria-checked"),
		).toBe("true");
	});

	it("offers figures only for a category that has some, and clears the figure after each note", async () => {
		const { server } = await renderPanel();
		fireEvent.click(rowButton("Ann"));
		expect(
			within(sheet()).queryByRole("group", { name: /^Family / }),
		).toBeNull();

		fireEvent.click(within(sheet()).getByRole("radio", { name: "Jump" }));
		const families = within(sheet()).getAllByRole("group", {
			name: /^Family /,
		});
		expect(
			families.flatMap((family) => within(family).getAllByRole("button")),
		).toHaveLength(23);
		fireEvent.click(within(sheet()).getByRole("button", { name: "B" }));
		await actAsync(() => {
			fireEvent.click(value("8"));
		});

		const chip = screen.getByRole("button", { name: "Jump, B: 8" });
		expect(chip.textContent).toBe("8 B");
		expect(
			chip.closest("[data-category]")?.querySelector(".hb-judge-row__category")
				?.textContent,
		).toBe("Jump");
		expect(chip.title).toBe("Jump 8, B, counted");
		expect(server.remote.notes.rides[0]?.figure).toBe("B");
		expect(server.remote.notes.rides[0]).not.toHaveProperty("variant");

		fireEvent.click(rowButton("Ann"));
		fireEvent.click(within(sheet()).getByRole("radio", { name: "Jump" }));
		expect(
			within(sheet())
				.getAllByRole("group", { name: /^Family / })
				.flatMap((family) => within(family).getAllByRole("button"))
				.every((b) => b.getAttribute("aria-pressed") === "false"),
		).toBe(true);
	});

	it("records the variant of the figure and shows it on the chip", async () => {
		const { server } = await renderPanel();
		fireEvent.click(rowButton("Ann"));
		fireEvent.click(within(sheet()).getByRole("radio", { name: "Jump" }));
		fireEvent.click(within(sheet()).getByRole("button", { name: "B" }));
		const variants = within(sheet()).getByRole("radiogroup", {
			name: "Variant of B (optional)",
		});
		fireEvent.click(
			within(variants)
				.getAllByRole("radio")
				.find((r) => r.querySelector("b")?.textContent === "1F")!,
		);
		await actAsync(() => {
			fireEvent.click(value("8"));
		});
		expect(server.remote.notes.rides[0]).toMatchObject({
			type: "Jump",
			figure: "B",
			variant: "1F",
		});
		expect(screen.getByRole("button", { name: "Jump, B1F: 8" })).toBeTruthy();
	});

	it("drops the variant when the figure changes or does not accept it", async () => {
		const { server } = await renderPanel();
		fireEvent.click(rowButton("Ann"));
		fireEvent.click(within(sheet()).getByRole("radio", { name: "Jump" }));
		fireEvent.click(within(sheet()).getByRole("button", { name: "F" }));
		fireEvent.click(
			within(sheet())
				.getAllByRole("radio")
				.find((r) => r.querySelector("b")?.textContent === "SS")!,
		);
		fireEvent.click(within(sheet()).getByRole("button", { name: "CR" }));
		expect(
			within(sheet()).queryByRole("radiogroup", { name: /^Variant of/ }),
		).toBeNull();
		await actAsync(() => {
			fireEvent.click(value("6"));
		});
		expect(server.remote.notes.rides[0]).toMatchObject({ figure: "CR" });
		expect(server.remote.notes.rides[0]).not.toHaveProperty("variant");
	});

	it("shows one case per integer when the scale step is 1", async () => {
		const scoring = {
			...scoringPresets.windsurfWave,
			scale: { min: 0, max: 10, step: 1 },
		};
		await renderPanel(makeScoredBracket({ scoring }));
		fireEvent.click(rowButton("Ann"));
		const grid = within(sheet()).getByRole("group", { name: "Score" });
		expect(within(grid).getAllByRole("button")).toHaveLength(11);
		expect(within(grid).queryByRole("button", { name: "7.5" })).toBeNull();
	});

	it("shows this judge's total and rank on each row", async () => {
		await renderPanel();
		await note("Ann", "5");
		await note("Bob", "9");
		const bob = rowButton("Bob").closest("[data-rider-id]") as HTMLElement;
		expect(within(bob).getByText("#1")).toBeTruthy();
		expect(bob.querySelector(".hb-judge-row__figure")?.textContent).toBe(
			"9.00",
		);
		const ann = rowButton("Ann").closest("[data-rider-id]") as HTMLElement;
		expect(within(ann).getByText("#2")).toBeTruthy();
	});
});

describe("note chips", () => {
	it("edits a note from its menu", async () => {
		const { server } = await renderPanel();
		await note("Ann", "5");
		fireEvent.click(screen.getByRole("button", { name: "Wave: 5" }));
		fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
		expect(within(sheet()).getByText("Editing a score")).toBeTruthy();
		await actAsync(() => {
			fireEvent.click(value("9.5"));
		});
		expect(screen.getByRole("button", { name: "Wave: 9.5" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Wave: 5" })).toBeNull();
		expect(server.remote.notes.scores).toHaveLength(1);
		expect(server.remote.notes.scores[0]?.value).toBe(9.5);
	});

	it("deletes a note from its menu", async () => {
		const { server } = await renderPanel();
		await note("Ann", "5");
		fireEvent.click(screen.getByRole("button", { name: "Wave: 5" }));
		await actAsync(() => {
			fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
		});
		expect(screen.queryByRole("button", { name: "Wave: 5" })).toBeNull();
		expect(server.remote.notes.rides).toEqual([]);
	});

	it("undoes the last note from the toast", async () => {
		const { server } = await renderPanel();
		await note("Ann", "5");
		await actAsync(() => {
			fireEvent.click(screen.getByRole("button", { name: "Undo last score" }));
		});
		expect(screen.queryByRole("button", { name: "Wave: 5" })).toBeNull();
		expect(server.remote.notes.rides).toEqual([]);
	});

	it("closes the sheet and the menu with Escape", async () => {
		await renderPanel();
		await note("Ann", "5");
		fireEvent.click(screen.getByRole("button", { name: "Wave: 5" }));
		expect(screen.getByRole("menu")).toBeTruthy();
		fireEvent.keyDown(document, { key: "Escape" });
		expect(screen.queryByRole("menu")).toBeNull();

		fireEvent.click(rowButton("Bob"));
		expect(sheet()).toBeTruthy();
		fireEvent.keyDown(document, { key: "Escape" });
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});

describe("disabled states", () => {
	it("is read-only with the reason when the heat is not running", async () => {
		const bracket = makeScoredBracket();
		const idle: Bracket = {
			...bracket,
			rounds: bracket.rounds.map((round) => ({
				...round,
				heats: round.heats.map((heat) =>
					heat.id === "h1" ? { ...heat, status: "judged" as const } : heat,
				),
			})),
		};
		await renderPanel(idle);
		expect(
			screen.getByText("Scoring is closed: the heat is not running."),
		).toBeTruthy();
		expect(rowButton("Ann").hasAttribute("disabled")).toBe(true);
	});

	it("disables the inputs and says so once access is revoked", async () => {
		const server = makeServer();
		await renderPanel(makeScoredBracket(), server);
		server.failing.value = "revoked";
		await note("Ann", "5");
		expect(screen.getByText("Access revoked")).toBeTruthy();
		expect(screen.getByText(/access was revoked/)).toBeTruthy();
		expect(rowButton("Bob").hasAttribute("disabled")).toBe(true);
	});

	it("shows the sync indicator and labels in French", async () => {
		const server = makeServer();
		await renderPanel(makeScoredBracket(), server, "fr");
		expect(screen.getByText("Synchronisé")).toBeTruthy();
		server.failing.value = "network";
		fireEvent.click(screen.getByRole("button", { name: "Noter Ann" }));
		await actAsync(() => {
			fireEvent.click(within(sheet()).getByRole("button", { name: "7,5" }));
		});
		expect(screen.getByText("Non synchronisé")).toBeTruthy();
	});
});
