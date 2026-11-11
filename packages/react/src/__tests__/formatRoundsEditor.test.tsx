import { useState } from "react";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultPlan, type FormatPlan } from "@heatboard/core";
import {
	FormatPlacementSection,
	FormatPlacementZoom,
	FormatRoundsEditor,
	HeatboardProvider,
	type FormatRoundsEditorProps,
} from "../index";

afterEach(cleanup);

type PlanSpy = (plan: FormatPlan, round: number | null) => void;

const plan32 = () =>
	defaultPlan({ riders: 32, heats: 8, advance: 2, repechage: false });
const plan16 = (repechage = false) =>
	defaultPlan({ riders: 16, heats: 4, advance: 2, repechage });

function Host(
	props: {
		initial: FormatPlan;
		onPlan?: (plan: FormatPlan, round: number | null) => void;
	} & Partial<FormatRoundsEditorProps>,
) {
	const { initial, onPlan, ...rest } = props;
	const [plan, setPlan] = useState(initial);
	return (
		<FormatRoundsEditor
			plan={plan}
			onChange={(next, round) => {
				setPlan(next);
				onPlan?.(next, round);
			}}
			{...rest}
		/>
	);
}

const row = (name: string) =>
	screen
		.getByRole("rowheader", { name: new RegExp(`^${name}`) })
		.closest("tr")!;

const press = (name: string | RegExp) =>
	fireEvent.click(screen.getByRole("button", { name }));

