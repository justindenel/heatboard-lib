import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
	scoringPresets,
	type Bracket,
	type HeatData,
	type Ride,
} from "@heatboard/core";
import {
	Board,
	BracketProvider,
	HeadJudgePanel,
	HeatboardProvider,
	JudgePanel,
	useHeadJudging,
	useJudging,
	type Locale,
} from "../index";
import {
	heatSection,
	inspector,
	openBracketInspector,
	openHeatInspector,
	renderAdmin,
} from "./admin-helpers";
import { makeController } from "./helpers";
import {
	actAsync,
	makeHeadJudgeBracket,
	makeHeadServer,
	makeScoredBracket,
	makeServer,
	placingsWave,
	sequence,
	type FakeHeadServer,
} from "./judging-helpers";

afterEach(cleanup);

const T1 = "2030-01-01T10:01:00.000Z";
const T2 = "2030-01-01T10:02:00.000Z";
const T3 = "2030-01-01T10:03:00.000Z";
const ride = (id: string, riderId: string, at: string, extra = {}): Ride => ({
	id,
	riderId,
	type: "Wave",
	at,
	...extra,
});

function JudgeHarness(props: {
	bracket: Bracket;
	server: FakeHeadServer;
	locale?: Locale;
}) {
	const judging = useJudging({
		bracket: props.bracket,
		heatId: "h1",
		judgeId: "j1",
		server: props.server,
		now: () => T3,
	});
	return (
		<HeatboardProvider locale={props.locale ?? "en"}>
			<BracketProvider value={makeController(props.bracket)}>
				<JudgePanel heatId="h1" judging={judging} />
			</BracketProvider>
		</HeatboardProvider>
	);
}

function HeadHarness(props: { bracket: Bracket; server: FakeHeadServer }) {
	const headJudging = useHeadJudging({
		bracket: props.bracket,
		heatId: "h1",
		server: props.server,
		judgeCount: 3,
		createId: sequence("ride"),
		now: () => T3,
	});
	return (
		<HeatboardProvider locale="en">
			<BracketProvider value={makeController(props.bracket)}>
				<HeadJudgePanel heatId="h1" headJudging={headJudging} />
			</BracketProvider>
		</HeatboardProvider>
	);
}

async function renderJudge(server: FakeHeadServer) {
	const view = render(
		<JudgeHarness bracket={makeHeadJudgeBracket()} server={server} />,
	);
	await actAsync(() => undefined);
	return view;
}

const queue = () => screen.getByRole("region", { name: "Heat 1" });
const card = (name: string) => within(queue()).getByRole("group", { name });
const cards = () =>
	[...queue().querySelectorAll<HTMLElement>(".hb-judge-queue__item")].map((c) =>
		c.getAttribute("aria-label"),
	);
const value = (group: HTMLElement, text: string) =>
	within(group).getByRole("button", { name: text });
const action = (group: HTMLElement, name: RegExp | string) =>
	within(group).getByRole<HTMLButtonElement>("button", { name });
const dialog = () => screen.getByRole("dialog");
const grid = (text: string) =>
	within(dialog()).getByRole("button", { name: text });

