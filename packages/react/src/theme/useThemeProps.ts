import { useMemo, useSyncExternalStore, type CSSProperties } from "react";
import { useHeatboardConfig } from "../config";
import type {
	ColorScheme,
	ColorSchemeSetting,
	HeatboardTheme,
	ThemeTokens,
} from "./tokens";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void): () => void {
	if (typeof window.matchMedia !== "function") return () => undefined;
	const query = window.matchMedia(DARK_QUERY);
	if (typeof query.addEventListener !== "function") {
		// Safari < 14 only has the deprecated listener methods.
		query.addListener(onChange);
		return () => query.removeListener(onChange);
	}
	query.addEventListener("change", onChange);
	return () => query.removeEventListener("change", onChange);
}

function prefersDark(): boolean {
	return (
		typeof window.matchMedia === "function" &&
		window.matchMedia(DARK_QUERY).matches
	);
}

/** Resolves `system` against the operating system preference and follows its changes. */
export function useColorScheme(setting: ColorSchemeSetting): ColorScheme {
	const dark = useSyncExternalStore(subscribe, prefersDark, () => false);
	if (setting === "system") return dark ? "dark" : "light";
	return setting;
}

export function tokensToStyle(tokens: ThemeTokens): CSSProperties {
	const style: Record<string, string> = {};
	for (const [name, value] of Object.entries(tokens)) {
		style[`--hb-${name}`] = value;
	}
	return style;
}

export interface ThemeProps {
	"data-hb-theme": string;
	"data-hb-color-scheme": ColorScheme;
	style: CSSProperties;
}

/** Attributes and inline variables for the root of a board or pool; arguments override the provider. */
export function useThemeProps(
	theme?: HeatboardTheme,
	colorScheme?: ColorSchemeSetting,
): ThemeProps {
	const config = useHeatboardConfig();
	const active = theme ?? config.theme;
	const scheme = useColorScheme(colorScheme ?? config.colorScheme);
	const tokens = active[scheme];
	return useMemo(
		() => ({
			"data-hb-theme": active.name,
			"data-hb-color-scheme": scheme,
			style: { ...tokensToStyle(tokens), colorScheme: scheme },
		}),
		[active.name, scheme, tokens],
	);
}