describe("round-1 inputs and rows", () => {
	it("shows one row per round, round 1 read-only and the riders arriving", () => {
		render(<Host initial={plan32()} />);
		const first = row("Round 1");
		expect(within(first).getByText("set above")).toBeTruthy();
		expect(within(first).queryByRole("button")).toBeNull();
		expect(within(first).getByText("32 arrive")).toBeTruthy();
		expect(within(row("Quarter-finals")).getByText("16 arrive")).toBeTruthy();
		expect(within(row("Final")).queryByLabelText(/Heats: more/)).toBeNull();
	});

	it("has a seeds column: none on round 1, a stepper elsewhere that feeds the round", () => {
		const onPlan = vi.fn<PlanSpy>();
		render(<Host initial={plan32()} onPlan={onPlan} />);
		expect(
			screen.getByRole("columnheader", { name: "Seeds entering here" }),
		).toBeTruthy();
		expect(
			within(row("Round 1")).queryByLabelText(/Seeds entering here/),
		).toBeNull();
		const quarter = row("Quarter-finals");
		expect(
			within(quarter).getByLabelText("Quarter-finals · Seeds entering here")
				.textContent,
		).toBe("0");
		expect(
			within(quarter)
				.getByLabelText("Quarter-finals · Seeds entering here: less")
				.hasAttribute("disabled"),
		).toBe(true);
		press("Quarter-finals · Seeds entering here: more");
		const last = onPlan.mock.lastCall?.[0] as FormatPlan;
		expect(last.rounds[1]?.seedSlots).toBe(1);
		expect(onPlan.mock.lastCall?.[1]).toBe(1);
		expect(within(row("Round 1")).getByText("31 arrive")).toBeTruthy();
		expect(screen.getByText("17 arrive (1 seeded)")).toBeTruthy();
	});

	it("reports more seeds than riders as an error", () => {
		const plan = plan16();
		const rounds = plan.rounds.map((r, i) =>
			i === 1 ? { ...r, seedSlots: 17 } : r,
		);
		render(<Host initial={{ ...plan, rounds }} />);
		expect(screen.getByRole("alert").textContent).toContain(
			"more seeds than riders",
		);
	});

	it("refills the rounds when the round-1 inputs change", () => {
		const onPlan = vi.fn<PlanSpy>();
		render(<Host initial={plan32()} onPlan={onPlan} />);
		fireEvent.change(screen.getByLabelText("Riders"), {
			target: { value: "64" },
		});
		expect(
			onPlan.mock.lastCall?.[0].rounds.map((r: { heats: number }) => r.heats),
		).toEqual([8, 2, 1]);
		press("Heats in round 1: more");
		const last = onPlan.mock.lastCall?.[0] as FormatPlan;
		expect(last.rounds[0]).toMatchObject({ heats: 9, auto: false });
		expect(screen.queryByText("modified")).toBeNull();
	});

	it("marks a round modified when its heats change, and recalculates the auto ones", () => {
		const onPlan = vi.fn<PlanSpy>();
		render(<Host initial={plan32()} onPlan={onPlan} />);
		expect(screen.getAllByText("auto")).toHaveLength(3);
		press("Quarter-finals · Heats: less");
		expect(onPlan.mock.lastCall?.[1]).toBe(1);
		expect(within(row("Round 2")).getByText("modified")).toBeTruthy();
		expect(screen.getAllByText("modified")).toHaveLength(1);
	});

	const menus = () => screen.getAllByRole("button", { name: /^Options for/ });

	it("has the ⋯ menu on the rounds between round 1 and the final only", () => {
		render(<Host initial={plan32()} />);
		expect(menus().map((b) => b.getAttribute("aria-label"))).toEqual([
			"Options for Quarter-finals",
			"Options for Semi-finals",
		]);
	});

	it("puts the following rounds back to auto with ↺ suite", () => {
		render(<Host initial={plan32()} />);
		press("Semi-finals · Heats: more");
		expect(screen.getAllByText("modified").length).toBeGreaterThan(0);
		fireEvent.click(menus()[0]!);
		press("↺ following rounds");
		expect(screen.queryByText("modified")).toBeNull();
		expect(screen.queryByRole("group", { name: /^Options for/ })).toBeNull();
	});

	it("removes a round through the menu and turns the following ones modified", () => {
		const onPlan = vi.fn<PlanSpy>();
		render(<Host initial={plan32()} onPlan={onPlan} />);
		fireEvent.click(menus()[0]!);
		press("Remove");
		expect(onPlan.mock.lastCall?.[0].rounds).toHaveLength(3);
		expect(onPlan.mock.lastCall?.[1]).toBe(1);
		expect(screen.getAllByText("modified").length).toBeGreaterThan(0);
	});

	it("adds a modified round before the final", () => {
		const onPlan = vi.fn<PlanSpy>();
		render(<Host initial={plan32()} onPlan={onPlan} />);
		press("+ Add a round before the final");
		expect(onPlan.mock.lastCall?.[0].rounds).toHaveLength(5);
		expect(onPlan.mock.lastCall?.[1]).toBe(3);
		expect(screen.getAllByText("modified")).toHaveLength(1);
	});

	it("offers the repechage on every round but the one before the final, with its own row", () => {
		render(<Host initial={plan32()} />);
		expect(screen.getByLabelText("Quarter-finals · Repechage")).toBeTruthy();
		expect(screen.queryByLabelText("Semi-finals · Repechage")).toBeNull();
		expect(screen.queryByLabelText("Final · Repechage")).toBeNull();
		expect(screen.queryByRole("rowheader", { name: /^Repechage/ })).toBeNull();
		fireEvent.click(screen.getByLabelText("Quarter-finals · Repechage"));
		const repechage = row("Repechage 2");
		expect(within(repechage).getByText("auto")).toBeTruthy();
		press("Repechage 2 · Heats: more");
		expect(within(row("Repechage 2")).getByText("modified")).toBeTruthy();
		expect(within(row("Quarter-finals")).getByText("auto")).toBeTruthy();
	});

	it("takes the repechage after round 1 from the start fields", () => {
		render(<Host initial={plan16()} />);
		const box = screen.getByLabelText<HTMLInputElement>(
			"Repechage after round 1",
		);
		expect(box.checked).toBe(false);
		fireEvent.click(box);
		expect(
			screen.getByRole("rowheader", { name: /^Repechage 1/ }),
		).toBeTruthy();
	});

	it("shows the small final choice", () => {
		const onPlan = vi.fn<PlanSpy>();
		render(<Host initial={plan32()} onPlan={onPlan} />);
		fireEvent.click(screen.getByLabelText("Small final"));
		expect(onPlan.mock.lastCall?.[0].smallFinal).toBe(true);
	});

	it("lists the blocking errors as alerts and the warnings apart", () => {
		render(
			<Host
				initial={defaultPlan({
					riders: 3,
					heats: 3,
					advance: 2,
					repechage: false,
				})}
			/>,
		);
		expect(screen.getByRole("list", { name: "Checks" }).textContent).toContain(
			"a heat has a single rider",
		);
		cleanup();
		render(
			<Host
				initial={defaultPlan({
					riders: 20,
					heats: 4,
					advance: 2,
					repechage: false,
				})}
			/>,
		);
		fireEvent.change(screen.getByLabelText("Riders"), {
			target: { value: "2" },
		});
		expect(screen.getByRole("alert").textContent).toContain(
			"a heat has no rider",
		);
	});

	it("speaks French with the French provider", () => {
		render(
			<HeatboardProvider locale="fr">
				<Host initial={plan32()} />
			</HeatboardProvider>,
		);
		expect(screen.getByText("réglé ci-dessus")).toBeTruthy();
		expect(screen.getByRole("rowheader", { name: /^Quarts/ })).toBeTruthy();
		expect(screen.getByText("+ Ajouter un tour avant la finale")).toBeTruthy();
		expect(screen.getByLabelText("Petite finale")).toBeTruthy();
		expect(screen.getByText("Plus d'options")).toBeTruthy();
	});
});

