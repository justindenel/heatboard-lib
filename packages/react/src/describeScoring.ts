import type { ScoringConfig } from "@heatboard/core";
import type { Labels } from "./labels";

/**
 * Plain-language summary of a scoring (`null` is manual ranking), in the language of `labels`.
 * Family names are written as stored: an example straight from `scoringPresets` or the templates
 * carries English ones, so pass it through `localiseScoring` first when showing it in another language.
 */
export function describeScoring(
	config: ScoringConfig | null,
	labels: Labels,
): string {
	const words = labels.scoringSentence;
	if (!config) return words.manual;

	const { scale, aggregation } = config;
	const parts = [words.scale(scale.min, scale.max, scale.step)];

	const counted = config.categories
		.filter((c) => c.type.trim() !== "")
		.map((c) => words.categoryCount(c.counted, c.type, c.coefficient));
	if (counted.length > 0) {
		const list =
			counted.length === 1
				? (counted[0] as string)
				: `${counted.slice(0, -1).join(", ")} ${words.and} ${counted.at(-1)}`;
		parts.push(words.categories(list));
	}
	for (const category of config.categories) {
		const families = (category.families ?? []).map((f) => f.name);
		if (
			category.distinctFamilies === true &&
			category.counted >= 2 &&
			families.length >= 2
		) {
			parts.push(
				words.distinctFamilies(category.counted, category.type, families),
			);
		}
	}

	parts.push(
		config.method === "placings"
			? words.placings(config.trimPlacings === true)
			: config.method === "points"
				? words.points(aggregation)
				: words.rideMeans(aggregation),
	);
	parts.push(words.tieBreak(config.priorityType));
	return parts.join(" ");
}
