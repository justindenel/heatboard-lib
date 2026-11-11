import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, mergeConfig } from "../demo-config";

const url = (query: string) => new URLSearchParams(query);

describe("mergeConfig", () => {
	it("falls back to the defaults", () => {
		expect(mergeConfig(url(""), undefined)).toEqual(DEFAULT_CONFIG);
		expect(mergeConfig(url(""), "garbage")).toEqual(DEFAULT_CONFIG);
		expect(mergeConfig(url(""), null)).toEqual(DEFAULT_CONFIG);
	});

	it("uses valid stored values and ignores invalid ones", () => {
		const stored = { locale: "fr", theme: "nope", scheme: "dark", view: 3 };
		expect(mergeConfig(url(""), stored)).toEqual({
			...DEFAULT_CONFIG,
			locale: "fr",
			scheme: "dark",
		});
	});

	it("lets URL params win over stored values", () => {
		const stored = { theme: "lagoon", scheme: "dark", view: "admin" };
		const merged = mergeConfig(
			url("theme=classic&lang=fr&view=viewer"),
			stored,
		);
		expect(merged).toMatchObject({
			theme: "classic",
			locale: "fr",
			scheme: "dark",
			view: "viewer",
		});
	});

	it("ignores the removed demo and example theme values", () => {
		const merged = mergeConfig(url("demo=scoring&theme=example"), {
			demo: "scoring",
			theme: "example",
		});
		expect(merged).toEqual(DEFAULT_CONFIG);
		expect("demo" in merged).toBe(false);
	});

	it("reads the judging mode from the URL, then the store, then defaults to head judge", () => {
		expect(DEFAULT_CONFIG.mode).toBe("headJudge");
		expect(mergeConfig(url(""), { mode: "free" }).mode).toBe("free");
		expect(mergeConfig(url("mode=free"), { mode: "headJudge" }).mode).toBe(
			"free",
		);
		expect(mergeConfig(url("mode=nope"), { mode: 3 }).mode).toBe("headJudge");
	});

	it("keeps a stored judge view", () => {
		expect(mergeConfig(url(""), { view: "judge1" }).view).toBe("judge1");
		expect(mergeConfig(url("view=judge2"), { view: "judge1" }).view).toBe(
			"judge2",
		);
	});

	it("reads the scenario from the URL, then the store, then defaults to the running event", () => {
		expect(DEFAULT_CONFIG.scenario).toBe("running");
		expect(mergeConfig(url(""), { scenario: "new" }).scenario).toBe("new");
		expect(
			mergeConfig(url("scenario=repechage"), { scenario: "new" }).scenario,
		).toBe("repechage");
		expect(mergeConfig(url("scenario=nope"), { scenario: 3 }).scenario).toBe(
			"running",
		);
	});
});