describe("collapsible rows", () => {
	it("summarises the rounds and opens on request", () => {
		render(<Host initial={plan32()} collapsible />);
		const toggle = screen.getByRole("button", { name: /Adjust the rounds/ });
		expect(toggle.textContent).toContain("4 rounds · 15 heats · all auto");
		expect(screen.queryByRole("table")).toBeNull();
		fireEvent.click(toggle);
		expect(screen.getByRole("table")).toBeTruthy();
	});

	it("opens by itself when a round is modified", () => {
		const modified = (() => {
			const plan = plan32();
			return {
				...plan,
				rounds: plan.rounds.map((r, i) =>
					i === 1 ? { ...r, auto: false } : r,
				),
			};
		})();
		render(<Host initial={modified} collapsible />);
		expect(screen.getByRole("table")).toBeTruthy();
		expect(
			screen.getByRole("button", { name: /Adjust/ }).textContent,
		).toContain("1 modified");
	});

	it("can be opened and focused on a round by the host", () => {
		const { rerender } = render(
			<FormatRoundsEditor
				plan={plan32()}
				onChange={() => undefined}
				collapsible
			/>,
		);
		expect(screen.queryByRole("table")).toBeNull();
		rerender(
			<FormatRoundsEditor
				plan={plan32()}
				onChange={() => undefined}
				collapsible
				focus={{ round: 2 }}
			/>,
		);
		expect(screen.getByRole("table")).toBeTruthy();
		expect(document.activeElement).toBe(
			screen.getByRole("button", { name: "Semi-finals · Heats: less" }),
		);
	});

	it("follows the host when it controls the state", () => {
		const onExpandedChange = vi.fn();
		render(
			<FormatRoundsEditor
				plan={plan32()}
				onChange={() => undefined}
				collapsible
				expanded={false}
				onExpandedChange={onExpandedChange}
			/>,
		);
		press(/Adjust the rounds/);
		expect(onExpandedChange).toHaveBeenCalledWith(true);
		expect(screen.queryByRole("table")).toBeNull();
	});
});

function SectionHost(props: {
	initial: FormatPlan;
	onPlan?: (plan: FormatPlan, round: number | null) => void;
}) {
	const [plan, setPlan] = useState(props.initial);
	return (
		<FormatPlacementSection
			plan={plan}
			onChange={(next, round) => {
				setPlan(next);
				props.onPlan?.(next, round);
			}}
		/>
	);
}

