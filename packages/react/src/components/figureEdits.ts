import type {
	ScoringCategory,
	ScoringConfig,
	ScoringFamily,
	ScoringFigure,
	ScoringVariant,
} from "@heatboard/core";

export interface FigureRef {
	figure: ScoringFigure;
	/** Position in the flat `figures` list of the category. */
	index: number;
}

export interface FigureGroup {
	family: ScoringFamily;
	figures: FigureRef[];
}

/** Where a figure lands: the family and its position inside the family, counted from 0. */
export interface FigureSpot {
	familyId: string;
	position: number;
}

/** The figures of a category grouped by family, families in the organiser's order, figures in list order. */
export function groupsOf(category: ScoringCategory): FigureGroup[] {
	const figures = category.figures ?? [];
	return (category.families ?? []).map((family) => ({
		family,
		figures: figures.flatMap((figure, index) =>
			figure.family === family.id ? [{ figure, index }] : [],
		),
	}));
}

/** What the figures line of a category counts: every figure and every family. */
export function figureCounts(category: ScoringCategory): {
	figures: number;
	families: number;
} {
	return {
		figures: (category.figures ?? []).length,
		families: (category.families ?? []).length,
	};
}

/** Drops the keys that would be empty, so a category without figures stays as plain as a new one. */
function tidy(category: ScoringCategory): ScoringCategory {
	const next = { ...category };
	if (next.figures?.length === 0) delete next.figures;
	if (next.families?.length === 0) delete next.families;
	if ((next.families?.length ?? 0) < 2) delete next.distinctFamilies;
	return next;
}

function arrayMove<T>(list: readonly T[], from: number, to: number): T[] {
	const copy = [...list];
	const [moved] = copy.splice(from, 1);
	if (moved !== undefined) copy.splice(to, 0, moved);
	return copy;
}

export function nextFamilyId(category: ScoringCategory): string {
	const used = new Set((category.families ?? []).map((f) => f.id));
	let n = used.size + 1;
	while (used.has(`family-${n}`)) n++;
	return `family-${n}`;
}

export function addFamily(
	category: ScoringCategory,
	name = "",
): { category: ScoringCategory; id: string } {
	const id = nextFamilyId(category);
	return {
		category: {
			...category,
			families: [...(category.families ?? []), { id, name }],
		},
		id,
	};
}

export function renameFamily(
	category: ScoringCategory,
	id: string,
	name: string,
): ScoringCategory {
	return {
		...category,
		families: (category.families ?? []).map((f) =>
			f.id === id ? { ...f, name } : f,
		),
	};
}

export function moveFamily(
	category: ScoringCategory,
	id: string,
	to: number,
): ScoringCategory {
	const families = category.families ?? [];
	const from = families.findIndex((f) => f.id === id);
	if (from === -1) return category;
	const target = Math.max(0, Math.min(families.length - 1, to));
	return from === target
		? category
		: { ...category, families: arrayMove(families, from, target) };
}

/** Removes a family; its figures go to `into`, at the end of that family, or go with it when `into` is not given. */
export function removeFamily(
	category: ScoringCategory,
	id: string,
	into?: string,
): ScoringCategory {
	const all = category.figures ?? [];
	const kept = all.filter((figure) => figure.family !== id);
	const moved =
		into === undefined
			? []
			: all
					.filter((figure) => figure.family === id)
					.map((figure) => ({ ...figure, family: into }));
	return tidy({
		...category,
		families: (category.families ?? []).filter((f) => f.id !== id),
		figures: [...kept, ...moved],
	});
}

export function addFigure(
	category: ScoringCategory,
	familyId: string,
): ScoringCategory {
	return moveFigureSpot(
		{
			...category,
			figures: [...(category.figures ?? []), { code: "", family: familyId }],
		},
		(category.figures ?? []).length,
		{
			familyId,
			position:
				groupsOf(category).find((g) => g.family.id === familyId)?.figures
					.length ?? 0,
		},
	);
}

export function updateFigure(
	category: ScoringCategory,
	index: number,
	change: { code?: string; name?: string },
): ScoringCategory {
	return {
		...category,
		figures: (category.figures ?? []).map((figure, i) => {
			if (i !== index) return figure;
			const next = { ...figure, ...change };
			if (next.name === "") delete next.name;
			return next;
		}),
	};
}

export function removeFigure(
	category: ScoringCategory,
	index: number,
): ScoringCategory {
	return tidy({
		...category,
		figures: (category.figures ?? []).filter((_, i) => i !== index),
	});
}

