import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BracketProvider, EntryPool, HeatboardProvider } from "../index";
import { makeController } from "./helpers";
import { makeRaceBracket } from "./admin-helpers";

afterEach(cleanup);

function renderPool(
	props: Partial<Parameters<typeof EntryPool>[0]> = {},
	locale: "en" | "fr" = "en",
) {
	const tree = (extra: typeof props) => (
		<HeatboardProvider locale={locale}>
			<BracketProvider value={makeController(makeRaceBracket())}>
				<EntryPool
					roundId="round1"
					mode="admin"
					defaultCollapsed={false}
					{...props}
					{...extra}
				/>
			</BracketProvider>
		</HeatboardProvider>
	);
	const view = render(tree({}));
	return {
		...view,
		update: (extra: typeof props) => view.rerender(tree(extra)),
	};
}

const toggle = () =>
	screen.getByRole("button", { name: "Show or hide unplaced riders" });

describe("collapsible panel", () => {
	it("starts open with the title, the count, the chips and the form", () => {
		const { container } = renderPool();
		expect(
			screen.getByRole("heading", { name: "Unplaced riders" }),
		).toBeTruthy();
		expect(container.querySelector(".hb-pool__count")!.textContent).toBe("1");
		expect(screen.getByText("Eve")).toBeTruthy();
		expect(screen.getByRole("textbox", { name: "Rider name" })).toBeTruthy();
		expect(toggle().getAttribute("aria-expanded")).toBe("true");
		expect(toggle().getAttribute("aria-controls")).toBe(
			container.querySelector(".hb-pool__body")!.id,
		);
	});

	it("collapses to the title and the count, then expands again", () => {
		const { container } = renderPool();
		fireEvent.click(toggle());
		expect(toggle().getAttribute("aria-expanded")).toBe("false");
		expect(
			container.querySelector(".hb-pool")!.getAttribute("data-collapsed"),
		).toBe("true");
		expect(
			screen.getByRole("heading", { name: "Unplaced riders" }),
		).toBeTruthy();
		expect(container.querySelector(".hb-pool__count")!.textContent).toBe("1");
		expect(screen.queryByText("Eve")).toBeNull();
		expect(screen.queryByRole("textbox")).toBeNull();
		expect(container.querySelector(".hb-pool__body")).toBeNull();

		fireEvent.click(toggle());
		expect(screen.getByText("Eve")).toBeTruthy();
		expect(screen.getByRole("textbox", { name: "Rider name" })).toBeTruthy();
	});

	it("keeps the icon, the count and the toggle when collapsed", () => {
		const { container } = renderPool({ defaultCollapsed: true });
		const pool = container.querySelector(".hb-pool")!;
		expect(pool.getAttribute("data-collapsed")).toBe("true");
		expect(pool.querySelector(".hb-pool__icon svg")).not.toBeNull();
		expect(pool.querySelector(".hb-pool__count")!.textContent).toBe("1");
		expect(toggle().getAttribute("aria-expanded")).toBe("false");
		expect(toggle().getAttribute("aria-controls")).toBeTruthy();
	});

	it("drops the icon with the built-in classes when unstyled", () => {
		const { container } = renderPool({ unstyled: true });
		expect(container.querySelector(".hb-pool__icon")).toBeNull();
	});

	it("starts collapsed when nothing is specified", () => {
		render(
			<HeatboardProvider>
				<BracketProvider value={makeController(makeRaceBracket())}>
					<EntryPool roundId="round1" mode="admin" />
				</BracketProvider>
			</HeatboardProvider>,
		);
		expect(toggle().getAttribute("aria-expanded")).toBe("false");
	});

	it("can start collapsed", () => {
		renderPool({ defaultCollapsed: true });
		expect(toggle().getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByText("Eve")).toBeNull();
	});

	it("follows the collapsed prop and reports the requested change", () => {
		const onCollapsedChange = vi.fn();
		const { update } = renderPool({ collapsed: true, onCollapsedChange });
		expect(screen.queryByText("Eve")).toBeNull();
		fireEvent.click(toggle());
		expect(onCollapsedChange).toHaveBeenCalledWith(false);
		expect(screen.queryByText("Eve")).toBeNull();

		update({ collapsed: false, onCollapsedChange });
		expect(screen.getByText("Eve")).toBeTruthy();
		fireEvent.click(toggle());
		expect(onCollapsedChange).toHaveBeenLastCalledWith(true);
		expect(screen.getByText("Eve")).toBeTruthy();
	});

	it("ignores defaultCollapsed once controlled", () => {
		renderPool({ collapsed: false, defaultCollapsed: true });
		expect(screen.getByText("Eve")).toBeTruthy();
	});

	it("labels its toggle in the active language", () => {
		renderPool({}, "fr");
		const button = screen.getByRole("button", {
			name: "Afficher ou masquer les inscrits non placés",
		});
		expect(button.title).toBe("Afficher ou masquer les inscrits non placés");
		expect(button.querySelector("svg")!.getAttribute("aria-hidden")).toBe(
			"true",
		);
	});
});

describe("entry rounds", () => {
	function renderGrouped() {
		const bracket = makeRaceBracket();
		bracket.entries.push({
			riderId: "r6",
			displayName: "Fay",
			entryRoundId: "round2",
		});
		return render(
			<HeatboardProvider>
				<BracketProvider value={makeController(bracket)}>
					<EntryPool mode="admin" defaultCollapsed={false} />
				</BracketProvider>
			</HeatboardProvider>,
		);
	}

	it("lists riders entering at a later round under that round", () => {
		const { container } = renderGrouped();
		expect(container.querySelector(".hb-pool__count")!.textContent).toBe("2");
		expect(screen.getByText("Eve")).toBeTruthy();
		expect(screen.getByText("Fay")).toBeTruthy();
		const group = screen.getByRole("heading", { name: "Round 2" });
		expect(group.nextElementSibling!.textContent).toContain("Fay");
		expect(screen.queryByRole("heading", { name: "Round 1" })).toBeNull();
	});
});