describe("placement section", () => {
	it("chooses the fill of round 1", () => {
		const onPlan = vi.fn<PlanSpy>();
		render(<SectionHost initial={plan32()} onPlan={onPlan} />);
		fireEvent.change(screen.getByLabelText("Placement in round 1"), {
			target: { value: "draw" },
		});
		expect(onPlan.mock.lastCall?.[0].fill).toBe("draw");
	});

	it("keeps the detailed diagram behind a toggle", () => {
		render(<SectionHost initial={plan16()} />);
		expect(screen.queryByRole("img", { name: /Passage from/ })).toBeNull();
		press("Show the detail");
		expect(screen.getByRole("img", { name: /Passage from/ })).toBeTruthy();
		press("Hide the detail");
		expect(screen.queryByRole("img", { name: /Passage from/ })).toBeNull();
	});

	it("applies the chosen placement to every round", () => {
		const onPlan = vi.fn<PlanSpy>();
		render(<SectionHost initial={plan32()} onPlan={onPlan} />);
		fireEvent.click(screen.getAllByRole("button", { name: /Spread/ })[0]!);
		const rounds = onPlan.mock.lastCall?.[0].rounds ?? [];
		expect(rounds[0]?.placement).toBeUndefined();
		expect(rounds.slice(1).every((r) => r.placement === "spread")).toBe(true);
	});

	it("lives in the more options", () => {
		render(<Host initial={plan32()} />);
		expect(screen.queryByText("Placement of the qualifiers")).toBeNull();
		press("More options");
		expect(screen.getByText("Placement of the qualifiers")).toBeTruthy();
	});
});

describe("more options", () => {
	const open = () => press("More options");

	it("compares branch and spread per round and sets the one chosen", () => {
		const onPlan = vi.fn<PlanSpy>();
		render(<SectionHost initial={plan16()} onPlan={onPlan} />);
		const pair = screen.getByRole("group", {
			name: "Quarter-finals → Semi-finals",
		});
		const branch = within(pair).getByRole("button", { name: /By branch/ });
		const spread = within(pair).getByRole("button", { name: /Spread/ });
		expect(branch.getAttribute("aria-pressed")).toBe("true");
		fireEvent.click(spread);
		expect(onPlan.mock.lastCall?.[0].rounds[1]?.placement).toBe("spread");
		expect(
			within(
				screen.getByRole("group", { name: "Quarter-finals → Semi-finals" }),
			)
				.getByRole("button", { name: /Spread/ })
				.getAttribute("aria-pressed"),
		).toBe("true");
		fireEvent.click(
			within(
				screen.getByRole("group", { name: "Quarter-finals → Semi-finals" }),
			).getByRole("button", { name: /By branch/ }),
		);
		expect(onPlan.mock.lastCall?.[0].rounds[1]?.placement).toBeUndefined();
	});

	it("greys the placement when both give the same result", () => {
		render(
			<SectionHost
				initial={defaultPlan({
					riders: 26,
					heats: 7,
					advance: 2,
					repechage: true,
				})}
			/>,
		);
		const pair = screen.getAllByRole("group", { name: /→/ })[0]!;
		expect(within(pair).queryByRole("button")).toBeNull();
		expect(within(pair).getByText(/give the same result/)).toBeTruthy();
		expect(pair.querySelector("[aria-disabled='true']")).not.toBeNull();
	});

	it("refuses a JSON that does not fit the rows, unless the host takes it", () => {
		const unsupported = JSON.stringify({
			heatboardFormat: 1,
			name: "Odd",
			fill: "serpentine",
			rounds: [
				{
					key: "a",
					name: "A",
					heats: 1,
					outcomes: [{ ranks: [1, 3], to: "b" }],
				},
				{ key: "b", name: "B", heats: 2 },
			],
		});
		const onImportUnsupported = vi.fn();
		const { unmount } = render(<Host initial={plan16()} />);
		open();
		press("Import JSON");
		fireEvent.change(screen.getByLabelText("Round settings JSON"), {
			target: { value: unsupported },
		});
		press("Load this JSON");
		expect(screen.getByRole("alert").textContent).toContain(
			"one row per round",
		);
		unmount();
		render(
			<Host initial={plan16()} onImportUnsupported={onImportUnsupported} />,
		);
		open();
		press("Import JSON");
		fireEvent.change(screen.getByLabelText("Round settings JSON"), {
			target: { value: unsupported },
		});
		press("Load this JSON");
		expect(onImportUnsupported).toHaveBeenCalledTimes(1);
	});

	it("imports a JSON written as rows", () => {
		const onPlan = vi.fn<PlanSpy>();
		const source = plan32();
		render(<Host initial={plan16()} onPlan={onPlan} />);
		open();
		press("Export JSON");
		const exported = screen.getByLabelText<HTMLTextAreaElement>(
			"Round settings JSON",
		).value;
		expect(exported).toContain("heatboardFormat");
		fireEvent.change(screen.getByLabelText("Round settings JSON"), {
			target: { value: exported },
		});
		press("Load this JSON");
		const imported = onPlan.mock.lastCall?.[0] as FormatPlan;
		expect(imported.rounds.length).toBe(3);
		expect(imported.rounds.slice(1).every((r) => !r.auto)).toBe(true);
		expect(source.rounds.length).toBe(4);
	});
});

