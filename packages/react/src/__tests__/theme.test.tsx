import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	Board,
	BracketProvider,
	EntryPool,
	HeatboardProvider,
	defineTheme,
	themes,
} from "../index";
import { THEME_TOKEN_NAMES } from "../theme";
import styles from "../styles.css?raw";
import { makeController } from "./helpers";

afterEach(cleanup);

const token = (element: Element, name: string) =>
	(element as HTMLElement).style.getPropertyValue(`--hb-${name}`);

function board(ui: React.ReactElement) {
	const { container } = render(
		<BracketProvider value={makeController()}>{ui}</BracketProvider>,
	);
	return container.querySelector<HTMLElement>(".hb-board")!;
}

describe("defineTheme", () => {
	it("merges its tokens over those of the extended theme, per scheme", () => {
		const custom = defineTheme({
			name: "club",
			extends: themes.lagoon,
			light: { "color-accent": "#e4007c", "radius-lg": "6px" },
			dark: { "color-accent": "#ff4fae" },
		});
		expect(custom.name).toBe("club");
		expect(custom.light["color-accent"]).toBe("#e4007c");
		expect(custom.light["radius-lg"]).toBe("6px");
		expect(custom.dark["color-accent"]).toBe("#ff4fae");
		expect(custom.dark["radius-lg"]).toBe(themes.lagoon.dark["radius-lg"]);
		expect(custom.light["color-bg"]).toBe(themes.lagoon.light["color-bg"]);
		expect(custom.dark["color-bg"]).toBe(themes.lagoon.dark["color-bg"]);
	});

	it("keeps the base tokens of a scheme left out", () => {
		const custom = defineTheme({
			extends: themes.goldenHour,
			light: { "color-accent": "#123456" },
		});
		expect(custom.dark).toEqual(themes.goldenHour.dark);
		expect(custom.name).toBe("custom");
	});

	it("starts from the classic theme without extends", () => {
		expect(defineTheme({ light: { "color-bg": "#fff" } }).dark).toEqual(
			themes.classic.dark,
		);
		expect(defineTheme().light).toEqual(themes.classic.light);
	});

	it("rejects unknown token names at compile time", () => {
		// @ts-expect-error unknown token
		defineTheme({ light: { "color-nope": "red" } });
	});
});

describe("built-in themes", () => {
	it.each(Object.entries(themes))(
		"%s defines every token in both schemes",
		(_name, theme) => {
			for (const scheme of [theme.light, theme.dark]) {
				const missing = THEME_TOKEN_NAMES.filter(
					(name) => name !== "heat-badge-color" && !(name in scheme),
				);
				expect(missing).toEqual([]);
			}
		},
	);

	const normalize = (value: string) =>
		value.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").trim();

	it("keeps the stylesheet defaults equal to the classic light tokens", () => {
		const block = styles.match(
			/:where\(\s*\.hb-board,[^)]*\.hb-format-shape[^)]*\) \{([^}]*)\}/,
		)![1]!;
		const declared: Record<string, string> = {};
		for (const match of block.matchAll(/--hb-([\w-]+):\s*([^;]+);/g)) {
			declared[match[1]!] = normalize(match[2]!);
		}
		const expected = Object.fromEntries(
			Object.entries(themes.classic.light).map(([name, value]) => [
				name,
				normalize(value),
			]),
		);
		expect(declared).toEqual(expected);
	});
});

describe("theme application", () => {
	it("styles a board without provider as classic, light", () => {
		const root = board(<Board />);
		expect(root.getAttribute("data-hb-theme")).toBe("classic");
		expect(root.getAttribute("data-hb-color-scheme")).toBe("light");
		expect(token(root, "color-bg")).toBe(themes.classic.light["color-bg"]);
		expect(root.style.colorScheme).toBe("light");
	});

	it("applies the variables of the chosen theme and scheme", () => {
		const light = board(
			<HeatboardProvider theme={themes.raceBoard} colorScheme="light">
				<Board />
			</HeatboardProvider>,
		);
		expect(light.getAttribute("data-hb-theme")).toBe("raceBoard");
		expect(token(light, "color-bg")).toBe(themes.raceBoard.light["color-bg"]);
		cleanup();

		const dark = board(
			<HeatboardProvider theme={themes.raceBoard} colorScheme="dark">
				<Board />
			</HeatboardProvider>,
		);
		expect(dark.getAttribute("data-hb-color-scheme")).toBe("dark");
		expect(token(dark, "color-bg")).toBe(themes.raceBoard.dark["color-bg"]);
		expect(dark.style.colorScheme).toBe("dark");
	});

	it("lets the board props override the provider", () => {
		const root = board(
			<HeatboardProvider theme={themes.lagoon} colorScheme="dark">
				<Board theme={themes.goldenHour} colorScheme="light" />
			</HeatboardProvider>,
		);
		expect(root.getAttribute("data-hb-theme")).toBe("goldenHour");
		expect(token(root, "color-bg")).toBe(themes.goldenHour.light["color-bg"]);
	});

	it("applies a custom theme", () => {
		const club = defineTheme({
			extends: themes.lagoon,
			light: { "color-accent": "#e4007c" },
		});
		const root = board(
			<HeatboardProvider theme={club} colorScheme="light">
				<Board />
			</HeatboardProvider>,
		);
		expect(token(root, "color-accent")).toBe("#e4007c");
		expect(token(root, "color-bg")).toBe(themes.lagoon.light["color-bg"]);
	});

	it("keeps the styles prop above the theme variables", () => {
		const root = board(
			<Board styles={{ board: { "--hb-color-bg": "#abcdef" } as never }} />,
		);
		expect(token(root, "color-bg")).toBe("#abcdef");
	});

	it("themes the entry pool too", () => {
		const { container } = render(
			<BracketProvider value={makeController()}>
				<HeatboardProvider theme={themes.lagoon} colorScheme="dark">
					<EntryPool />
				</HeatboardProvider>
			</BracketProvider>,
		);
		const pool = container.querySelector(".hb-pool")!;
		expect(pool.getAttribute("data-hb-theme")).toBe("lagoon");
		expect(token(pool, "color-bg")).toBe(themes.lagoon.dark["color-bg"]);
	});
});

