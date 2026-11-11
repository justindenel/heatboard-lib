import { describe, expect, it } from "vitest";
import { errorMessage, labels } from "../index";

describe("errorMessage", () => {
	it("tells to remove the double elimination when applyFormat is refused because of it", () => {
		const error = { code: "DOUBLE_OPEN", details: { reason: "APPLY_FORMAT" } };
		expect(errorMessage(labels.fr, error)).toBe(
			"Retirez d'abord la double élimination pour changer le format.",
		);
		expect(errorMessage(labels.en, error)).toMatch(
			/Remove the double elimination first/,
		);
	});

	it("explains why the double elimination is not open yet", () => {
		const error = {
			code: "DOUBLE_UNAVAILABLE",
			details: { reason: "TABLE_NOT_FINISHED" },
		};
		expect(errorMessage(labels.fr, error)).toMatch(/tableau 1/);
		expect(errorMessage(labels.en, error)).toMatch(/first table is judged/);
	});

	it("says the bracket status follows the heats", () => {
		const error = {
			code: "INVALID_STATUS_TRANSITION",
			details: { reason: "AUTOMATIC" },
		};
		expect(errorMessage(labels.fr, error)).toMatch(/suit les heats/);
		expect(errorMessage(labels.en, error)).toMatch(/follows the heats/);
		expect(errorMessage(labels.en, { code: "INVALID_STATUS_TRANSITION" })).toBe(
			"This status change is not possible now.",
		);
	});

	it("translates a locked structure", () => {
		expect(errorMessage(labels.fr, { code: "FORMAT_LOCKED" })).toMatch(
			/suivent le format/,
		);
		expect(errorMessage(labels.en, { code: "FORMAT_LOCKED" })).toMatch(
			/follow the format/,
		);
	});

	it("keeps the generic text of DOUBLE_OPEN without a reason", () => {
		expect(errorMessage(labels.en, { code: "DOUBLE_OPEN" })).toBe(
			"The double elimination is already open.",
		);
	});

	it("tells what to do about a tie the notes cannot break", () => {
		const error = { code: "UNRESOLVED_TIE" };
		expect(errorMessage(labels.fr, error)).toContain(
			"Départagez-les dans « Forcer l'ordre du heat » : déplacez un des riders à égalité.",
		);
		expect(errorMessage(labels.en, error)).toContain("Force the heat order");
	});

	it("explains a simulation refused while a heat runs", () => {
		const error = { code: "SIMULATE_WHILE_RUNNING" };
		expect(errorMessage(labels.fr, error)).toMatch(/attendez la fin/);
		expect(errorMessage(labels.en, error)).toMatch(/wait for it to end/);
	});
});

describe("round arrivals", () => {
	it("agrees the verb and the seeds with the count", () => {
		const { incoming } = labels.fr.formatRows;
		expect(incoming(1, 0)).toBe("1 arrive");
		expect(incoming(14, 4, 1)).toBe(
			"14 arrivent (dont 4 du repêchage, 1 tête de série)",
		);
		expect(incoming(14, 0, 2)).toBe("14 arrivent (dont 2 têtes de série)");
	});
});
