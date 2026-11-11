import type { ScoringConfig, ScoringFigure } from "./model";

export type PresetLocale = "fr" | "en";

interface LocalisedName {
	fr: string;
	en: string;
}

const names = {
	categories: {
		Wave: { fr: "Vagues", en: "Wave" },
		Jump: { fr: "Sauts", en: "Jump" },
		Move: { fr: "Figures", en: "Move" },
		Trick: { fr: "Figures", en: "Trick" },
	},
	families: {
		forward: { fr: "Avant", en: "Forward" },
		backward: { fr: "Arrière", en: "Backward" },
		combined: { fr: "Combinée", en: "Combined" },
		other: { fr: "Autre", en: "Other" },
	},
	variants: {
		"1H": { fr: "Une main", en: "One hand" },
		"1F": { fr: "Un pied", en: "One foot" },
		"1H1F": { fr: "Une main un pied", en: "One hand one foot" },
		SS: { fr: "Pieds inversés", en: "Switch stance" },
		CF: { fr: "Fausse panne", en: "Fake" },
	},
	figures: {
		J: { fr: "Saut", en: "Jump" },
		TT: { fr: "Table top tweaké", en: "Tweaked table top" },
	},
} satisfies Record<string, Record<string, LocalisedName>>;

const nameIn = (
	table: Record<string, LocalisedName>,
	key: string,
	locale: PresetLocale,
): string | undefined => table[key]?.[locale];

/**
 * Presets are stored with English names; the names of the examples (categories, and for windsurf
 * wave families, variants and a few figures) are written in `locale` when a bracket is created from
 * one or an example is imported. The result holds plain strings.
 */
export function localiseScoring(
	config: ScoringConfig,
	locale: PresetLocale,
): ScoringConfig {
	// A category's type is also its key (rides, penalties, priority), so this only fits a config
	// with no rides yet, which is how the examples are used.
	const typeIn = (type: string) =>
		nameIn(names.categories, type, locale) ?? type;
	return {
		...config,
		...(config.priorityType !== undefined && {
			priorityType: typeIn(config.priorityType),
		}),
		categories: config.categories.map((category) => ({
			...category,
			type: typeIn(category.type),
			...(category.families && {
				families: category.families.map((family) => ({
					...family,
					name: nameIn(names.families, family.id, locale) ?? family.name,
				})),
			}),
			...(category.figures && {
				figures: category.figures.map((figure) => {
					const name = nameIn(names.figures, figure.code, locale);
					return name === undefined ? figure : { ...figure, name };
				}),
			}),
		})),
		...(config.variants && {
			variants: config.variants.map((variant) => ({
				...variant,
				name: nameIn(names.variants, variant.code, locale) ?? variant.name,
			})),
		}),
	};
}

const halfStepScale = { min: 0, max: 10, step: 0.5 };

const figure = (
	code: string,
	name: string,
	family: string,
	variants?: string[],
): ScoringFigure => ({
	code,
	name,
	family,
	...(variants === undefined ? {} : { variants: [...variants] }),
});

const handsAndFeet = ["1H", "1F", "1H1F", "SS", "CF"];

export const scoringPresets: {
	windsurfWave: ScoringConfig;
	windsurfFreestyle: ScoringConfig;
	surf: ScoringConfig;
	kiteFreestyle: ScoringConfig;
} = {
	windsurfWave: {
		method: "points",
		scale: halfStepScale,
		categories: [
			{ type: names.categories.Wave.en, counted: 2 },
			{
				type: names.categories.Jump.en,
				counted: 2,
				distinctFamilies: true,
				families: [
					{ id: "forward", name: names.families.forward.en },
					{ id: "backward", name: names.families.backward.en },
					{ id: "combined", name: names.families.combined.en },
					{ id: "other", name: names.families.other.en },
				],
				figures: [
					figure("J", names.figures.J.en, "other"),
					figure("T", "Table top", "other"),
					figure("TT", names.figures.TT.en, "other"),
					figure("EW", "Eagle wing", "other"),
					figure("BA", "Back side air", "other"),
					figure("CR", "Cheese roll", "forward"),
					figure("G", "Goiter", "forward"),
					figure("F", "Forward", "forward", handsAndFeet),
					figure("FPL", "FPL", "forward"),
					figure("AC", "Air chachoo", "forward"),
					figure("AS", "Air spock", "forward"),
					figure("B", "Back loop", "backward", handsAndFeet),
					figure("P", "Push loop", "backward", ["1H", "1F", "1H1F"]),
					figure("CP", "Crazy Pete", "backward"),
					figure("Plu", "Plume", "backward"),
					figure("SH", "Shaka", "backward"),
					figure("TWF", "Tweaked forward", "combined"),
					figure("TF", "Table forward", "combined"),
					figure("DF", "Double forward", "combined", ["1H"]),
					figure("DP", "Double push", "combined"),
					figure("PB", "Push back", "combined"),
					figure("PT", "Push table", "combined"),
					figure("PF", "Push forward", "combined"),
				],
			},
		],
		variants: [
			{ code: "1H", name: names.variants["1H"].en, suffix: "1H" },
			{ code: "1F", name: names.variants["1F"].en, suffix: "1F" },
			{
				code: "1H1F",
				name: names.variants["1H1F"].en,
				suffix: "1H1F",
			},
			{ code: "SS", name: names.variants.SS.en, suffix: "SS" },
			{ code: "CF", name: names.variants.CF.en, suffix: "CF" },
		],
		aggregation: "mean",
	},
	windsurfFreestyle: {
		method: "points",
		scale: halfStepScale,
		categories: [{ type: names.categories.Move.en, counted: 5 }],
		aggregation: "mean",
	},
	// Needs head-judge mode: the head judge announces the shared rides.
	surf: {
		method: "rideMeans",
		scale: halfStepScale,
		categories: [{ type: names.categories.Wave.en, counted: 2 }],
		aggregation: "mean",
	},
	kiteFreestyle: {
		method: "points",
		scale: halfStepScale,
		categories: [{ type: names.categories.Trick.en, counted: 3 }],
		aggregation: "mean",
	},
};
