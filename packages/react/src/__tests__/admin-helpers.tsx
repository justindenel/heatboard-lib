import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect } from "vitest";
import type { Action, Bracket } from "@heatboard/core";
import {
	Board,
	BracketProvider,
	EntryPool,
	HeatboardProvider,
	useBracket,
	type BoardProps,
	type Locale,
} from "../index";

export function makeRaceBracket(overrides: Partial<Bracket> = {}): Bracket {
	return {
		id: "race",
		name: "Race Open",
		entries: [
			{ riderId: "r1", displayName: "Ann" },
			{ riderId: "r2", displayName: "Bob" },
			{ riderId: "r3", displayName: "Cy" },
			{ riderId: "r4", displayName: "Dee" },
			{ riderId: "r5", displayName: "Eve" },
		],
		rounds: [
			{
				id: "round1",
				name: "Round 1",
				group: "main",
				maxPerHeat: 4,
				advancing: 2,
				heats: [
					{
						id: "h1",
						status: "pending",
						slots: [
							{ riderId: "r1", rank: null },
							{ riderId: "r2", rank: null },
							{ riderId: "r3", rank: null },
						],
					},
					{
						id: "h2",
						status: "pending",
						slots: [{ riderId: "r4", rank: null }],
					},
				],
			},
			{
				id: "round2",
				name: "Round 2",
				group: "main",
				maxPerHeat: 4,
				advancing: 1,
				heats: [{ id: "h3", status: "pending", slots: [] }],
			},
		],
		links: [
			{ from: { heatId: "h1", rank: 1 }, to: { heatId: "h3" } },
			{ from: { heatId: "h2", rank: 1 }, to: { heatId: "h3" } },
		],
		status: "published",
		visibility: "private",
		...overrides,
	};
}

/** Both round 1 heats judged, bracket running. */
export function makeJudgedRace(): Bracket {
	const base = makeRaceBracket({ status: "running" });
	const [first, second] = base.rounds[0]!.heats;
	return {
		...base,
		rounds: [
			{
				...base.rounds[0]!,
				heats: [
					{
						...first!,
						status: "judged",
						slots: [
							{ riderId: "r1", rank: 1 },
							{ riderId: "r2", rank: 2 },
							{ riderId: "r3", rank: 3 },
						],
					},
					{
						...second!,
						status: "judged",
						slots: [{ riderId: "r4", rank: 1 }],
					},
				],
			},
			base.rounds[1]!,
		],
	};
}

export function counter(prefix = "id"): () => string {
	let n = 0;
	return () => `${prefix}-${++n}`;
}

function Harness(props: {
	bracket: Bracket;
	actions: Action[];
	board: Partial<BoardProps>;
	pool: boolean;
	poolRoundId: string;
	locale: Locale;
}) {
	const controller = useBracket({
		defaultBracket: props.bracket,
		onChange: (_next, cause) => {
			if (cause.type === "action") props.actions.push(cause.action);
		},
	});
	const createId = props.board.createId;
	return (
		<HeatboardProvider locale={props.locale}>
			<BracketProvider value={controller}>
				{props.pool && (
					<EntryPool
						defaultCollapsed={false}
						roundId={props.poolRoundId}
						mode={props.board.mode}
						permissions={props.board.permissions}
						createId={createId}
					/>
				)}
				<Board {...props.board} />
			</BracketProvider>
		</HeatboardProvider>
	);
}

export function renderAdmin(
	bracket: Bracket,
	options: {
		board?: Partial<BoardProps>;
		pool?: boolean;
		poolRoundId?: string;
		locale?: Locale;
	} = {},
) {
	const actions: Action[] = [];
	const board: Partial<BoardProps> = {
		mode: "admin",
		createId: counter(),
		...options.board,
	};
	const view = render(
		<Harness
			bracket={bracket}
			actions={actions}
			board={board}
			pool={options.pool ?? false}
			poolRoundId={options.poolRoundId ?? "round1"}
			locale={options.locale ?? "en"}
		/>,
	);
	return { ...view, actions };
}

export function heatSection(container: HTMLElement, id: string): HTMLElement {
	return container.querySelector<HTMLElement>(`[data-heat-id="${id}"]`)!;
}

export function roundSection(container: HTMLElement, id: string): HTMLElement {
	return container.querySelector<HTMLElement>(`[data-round-id="${id}"]`)!;
}

/** Refused controls stay focusable: `aria-disabled`, with the reason described and as title. */
export function expectRefused(element: HTMLElement) {
	expect(element.getAttribute("aria-disabled")).toBe("true");
	expect(element.hasAttribute("disabled")).toBe(false);
	const reason = document.getElementById(
		element.getAttribute("aria-describedby") ?? "",
	);
	expect(reason?.textContent).toBe(element.title);
	expect(element.title).not.toBe("");
}

export function inspector(): HTMLElement {
	return screen.getByRole("dialog");
}

function openFrom(scope: HTMLElement, name: RegExp): HTMLElement {
	fireEvent.click(within(scope).getByRole("button", { name }));
	return inspector();
}

const OPTIONS = /^Options (for|de) /;

export function openHeatInspector(
	container: HTMLElement,
	heatId: string,
): HTMLElement {
	return openFrom(
		heatSection(container, heatId),
		/^(Open the panel of|Ouvrir le panneau de) /,
	);
}

export function openRoundInspector(
	container: HTMLElement,
	roundId: string,
): HTMLElement {
	return openFrom(
		roundSection(container, roundId).querySelector<HTMLElement>(
			".hb-round__header",
		)!,
		OPTIONS,
	);
}

export function openBracketInspector(container: HTMLElement): HTMLElement {
	return openFrom(
		container.querySelector<HTMLElement>(".hb-board__header")!,
		OPTIONS,
	);
}

export function statusTrigger(panel: HTMLElement, rider: string) {
	return within(panel).getByRole("button", { name: `Status of ${rider}` });
}

export function statusItem(name: string | RegExp) {
	return screen.getByRole("menuitemcheckbox", { name });
}