describe("nested providers", () => {
	it("inherits the theme and the color scheme of the parent", () => {
		const root = board(
			<HeatboardProvider theme={themes.lagoon} colorScheme="dark">
				<HeatboardProvider locale="fr">
					<Board />
				</HeatboardProvider>
			</HeatboardProvider>,
		);
		expect(root.getAttribute("data-hb-theme")).toBe("lagoon");
		expect(root.getAttribute("data-hb-color-scheme")).toBe("dark");
	});

	it("lets the child redefine them", () => {
		const root = board(
			<HeatboardProvider theme={themes.lagoon} colorScheme="dark">
				<HeatboardProvider theme={themes.raceBoard} colorScheme="light">
					<Board />
				</HeatboardProvider>
			</HeatboardProvider>,
		);
		expect(root.getAttribute("data-hb-theme")).toBe("raceBoard");
		expect(root.getAttribute("data-hb-color-scheme")).toBe("light");
	});
});

describe("system color scheme", () => {
	let dark = false;
	const listeners = new Set<() => void>();

	beforeEach(() => {
		dark = false;
		listeners.clear();
		window.matchMedia = vi.fn((query: string) => ({
			media: query,
			get matches() {
				return dark;
			},
			addEventListener: (_type: string, listener: () => void) =>
				listeners.add(listener),
			removeEventListener: (_type: string, listener: () => void) =>
				listeners.delete(listener),
		})) as unknown as typeof window.matchMedia;
	});

	afterEach(() => {
		Reflect.deleteProperty(window, "matchMedia");
	});

	const setDark = (value: boolean) =>
		act(() => {
			dark = value;
			listeners.forEach((listener) => listener());
		});

	it("resolves through prefers-color-scheme by default", () => {
		dark = true;
		const root = board(<Board />);
		expect(root.getAttribute("data-hb-color-scheme")).toBe("dark");
		expect(token(root, "color-bg")).toBe(themes.classic.dark["color-bg"]);
	});

	it("follows changes of the preference", () => {
		const root = board(
			<HeatboardProvider colorScheme="system">
				<Board />
			</HeatboardProvider>,
		);
		expect(root.getAttribute("data-hb-color-scheme")).toBe("light");
		setDark(true);
		expect(root.getAttribute("data-hb-color-scheme")).toBe("dark");
		setDark(false);
		expect(root.getAttribute("data-hb-color-scheme")).toBe("light");
	});

	it("ignores the preference for an explicit scheme", () => {
		dark = true;
		const root = board(
			<HeatboardProvider colorScheme="light">
				<Board />
			</HeatboardProvider>,
		);
		expect(root.getAttribute("data-hb-color-scheme")).toBe("light");
	});

	it("falls back to the deprecated listener methods", () => {
		window.matchMedia = vi.fn((query: string) => ({
			media: query,
			get matches() {
				return dark;
			},
			addListener: (listener: () => void) => listeners.add(listener),
			removeListener: (listener: () => void) => listeners.delete(listener),
		})) as unknown as typeof window.matchMedia;
		const root = board(<Board />);
		expect(root.getAttribute("data-hb-color-scheme")).toBe("light");
		setDark(true);
		expect(root.getAttribute("data-hb-color-scheme")).toBe("dark");
	});

	it("stops listening once unmounted", () => {
		board(<Board />);
		expect(listeners.size).toBe(1);
		cleanup();
		expect(listeners.size).toBe(0);
	});
});