describe("judge page in head-judge mode", () => {
	const seed = () =>
		makeHeadServer({
			rides: [
				ride("b", "r2", T2, { type: "Jump", figure: "B" }),
				ride("a", "r1", T1),
			],
		});

	it("lists the queue oldest first with rider, category, figure and heat time", async () => {
		await renderJudge(seed());
		const items = [
			...queue().querySelectorAll<HTMLElement>(".hb-judge-queue__item"),
		];
		expect(cards()).toEqual(["Score Ann, Wave", "Score Bob, Jump, B"]);
		expect(items[0]?.textContent).toContain("1:00");
		expect(items[1]?.textContent).toContain("2:00");
		expect(items[1]?.textContent).toContain("B");
	});

	it("shows the value picker of every queued ride without opening anything", async () => {
		await renderJudge(seed());
		expect(screen.queryByRole("dialog")).toBeNull();
		for (const name of ["Score Ann, Wave", "Score Bob, Jump, B"]) {
			const group = card(name);
			expect(value(group, "0")).toBeTruthy();
			expect(value(group, "7.5")).toBeTruthy();
			expect(value(group, "10")).toBeTruthy();
		}
	});

	it("keeps a separate draft per card and sends nothing until Confirm", async () => {
		const server = seed();
		await renderJudge(server);
		const ann = card("Score Ann, Wave");
		const bob = card("Score Bob, Jump, B");
		expect(action(ann, /^Confirm/).disabled).toBe(true);

		fireEvent.click(value(ann, "7.5"));
		fireEvent.click(value(bob, "4"));
		fireEvent.click(value(ann, "8"));
		expect(value(ann, "7.5").getAttribute("aria-pressed")).toBe("false");
		expect(value(ann, "8").getAttribute("aria-pressed")).toBe("true");
		expect(value(bob, "4").getAttribute("aria-pressed")).toBe("true");
		expect(action(ann, "Confirm 8").disabled).toBe(false);
		expect(action(bob, "Confirm 4").disabled).toBe(false);
		expect(server.save).not.toHaveBeenCalled();
	});

	it("sends only its own card on Confirm and keeps the other drafts", async () => {
		const server = seed();
		await renderJudge(server);
		fireEvent.click(value(card("Score Ann, Wave"), "8"));
		fireEvent.click(value(card("Score Bob, Jump, B"), "4"));

		await actAsync(() => {
			fireEvent.click(action(card("Score Ann, Wave"), "Confirm 8"));
		});
		expect(server.remote.scores.map((s) => [s.rideId, s.value])).toEqual([
			["a", 8],
		]);
		expect(cards()).toEqual(["Score Bob, Jump, B"]);
		expect(
			value(card("Score Bob, Jump, B"), "4").getAttribute("aria-pressed"),
		).toBe("true");
	});

	it("sends not seen with Not seen, for that card only", async () => {
		const server = seed();
		await renderJudge(server);
		fireEvent.click(value(card("Score Bob, Jump, B"), "4"));
		await actAsync(() => {
			fireEvent.click(action(card("Score Ann, Wave"), "Not seen"));
		});
		expect(server.remote.scores.map((s) => [s.rideId, s.value])).toEqual([
			["a", null],
		]);
		expect(cards()).toEqual(["Score Bob, Jump, B"]);
		expect(
			value(card("Score Bob, Jump, B"), "4").getAttribute("aria-pressed"),
		).toBe("true");
		expect(screen.getByRole("button", { name: "Wave, not seen" })).toBeTruthy();
	});

	it("drops the draft of a ride that was retracted", async () => {
		const server = seed();
		await renderJudge(server);
		fireEvent.click(value(card("Score Ann, Wave"), "8"));
		fireEvent.click(value(card("Score Bob, Jump, B"), "4"));

		await actAsync(() => {
			server.push((remote) => {
				remote.rides = remote.rides.filter((r) => r.id !== "a");
			});
		});
		expect(cards()).toEqual(["Score Bob, Jump, B"]);
		expect(
			value(card("Score Bob, Jump, B"), "4").getAttribute("aria-pressed"),
		).toBe("true");
	});

	it("shows one line per category and lets the judge change a given note", async () => {
		const server = seed();
		await renderJudge(server);
		for (const [name, text] of [
			["Score Ann, Wave", "6"],
			["Score Bob, Jump, B", "9"],
		] as const) {
			fireEvent.click(value(card(name), text));
			await actAsync(() => {
				fireEvent.click(action(card(name), `Confirm ${text}`));
			});
		}
		const ann = document.querySelector('[data-rider-id="r1"]')!;
		const bob = document.querySelector('[data-rider-id="r2"]')!;
		expect(
			[...ann.querySelectorAll("[data-category]")].map((l) =>
				l.getAttribute("data-category"),
			),
		).toEqual(["Wave"]);
		expect(
			[...bob.querySelectorAll("[data-category]")].map((l) =>
				l.getAttribute("data-category"),
			),
		).toEqual(["Jump"]);

		fireEvent.click(screen.getByRole("button", { name: "Wave: 6" }));
		expect(dialog().textContent).toContain("Editing a score");
		fireEvent.click(grid("7"));
		await actAsync(() => {
			fireEvent.click(
				within(dialog()).getByRole("button", { name: "Confirm" }),
			);
		});
		expect(server.remote.scores.find((s) => s.rideId === "a")?.value).toBe(7);

		fireEvent.click(screen.getByRole("button", { name: "Wave: 7" }));
		await actAsync(() => {
			fireEvent.click(
				within(dialog()).getByRole("button", { name: "Not seen" }),
			);
		});
		expect(
			server.remote.scores.find((s) => s.rideId === "a")?.value,
		).toBeNull();
	});

	it("shows a rider's Wave and Jump notes on separate lines in free mode too", async () => {
		const server = makeServer({
			rides: [
				{ id: "n1", riderId: "r1", type: "Wave", at: T1 },
				{ id: "n2", riderId: "r1", type: "Jump", at: T2, figure: "B" },
			],
			scores: [
				{ rideId: "n1", judgeId: "j1", value: 5, at: T1 },
				{ rideId: "n2", judgeId: "j1", value: 6, at: T2 },
			],
		});
		const bracket = makeScoredBracket();
		function Free() {
			const judging = useJudging({
				bracket,
				heatId: "h1",
				judgeId: "j1",
				server,
			});
			return (
				<HeatboardProvider locale="en">
					<BracketProvider value={makeController(bracket)}>
						<JudgePanel heatId="h1" judging={judging} />
					</BracketProvider>
				</HeatboardProvider>
			);
		}
		render(<Free />);
		await actAsync(() => undefined);
		const ann = document.querySelector('[data-rider-id="r1"]')!;
		expect(
			[...ann.querySelectorAll("[data-category]")].map((l) => [
				l.getAttribute("data-category"),
				l.querySelectorAll("button").length,
			]),
		).toEqual([
			["Wave", 1],
			["Jump", 1],
		]);
	});
});

