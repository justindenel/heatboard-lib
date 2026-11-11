import type { ScoringConfig } from "@heatboard/core";
import { groupsOf } from "./figureEdits";
import type { JudgeCategory } from "./settings";

/** The categories of a scoring as a judge picks from them: figures grouped by family, variants resolved. */
export function judgeCategoriesOf(
	scoring: ScoringConfig | undefined,
): JudgeCategory[] {
	return (scoring?.categories ?? []).map((category) => ({
		type: category.type,
		figures: (category.figures ?? []).map((figure) => figure.code),
		groups: groupsOf(category).flatMap((group, index) =>
			group.figures.length === 0
				? []
				: [
						{
							id: group.family.id,
							name: group.family.name,
							index,
							figures: group.figures.map(({ figure }) => ({
								code: figure.code,
								name: figure.name,
								variants: (figure.variants ?? []).flatMap((code) => {
									const variant = scoring?.variants?.find(
										(v) => v.code === code,
									);
									return variant ? [variant] : [];
								}),
							})),
						},
					],
		),
	}));
}

/** What a note says of its figure: the code, then the suffix of the variant when there is one. */
export function figureText(
	figure: string | undefined,
	variant: string | undefined,
): string | undefined {
	return figure === undefined ? undefined : `${figure}${variant ?? ""}`;
}
