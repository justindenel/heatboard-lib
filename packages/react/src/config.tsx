import { createContext, useContext, useMemo, type ReactNode } from "react";
import { labels as builtInLabels, type Labels, type Locale } from "./labels";
import { themes } from "./theme/themes";
import type { ColorSchemeSetting, HeatboardTheme } from "./theme/tokens";

export interface HeatboardConfig {
	locale?: Locale;
	/** Shallow override of the labels of the active locale. */
	labels?: Partial<Labels>;
	theme?: HeatboardTheme;
	colorScheme?: ColorSchemeSetting;
	lycraColors?: string[];
}

export type ResolvedHeatboardConfig = Required<
	Omit<HeatboardConfig, "labels">
> & { labels: Labels };

export const DEFAULT_LYCRA_COLORS: readonly string[] = [
	"red",
	"blue",
	"yellow",
	"green",
	"white",
	"black",
];

const DEFAULT_LOCALE: Locale = "en";

function resolve(config: HeatboardConfig): ResolvedHeatboardConfig {
	const locale = config.locale ?? DEFAULT_LOCALE;
	return {
		locale,
		labels: { ...builtInLabels[locale], ...config.labels },
		theme: config.theme ?? themes.classic,
		colorScheme: config.colorScheme ?? "system",
		lycraColors: config.lycraColors ?? [...DEFAULT_LYCRA_COLORS],
	};
}

interface ConfigState {
	raw: HeatboardConfig;
	resolved: ResolvedHeatboardConfig;
}

const ConfigContext = createContext<ConfigState>({
	raw: {},
	resolved: resolve({}),
});

/** Sets language, labels, theme, color scheme and lycra colors; nested providers inherit and override. */
export function HeatboardProvider(
	props: HeatboardConfig & { children: ReactNode },
) {
	const { locale, labels, theme, colorScheme, lycraColors, children } = props;
	const parent = useContext(ConfigContext).raw;
	const value = useMemo((): ConfigState => {
		const raw: HeatboardConfig = {
			locale: locale ?? parent.locale,
			labels: { ...parent.labels, ...labels },
			theme: theme ?? parent.theme,
			colorScheme: colorScheme ?? parent.colorScheme,
			lycraColors: lycraColors ?? parent.lycraColors,
		};
		return { raw, resolved: resolve(raw) };
	}, [locale, labels, theme, colorScheme, lycraColors, parent]);
	return (
		<ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
	);
}

/** Reads the closest `HeatboardProvider` config, or the defaults without one. */
export function useHeatboardConfig(): ResolvedHeatboardConfig {
	return useContext(ConfigContext).resolved;
}
