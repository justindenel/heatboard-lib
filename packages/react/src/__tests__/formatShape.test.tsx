import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultPlan, formatFromPlan, refillPlan } from "@heatboard/core";
import { FormatShape, HeatboardProvider } from "../index";

afterEach(cleanup);

const plan = defaultPlan({
	riders: 24,
	heats: 6,
	advance: 2,
	repechage: false,
});
const format = formatFromPlan(plan);

describe("FormatShape", () => {
	it("shows the heats and riders of each round without a board", () => {
		render(<FormatShape format={format} riders={24} />);
		const shape = screen.getByRole("group", { name: "Format preview" });
		expect(within(shape).getByText("Main")).toBeTruthy();
		expect(within(shape).getByText("Round 1")).toBeTruthy();
		expect(within(shape).getByText("6 heats")).toBeTruthy();
		expect(within(shape).getByText("Final")).toBeTruthy();
		expect(
			within(shape).getByRole("list", {
				name: "Riders per heat: 4, 4, 4, 4, 4, 4",
			}),
		).toBeTruthy();
		expect(shape.textContent).toContain("24 riders");
		expect(shape.textContent).toContain("12 heats");
		expect(shape.textContent).toContain("4 rounds");
	});

	it("counts the seeds out of round 1 and shows them on their round", () => {
		const seeded = {
			...plan,
			riders: 32,
			rounds: plan.rounds.map((r, i) => (i === 1 ? { ...r, seedSlots: 4 } : r)),
		};
		render(<FormatShape plan={refillPlan(seeded, 0)} />);
		const shape = screen.getByRole("group", { name: "Format preview" });
		expect(shape.textContent).toContain("32 riders");
		expect(shape.textContent).toContain("+ 4 seeds");
		expect(
			within(shape).getByRole("list", {
				name: "Riders per heat: 5, 5, 5, 5, 4, 4",
			}),
		).toBeTruthy();
	});

	it("draws a plan, with its rider count", () => {
		render(<FormatShape plan={plan} />);
		const shape = screen.getByRole("group", { name: "Format preview" });
		expect(shape.textContent).toContain("24 riders");
		expect(within(shape).getByText("Semi-finals")).toBeTruthy();
	});

	it("applies the theme itself when rendered outside a board", () => {
		render(<FormatShape format={format} riders={24} />);
		const shape = screen.getByRole("group", { name: "Format preview" });
		expect(shape.getAttribute("data-hb-color-scheme")).toBeTruthy();
		expect(shape.style.getPropertyValue("--hb-color-card")).not.toBe("");
	});

	it("separates the repechage rounds and speaks the language of the provider", () => {
		const withRepechage = defaultPlan({
			riders: 16,
			heats: 4,
			advance: 2,
			repechage: true,
		});
		render(
			<HeatboardProvider locale="fr">
				<FormatShape plan={withRepechage} />
			</HeatboardProvider>,
		);
		const shape = screen.getByRole("group", { name: "Aperçu du format" });
		expect(within(shape).getByText("Principal")).toBeTruthy();
		expect(within(shape).getByText("Repêchage")).toBeTruthy();
		expect(within(shape).getByText("Repêchage 1")).toBeTruthy();
		expect(within(shape).getByText("Finale")).toBeTruthy();
		expect(shape.textContent).toContain("tours");
		expect(shape.textContent).toContain("16 riders");
	});

	it("warns in plain words when there are more heats than riders", () => {
		render(<FormatShape format={format} riders={3} />);
		expect(
			screen.getAllByText(/riders for \d+ heats, some heats will stay empty/)
				.length,
		).toBeGreaterThan(0);
	});

	it("shows the composition of a heat fed by the repechage, read from the links", () => {
		const repechage = defaultPlan({
			riders: 26,
			heats: 7,
			advance: 2,
			repechage: true,
		});
		render(<FormatShape plan={repechage} />);
		const shape = screen.getByRole("group", { name: "Format preview" });
		const mixed = within(shape).getAllByTitle(/from the main path/);
		expect(mixed.length).toBeGreaterThan(0);
		expect(mixed[0]!.textContent).toMatch(/^\d+ \+ \d+$/);
	});

	it("puts the repechage under the main round it comes from", () => {
		const repechage = defaultPlan({
			riders: 16,
			heats: 4,
			advance: 2,
			repechage: true,
		});
		render(<FormatShape plan={repechage} />);
		const shape = screen.getByRole("group", { name: "Format preview" });
		const column = (name: RegExp) =>
			within(shape)
				.getByText(name)
				.closest<HTMLElement>(".hb-format-shape__round")!.style.gridColumn;
		expect(column(/^Round 1$/)).toBe(column(/^Repechage 1$/));
		expect(column(/^Round 2$/)).not.toBe(column(/^Round 1$/));
	});

	it("shows the small final dashed, next to the final", () => {
		const withSmall = defaultPlan({
			riders: 16,
			heats: 4,
			advance: 2,
			repechage: false,
			smallFinal: true,
		});
		render(<FormatShape plan={withSmall} />);
		const shape = screen.getByRole("group", { name: "Format preview" });
		const small = within(shape)
			.getByText(/^Small final/)
			.closest<HTMLElement>(".hb-format-shape__round")!;
		const final = within(shape)
			.getByText(/^Final$/)
			.closest<HTMLElement>(".hb-format-shape__round")!;
		expect(Number(small.style.gridColumn)).toBe(
			Number(final.style.gridColumn) + 1,
		);
		expect(
			small.querySelector(".hb-format-shape__heat--optional"),
		).not.toBeNull();
		expect(shape.textContent).toContain("8 heats");
		expect(shape.textContent).toContain("4 rounds");
	});

	it("reports the index of the plan round when a column name is clicked", () => {
		const onRoundClick = vi.fn();
		const repechage = defaultPlan({
			riders: 16,
			heats: 4,
			advance: 2,
			repechage: true,
			smallFinal: true,
		});
		render(<FormatShape plan={repechage} onRoundClick={onRoundClick} />);
		fireEvent.click(screen.getByRole("button", { name: /^Round 2$/ }));
		expect(onRoundClick).toHaveBeenLastCalledWith(1);
		fireEvent.click(screen.getByRole("button", { name: /^Repechage 1$/ }));
		expect(onRoundClick).toHaveBeenLastCalledWith(0);
		fireEvent.click(screen.getByRole("button", { name: /^Final$/ }));
		expect(onRoundClick).toHaveBeenLastCalledWith(3);
	});

	it("renders nothing for a format the core does not accept", () => {
		const { container } = render(
			<FormatShape format={{ ...format, rounds: [] }} riders={8} />,
		);
		expect(container.firstChild).toBeNull();
	});
});
