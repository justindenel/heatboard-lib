import chainedRepechage from "./presets/chained-repechage.json";
import singleElimination from "./presets/single-elimination.json";
import type { FormatSettings } from "./model";
import { parseFormat } from "./parse";

function load(raw: unknown): FormatSettings {
	const parsed = parseFormat(raw);
	if (!parsed.ok) {
		throw new Error(
			`Invalid built-in format: ${JSON.stringify(parsed.errors)}`,
		);
	}
	return parsed.format;
}

export const formatPresets: FormatSettings[] = [
	load(singleElimination),
	load(chainedRepechage),
];