describe("placement explanation", () => {
	it("zooms on the first passage where branch and spread differ, with real heat numbers", () => {
		render(<FormatPlacementZoom plan={plan16()} />);
		const zoom = screen.getByRole("group", {
			name: "Placement · Quarter-finals → Semi-finals",
		});
		expect(
			within(zoom).getByRole("img", {
				name: /Passage from Quarter-finals to Semi-finals/,
			}),
		).toBeTruthy();
		expect(zoom.textContent).toContain("neighbouring heats meet again");
		expect(zoom.textContent).toContain(
			"Semi-finals, Heat 1: the top 2 of Quarter-finals heats 1 and 2.",
		);
		expect(zoom.querySelectorAll(".hb-format-placement__arrow")).toHaveLength(
			8,
		);
		expect(
			zoom.querySelectorAll(".hb-format-placement__arrow--second"),
		).toHaveLength(4);
	});

	it("describes the spread placement when it is the chosen one", () => {
		const spread = plan16();
		spread.rounds[1] = { ...spread.rounds[1]!, placement: "spread" };
		render(<FormatPlacementZoom plan={spread} />);
		expect(screen.getByRole("group").textContent).toContain(
			"dealt over all the heats like cards",
		);
	});

	it("says in one sentence that both placements are the same for 26 riders with a repechage", () => {
		render(
			<FormatPlacementZoom
				plan={defaultPlan({
					riders: 26,
					heats: 7,
					advance: 2,
					repechage: true,
				})}
			/>,
		);
		const zoom = screen.getByRole("group");
		expect(zoom.textContent).toContain("give the same placement here");
		expect(
			zoom.querySelectorAll(".hb-format-placement__arrow--repechage").length,
		).toBeGreaterThan(0);
	});

	it("keeps only the arrows of one heat opaque when there are many, and follows the selected heat", () => {
		const base = defaultPlan({
			riders: 80,
			heats: 20,
			advance: 2,
			repechage: true,
		});
		const big = {
			...base,
			rounds: base.rounds.map((r) => ({ ...r, placement: "spread" as const })),
		};
		render(<FormatPlacementZoom plan={big} />);
		const zoom = screen.getByRole("group");
		expect(zoom.querySelector(".hb-format-placement__faint")).not.toBeNull();
		expect(zoom.textContent).toContain("Select a heat on the right");
		const heats = within(zoom).getAllByRole("button");
		fireEvent.click(heats[1]!);
		expect(heats[1]!.getAttribute("aria-pressed")).toBe("true");
	});

	it("renders nothing for a lone final", () => {
		const { container } = render(
			<FormatPlacementZoom
				plan={defaultPlan({
					riders: 4,
					heats: 1,
					advance: 2,
					repechage: false,
				})}
			/>,
		);
		expect(container.firstChild).toBeNull();
	});
});