export function toggleFigureVariant(
	category: ScoringCategory,
	index: number,
	variantCode: string,
): ScoringCategory {
	return {
		...category,
		figures: (category.figures ?? []).map((figure, i) => {
			if (i !== index) return figure;
			const accepted = figure.variants ?? [];
			const variants = accepted.includes(variantCode)
				? accepted.filter((code) => code !== variantCode)
				: [...accepted, variantCode];
			const next: ScoringFigure = { ...figure, variants };
			if (variants.length === 0) delete next.variants;
			return next;
		}),
	};
}

/**
 * Puts a figure in a family at a position of that family (counted once the figure has left its old
 * place). The flat list is rewritten family by family, which is the order every reader shows.
 */
export function moveFigureSpot(
	category: ScoringCategory,
	index: number,
	spot: FigureSpot,
): ScoringCategory {
	const figures = category.figures ?? [];
	const moved = figures[index];
	if (
		!moved ||
		!(category.families ?? []).some((f) => f.id === spot.familyId)
	) {
		return category;
	}
	const rest: FigureRef[] = [];
	figures.forEach((figure, i) => {
		if (i !== index) rest.push({ figure, index: i });
	});
	const ordered = (category.families ?? []).flatMap((family) => {
		const own = rest
			.filter((ref) => ref.figure.family === family.id)
			.map((ref) => ref.figure);
		if (family.id !== spot.familyId) return own;
		own.splice(Math.max(0, Math.min(own.length, spot.position)), 0, {
			...moved,
			family: family.id,
		});
		return own;
	});
	return { ...category, figures: ordered };
}

/** One step up or down: past the edge of a family the figure joins the neighbouring family. */
export function stepFigure(
	category: ScoringCategory,
	index: number,
	direction: -1 | 1,
): { category: ScoringCategory; spot: FigureSpot } | undefined {
	const groups = groupsOf(category);
	const g = groups.findIndex((group) =>
		group.figures.some((ref) => ref.index === index),
	);
	const group = groups[g];
	if (!group) return undefined;
	const position = group.figures.findIndex((ref) => ref.index === index);
	let spot: FigureSpot | undefined;
	if (direction === -1) {
		if (position > 0)
			spot = { familyId: group.family.id, position: position - 1 };
		else {
			const before = groups[g - 1];
			if (before) {
				spot = { familyId: before.family.id, position: before.figures.length };
			}
		}
	} else if (position < group.figures.length - 1) {
		spot = { familyId: group.family.id, position: position + 1 };
	} else {
		const after = groups[g + 1];
		if (after) spot = { familyId: after.family.id, position: 0 };
	}
	return spot && { category: moveFigureSpot(category, index, spot), spot };
}

export function setDistinctFamilies(
	category: ScoringCategory,
	on: boolean,
): ScoringCategory {
	if (on) return { ...category, distinctFamilies: true };
	const next = { ...category };
	delete next.distinctFamilies;
	return next;
}

/** Edits of the variants shared by the figures of every category. */
export function addVariant(scoring: ScoringConfig): ScoringConfig {
	return {
		...scoring,
		variants: [...(scoring.variants ?? []), { code: "", name: "", suffix: "" }],
	};
}

export function updateVariant(
	scoring: ScoringConfig,
	index: number,
	change: { code?: string; name?: string },
): ScoringConfig {
	const old = scoring.variants?.[index];
	if (!old) return scoring;
	const next: ScoringVariant = {
		...old,
		...(change.name !== undefined && { name: change.name }),
		...(change.code !== undefined && {
			code: change.code,
			suffix: change.code,
		}),
	};
	const renamed = change.code !== undefined && change.code !== old.code;
	return {
		...scoring,
		variants: (scoring.variants ?? []).map((v, i) => (i === index ? next : v)),
		...(renamed && {
			categories: scoring.categories.map((category) => ({
				...category,
				...(category.figures && {
					figures: category.figures.map((figure) =>
						figure.variants?.includes(old.code)
							? {
									...figure,
									variants: figure.variants.map((code) =>
										code === old.code ? next.code : code,
									),
								}
							: figure,
					),
				}),
			})),
		}),
	};
}

/** Removes a variant from the list and from every figure that accepted it. */
export function removeVariant(
	scoring: ScoringConfig,
	index: number,
): ScoringConfig {
	const old = scoring.variants?.[index];
	if (!old) return scoring;
	const variants = (scoring.variants ?? []).filter((_, i) => i !== index);
	const next: ScoringConfig = {
		...scoring,
		categories: scoring.categories.map((category) => ({
			...category,
			...(category.figures && {
				figures: category.figures.map((figure) => {
					if (!figure.variants?.includes(old.code)) return figure;
					const accepted = figure.variants.filter((code) => code !== old.code);
					const copy: ScoringFigure = { ...figure, variants: accepted };
					if (accepted.length === 0) delete copy.variants;
					return copy;
				}),
			}),
		})),
	};
	if (variants.length === 0) delete next.variants;
	else next.variants = variants;
	return next;
}
