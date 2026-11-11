export const LOCALES = ["en", "fr"] as const;
export const THEME_KEYS = [
	"classic",
	"raceBoard",
	"lagoon",
	"goldenHour",
] as const;
export const SCHEMES = ["system", "light", "dark"] as const;
export const MODES = ["headJudge", "free"] as const;
export const SCENARIOS = ["running", "repechage", "new"] as const;
export const VIEW_KEYS = [
	"admin",
	"viewer",
	"headJudge",
	"judge1",
	"judge2",
	"judge3",
] as const;

export interface DemoConfig {
	locale: (typeof LOCALES)[number];
	theme: (typeof THEME_KEYS)[number];
	scheme: (typeof SCHEMES)[number];
	view: (typeof VIEW_KEYS)[number];
	mode: (typeof MODES)[number];
	scenario: (typeof SCENARIOS)[number];
}

export const DEFAULT_CONFIG: DemoConfig = {
	locale: "en",
	theme: "raceBoard",
	scheme: "system",
	view: "admin",
	mode: "headJudge",
	scenario: "running",
};

const STORAGE_KEY = "heatboard-playground:config";

function pick<T extends string>(
	allowed: readonly T[],
	value: unknown,
): T | undefined {
	return allowed.find((candidate) => candidate === value);
}

/** Valid URL params win over the stored config, which wins over the defaults. */
export function mergeConfig(url: URLSearchParams, stored: unknown): DemoConfig {
	const saved: Record<string, unknown> =
		typeof stored === "object" && stored !== null
			? (stored as Record<string, unknown>)
			: {};
	const view =
		pick(VIEW_KEYS, url.get("view")) ??
		pick(VIEW_KEYS, saved.view) ??
		DEFAULT_CONFIG.view;
	return {
		locale:
			pick(LOCALES, url.get("lang")) ??
			pick(LOCALES, saved.locale) ??
			DEFAULT_CONFIG.locale,
		theme:
			pick(THEME_KEYS, url.get("theme")) ??
			pick(THEME_KEYS, saved.theme) ??
			DEFAULT_CONFIG.theme,
		scheme:
			pick(SCHEMES, url.get("scheme")) ??
			pick(SCHEMES, saved.scheme) ??
			DEFAULT_CONFIG.scheme,
		view,
		mode:
			pick(MODES, url.get("mode")) ??
			pick(MODES, saved.mode) ??
			DEFAULT_CONFIG.mode,
		scenario:
			pick(SCENARIOS, url.get("scenario")) ??
			pick(SCENARIOS, saved.scenario) ??
			DEFAULT_CONFIG.scenario,
	};
}

export function loadStoredConfig(): unknown {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		return raw === null ? undefined : JSON.parse(raw);
	} catch {
		return undefined;
	}
}

export function saveStoredConfig(config: DemoConfig): void {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
	} catch {
		// Storage unavailable (private mode, quota): the config just won't persist.
	}
}

export function clearStoredConfig(): void {
	try {
		window.localStorage.removeItem(STORAGE_KEY);
	} catch {
		// See saveStoredConfig.
	}
}
