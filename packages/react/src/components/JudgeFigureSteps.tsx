import { familyColor } from "./FigureRows";
import {
	cx,
	partProps,
	useBoardSettings,
	type JudgeCategory,
} from "./settings";

/**
 * The choices of an entry sheet, one under the other: the category, then the figures of that
 * category by family, then the variant of the chosen figure. A step only appears once the one
 * above it is made, below it, so nothing already on screen moves.
 */
export function JudgeFigureSteps(props: {
	categories: JudgeCategory[];
	category: string | undefined;
	onCategory: (type: string) => void;
	figure: string | undefined;
	onFigure: (figure: string | undefined) => void;
	variant: string | undefined;
	onVariant: (variant: string | undefined) => void;
	/** Shows the category list even when there is only one category. */
	alwaysCategories?: boolean;
}) {
	const { categories, category, figure, variant } = props;
	const settings = useBoardSettings();
	const { labels } = settings;
	const words = labels.judgeEntry;
	const inner = (cls: string) => cx(!settings.unstyled && cls);
	const option = (selected: boolean) =>
		partProps(
			settings,
			"judgeOption",
			"hb-judge-option",
			selected && "hb-judge-option--selected",
		);
	const chosen = categories.find((c) => c.type === category);
	const picked = chosen?.groups
		.flatMap((group) => group.figures.map((f) => ({ f, group })))
		.find(({ f }) => f.code === figure);
	const accepted = picked?.f.variants.find((v) => v.code === variant);

	return (
		<>
			{(categories.length > 1 || props.alwaysCategories === true) && (
				<div className={inner("hb-judge-step")}>
					<p className={inner("hb-judge-step__title")}>{words.category}</p>
					<div
						role="radiogroup"
						aria-label={words.category}
						className={inner("hb-judge-sheet__list")}
					>
						{categories.map((c) => {
							const selected = c.type === category;
							const { className, style } = option(selected);
							return (
								<button
									key={c.type}
									type="button"
									role="radio"
									aria-checked={selected}
									className={className}
									style={style}
									onClick={() => props.onCategory(c.type)}
								>
									{c.type}
								</button>
							);
						})}
					</div>
				</div>
			)}
			{chosen && chosen.groups.length > 0 && (
				<div className={inner("hb-judge-step")}>
					<p className={inner("hb-judge-step__title")}>{words.figure}</p>
					{chosen.groups.map((group) => (
						<div
							key={group.id}
							role="group"
							aria-label={labels.figuresEditor.familyGroup(group.name)}
							className={inner("hb-judge-family")}
						>
							<span className={inner("hb-judge-family__name")}>
								<span
									className={inner("hb-figures__swatch")}
									style={{ background: familyColor(group.index) }}
								/>
								{group.name}
							</span>
							<div className={inner("hb-judge-sheet__row")}>
								{group.figures.map((f) => {
									const selected = f.code === figure;
									const { className, style } = option(selected);
									return (
										<button
											key={f.code}
											type="button"
											aria-pressed={selected}
											title={f.name}
											className={className}
											style={style}
											onClick={() =>
												props.onFigure(selected ? undefined : f.code)
											}
										>
											{f.code}
										</button>
									);
								})}
							</div>
						</div>
					))}
				</div>
			)}
			{picked && picked.f.variants.length > 0 && (
				<div className={inner("hb-judge-step")}>
					<p className={inner("hb-judge-step__title")}>
						{words.variant(picked.f.code)}
					</p>
					<div
						role="radiogroup"
						aria-label={words.variant(picked.f.code)}
						className={inner("hb-judge-sheet__row")}
					>
						{[undefined, ...picked.f.variants].map((v) => {
							const selected =
								v === undefined ? variant === undefined : v.code === variant;
							const { className, style } = option(selected);
							return (
								<button
									key={v?.code ?? "none"}
									type="button"
									role="radio"
									aria-checked={selected}
									className={className}
									style={style}
									onClick={() => props.onVariant(v?.code)}
								>
									{v === undefined ? (
										words.noVariant
									) : (
										<>
											<b>{v.suffix}</b>
											{v.name !== "" && <small>{v.name}</small>}
										</>
									)}
								</button>
							);
						})}
					</div>
				</div>
			)}
			{picked && (
				<p className={inner("hb-judge-step__recap")}>
					<b>
						{picked.f.code}
						{accepted?.suffix ?? ""}
					</b>
					{" · "}
					{words.recap(
						[picked.f.name ?? picked.f.code, accepted?.name]
							.filter(Boolean)
							.join(" "),
						picked.group.name,
					)}
				</p>
			)}
		</>
	);
}