describe("head judge page", () => {
	async function renderHead(server = makeHeadServer()) {
		render(<HeadHarness bracket={makeHeadJudgeBracket()} server={server} />);
		await actAsync(() => undefined);
		return server;
	}

	it("announces a ride from a category, then an optional figure and variant", async () => {
		const server = await renderHead();
		const announce = async () => {
			await actAsync(() => {
				fireEvent.click(
					within(dialog()).getByRole("button", { name: "Announce the ride" }),
				);
			});
		};
		const ask = (rider: string) =>
			fireEvent.click(
				screen.getByRole("button", { name: `Announce a ride for ${rider}` }),
			);
		const category = (name: string) =>
			fireEvent.click(within(dialog()).getByRole("radio", { name }));

		ask("Ann");
		expect(
			within(dialog()).getByRole("button", { name: "Announce the ride" }),
		).toHaveProperty("disabled", true);
		category("Wave");
		await announce();
		expect(server.remote.rides).toEqual([
			{ id: "ride1", riderId: "r1", type: "Wave", at: T3 },
		]);
		expect(screen.queryByRole("dialog")).toBeNull();

		ask("Bob");
		category("Jump");
		fireEvent.click(within(dialog()).getByRole("button", { name: "DF" }));
		await announce();
		expect(server.remote.rides[1]).toMatchObject({
			riderId: "r2",
			type: "Jump",
			figure: "DF",
		});
		expect(server.remote.rides[1]).not.toHaveProperty("variant");

		ask("Cy");
		category("Jump");
		await announce();
		expect(server.remote.rides[2]).not.toHaveProperty("figure");
	});

	it("groups the figures by family and records the variant of the figure", async () => {
		const server = await renderHead();
		fireEvent.click(
			screen.getByRole("button", { name: "Announce a ride for Ann" }),
		);
		fireEvent.click(within(dialog()).getByRole("radio", { name: "Jump" }));
		const families = within(dialog()).getAllByRole("group", {
			name: /^Family /,
		});
		expect(families.map((g) => g.getAttribute("aria-label"))).toEqual([
			"Family Forward",
			"Family Backward",
			"Family Combined",
			"Family Other",
		]);
		fireEvent.click(within(dialog()).getByRole("button", { name: "F" }));
		const variants = within(dialog()).getByRole("radiogroup", {
			name: "Variant of F (optional)",
		});
		expect(
			within(variants)
				.getByRole("radio", { name: "None" })
				.getAttribute("aria-checked"),
		).toBe("true");
		const oneHand = within(variants)
			.getAllByRole("radio")
			.find((r) => r.querySelector("b")?.textContent === "1H")!;
		fireEvent.click(oneHand);
		expect(dialog().textContent).toContain("F1H · Forward");
		await actAsync(() => {
			fireEvent.click(
				within(dialog()).getByRole("button", { name: "Announce the ride" }),
			);
		});
		expect(server.remote.rides[0]).toMatchObject({
			type: "Jump",
			figure: "F",
			variant: "1H",
		});
	});

	it("lists announced rides newest first with their progress", async () => {
		const server = makeHeadServer({
			rides: [ride("a", "r1", T1), ride("b", "r2", T2)],
			scores: [
				{ rideId: "a", judgeId: "j1", value: 5, at: T1 },
				{ rideId: "a", judgeId: "j2", value: 6, at: T1 },
				{ rideId: "a", judgeId: "j3", value: null, at: T1 },
			],
		});
		await renderHead(server);
		const items = [...document.querySelectorAll("[data-ride-id]")];
		expect(items.map((i) => i.getAttribute("data-ride-id"))).toEqual([
			"b",
			"a",
		]);
		expect(items[0]?.textContent).toContain("0/3 scored");
		expect(items[1]?.textContent).toContain("2/3 scored · 1 not seen");
	});

	it("retracts a ride after a confirmation, with its scores", async () => {
		const server = makeHeadServer({
			rides: [ride("a", "r1", T1)],
			scores: [{ rideId: "a", judgeId: "j1", value: 5, at: T1 }],
		});
		await renderHead(server);
		fireEvent.click(screen.getByRole("button", { name: "Retract Ann, Wave" }));
		expect(server.remote.rides).toHaveLength(1);
		expect(screen.getByRole("alert").textContent).toContain(
			"Retract this ride?",
		);
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(server.remote.rides).toHaveLength(1);

		fireEvent.click(screen.getByRole("button", { name: "Retract Ann, Wave" }));
		await actAsync(() => {
			fireEvent.click(screen.getByRole("button", { name: "Yes, retract" }));
		});
		expect(server.remote.rides).toEqual([]);
		expect(server.remote.scores).toEqual([]);
		expect(document.querySelector("[data-ride-id]")).toBeNull();
	});
});

describe("ride means in the live notes", () => {
	const data: HeatData = {
		rides: [
			ride("a1", "r1", T1),
			ride("a2", "r1", T2),
			ride("a4", "r1", T3),
			ride("a3", "r1", T3, { type: "Jump", figure: "B" }),
			ride("b1", "r2", T1),
		],
		scores: [
			{ rideId: "a1", judgeId: "j1", value: 6, at: T1 },
			{ rideId: "a1", judgeId: "j2", value: 7, at: T1 },
			{ rideId: "a2", judgeId: "j1", value: 4, at: T2 },
			{ rideId: "a2", judgeId: "j2", value: null, at: T2 },
			{ rideId: "a4", judgeId: "j1", value: 2, at: T3 },
			{ rideId: "a4", judgeId: "j2", value: 3, at: T3 },
			{ rideId: "a3", judgeId: "j1", value: 8, at: T3 },
			{ rideId: "a3", judgeId: "j2", value: 9, at: T3 },
			{ rideId: "b1", judgeId: "j1", value: 5, at: T1 },
			{ rideId: "b1", judgeId: "j2", value: 5, at: T1 },
		],
	};
	const annRow = (panel: HTMLElement) =>
		[...panel.querySelectorAll<HTMLElement>(".hb-inspector__rider")].find(
			(li) => li.textContent?.includes("Ann"),
		)!;

	it("shows ride means per category, counted ones highlighted, subtotal and total", () => {
		const { container } = renderAdmin(makeHeadJudgeBracket(), {
			board: { getHeatData: () => data },
		});
		const ann = annRow(openHeatInspector(container, "h1"));
		const wave = ann.querySelector('[data-category="Wave"]')!;
		expect(
			[...wave.querySelectorAll(".hb-note")].map((c) => c.textContent),
		).toEqual(["W 6.50", "W 4.00", "W 2.50"]);
		expect(wave.querySelectorAll('[data-counted="true"]')).toHaveLength(2);
		expect(
			wave.querySelector(".hb-inspector__subtotal")?.textContent,
		).toContain("10.50");
		expect(wave.querySelector(".hb-inspector__indicative")).toBeNull();
		const jump = ann.querySelector('[data-category="Jump"]')!;
		expect(jump.querySelector(".hb-note")?.textContent).toBe("J 8.50 B");
		expect(ann.querySelector("[data-total]")?.textContent).toContain("19.00");
	});

	it("labels the ride means indicative with the points method", () => {
		const bracket = makeHeadJudgeBracket({
			scoring: { ...scoringPresets.windsurfWave, method: "points" },
		});
		const { container } = renderAdmin(bracket, {
			board: { getHeatData: () => data },
		});
		const ann = annRow(openHeatInspector(container, "h1"));
		const wave = ann.querySelector('[data-category="Wave"]')!;
		expect(wave.querySelector(".hb-inspector__indicative")?.textContent).toBe(
			"indicative",
		);
		expect(wave.querySelectorAll('[data-counted="true"]')).toHaveLength(0);
	});

	it("shows the judges detail with not seen marked, from the admin toggle", () => {
		const { container } = renderAdmin(makeHeadJudgeBracket(), {
			board: { getHeatData: () => data },
		});
		const panel = openHeatInspector(container, "h1");
		fireEvent.click(
			within(panel).getByRole("switch", { name: "Judge details" }),
		);
		const lines = [...annRow(panel).querySelectorAll(".hb-inspector__judge")];
		expect(lines.map((l) => l.textContent)).toEqual([
			"J1W 6W 4W 2J 8 B",
			"J2W 7W –W 3J 9 B",
		]);
	});
});

describe("viewer display", () => {
	it("follows the method defaults in the viewer view and honours the settings", () => {
		const data: HeatData = {
			rides: [ride("a1", "r1", T1)],
			scores: [{ rideId: "a1", judgeId: "j1", value: 6, at: T1 }],
		};
		const show = (bracket: Bracket) => {
			const { container, unmount } = render(
				<BracketProvider value={makeController(bracket)}>
					<BoardForViewer data={data} />
				</BracketProvider>,
			);
			fireEvent.click(
				within(heatSection(container, "h1")).getByRole("button", {
					name: "Open the panel of Heat 1",
				}),
			);
			const panel = inspector();
			const result = {
				chips: panel.querySelectorAll(".hb-note").length,
				judges: panel.querySelectorAll(".hb-inspector__judge").length,
				subtotal: panel.querySelectorAll(".hb-inspector__subtotal").length,
			};
			unmount();
			return result;
		};
		expect(show(makeHeadJudgeBracket())).toEqual({
			chips: 1,
			judges: 0,
			subtotal: 1,
		});
		expect(
			show(makeHeadJudgeBracket({ viewerDisplay: { rides: false } })),
		).toMatchObject({ chips: 0, subtotal: 1 });
		expect(
			show(makeHeadJudgeBracket({ viewerDisplay: { judges: true } })),
		).toMatchObject({ judges: 1 });
		expect(
			show(makeHeadJudgeBracket({ viewerDisplay: { typeSubtotals: false } })),
		).toMatchObject({ subtotal: 0 });
	});

	it("lets an admin edit the options that make sense for the method", () => {
		const rideMeans = renderAdmin(makeHeadJudgeBracket());
		const panel = openBracketInspector(rideMeans.container);
		const control = panel.querySelector<HTMLElement>(".hb-viewer-display")!;
		const labelsOf = () =>
			[...control.querySelectorAll("label")].map((l) => l.textContent?.trim());
		expect(labelsOf()).toEqual([
			"Subtotal per category",
			"Ride details",
			"Judges' notes",
		]);
		const ridesBox = within(control).getByLabelText("Ride details");
		expect((ridesBox as HTMLInputElement).checked).toBe(true);
		fireEvent.click(ridesBox);
		expect(rideMeans.actions).toContainEqual({
			type: "setViewerDisplay",
			display: { rides: false },
		});
		expect((ridesBox as HTMLInputElement).checked).toBe(false);
		rideMeans.unmount();

		const placings = renderAdmin(
			makeHeadJudgeBracket({
				judgingMode: "free",
				scoring: placingsWave,
			}),
		);
		const placingsPanel = openBracketInspector(placings.container);
		expect(
			[...placingsPanel.querySelectorAll(".hb-viewer-display label")].map((l) =>
				l.textContent?.trim(),
			),
		).toEqual([
			"Ride details (indicative)",
			"Places of each judge",
			"Judges' notes",
		]);
	});
});

function BoardForViewer(props: { data: HeatData }) {
	return <Board getHeatData={() => props.data} />;
}

describe("head judge page when the scoring changed after the heat started", () => {
	it("offers the categories of the heat's frozen scoring", async () => {
		const base = makeHeadJudgeBracket();
		const [round, ...rest] = base.rounds;
		const [heat, ...heats] = round!.heats;
		const bracket: Bracket = {
			...base,
			scoring: {
				...base.scoring!,
				categories: [{ type: "Other", counted: 1 }],
			},
			rounds: [
				{ ...round!, heats: [{ ...heat!, scoring: base.scoring! }, ...heats] },
				...rest,
			],
		};
		render(<HeadHarness bracket={bracket} server={makeHeadServer()} />);
		await actAsync(() => undefined);
		fireEvent.click(
			screen.getByRole("button", { name: "Announce a ride for Ann" }),
		);
		const categories = within(dialog()).getAllByRole("radio");
		expect(categories.some((b) => b.textContent === "Jump")).toBe(true);
		expect(categories.some((b) => b.textContent === "Other")).toBe(false);
	});
});
