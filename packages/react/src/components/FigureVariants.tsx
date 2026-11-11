import { useEffect, useRef, useState } from "react";
import type { ScoringCategory, ScoringConfig } from "@heatboard/core";
import {
	addVariant,
	removeVariant,
	toggleFigureVariant,
	updateVariant,
} from "./figureEdits";
import { PlusIcon, TrashIcon } from "./icons";
import { issueAt, type FormatIssue } from "./raceFormatDraft";
import { cx, partProps, useBoardSettings } from "./settings";

/** The variants shared by every figure: chips, and an inline editor behind "Edit". */
export function VariantList(props: {
	scoring: ScoringConfig;
	issues: readonly FormatIssue[];
	onChange: (change: (config: ScoringConfig) => ScoringConfig) => void;
}) {
	const { scoring, issues, onChange } = props;
	const settings = useBoardSettings();
	const words = settings.labels.figuresEditor;
	const button = partProps(settings, "button", "hb-button");
	const inner = (cls: string) => cx(!settings.unstyled && cls);
	const [editing, setEditing] = useState(false);
	const variants = scoring.variants ?? [];
	const message = (code: string) =>
		settings.labels.scoringProblems[code] ?? settings.labels.errorGeneric;

	return (
		<div className={inner("hb-figures__variants")}>
			<div className={inner("hb-figures__variants-head")}>
				<b>{words.variants}</b>
				<button
					type="button"
					className={inner("hb-figures__link")}
					aria-expanded={editing}
					onClick={() => setEditing(!editing)}
				>
					{editing ? words.variantsDone : words.variantsEdit}
				</button>
			</div>
			{!editing ? (
				<div className={inner("hb-figures__chips")}>
					{variants.length === 0 && (
						<span className={inner("hb-scoring__hint")}>
							{words.variantsEmpty}
						</span>
					)}
					{variants.map((variant, i) => (
						<span key={i} className={inner("hb-figures__chip")}>
							{variant.suffix}
							{variant.name !== "" && <span>{variant.name}</span>}
						</span>
					))}
				</div>
			) : (
				<div className={inner("hb-figures__variant-editor")}>
					{variants.map((variant, i) => {
						const codeIssue = issueAt(issues, `variants.${i}.code`);
						const nameIssue = issueAt(issues, `variants.${i}.name`);
						return (
							<div key={i} className={inner("hb-figures__variant-row")}>
								<input
									className={inner("hb-input hb-figures__variant-code")}
									aria-label={words.variantCode}
									aria-invalid={codeIssue ? true : undefined}
									value={variant.code}
									onChange={(event) =>
										onChange((c) =>
											updateVariant(c, i, { code: event.target.value }),
										)
									}
								/>
								<input
									className={inner("hb-input hb-figures__variant-name")}
									aria-label={words.variantName}
									aria-invalid={nameIssue ? true : undefined}
									value={variant.name}
									onChange={(event) =>
										onChange((c) =>
											updateVariant(c, i, { name: event.target.value }),
										)
									}
								/>
								<button
									type="button"
									className={inner("hb-button hb-icon-button hb-figures__icon")}
									aria-label={words.variantRemove(variant.code)}
									onClick={() => onChange((c) => removeVariant(c, i))}
								>
									<TrashIcon />
								</button>
								{(codeIssue ?? nameIssue) && (
									<span
										className={inner("hb-scoring__error hb-figures__rowerr")}
									>
										{message((codeIssue ?? nameIssue)!.code)}
									</span>
								)}
							</div>
						);
					})}
					<div>
						<button
							type="button"
							className={cx(
								button.className,
								!settings.unstyled && "hb-scoring__add",
							)}
							style={button.style}
							onClick={() => onChange(addVariant)}
						>
							<PlusIcon />
							{words.variantAdd}
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

/** Popover that ticks the variants a figure accepts; closes on Escape or a press outside. */
export function VariantMenu(props: {
	scoring: ScoringConfig;
	category: ScoringCategory;
	index: number;
	onChange: (change: (category: ScoringCategory) => ScoringCategory) => void;
	onClose: () => void;
}) {
	const { scoring, category, index, onChange, onClose } = props;
	const settings = useBoardSettings();
	const words = settings.labels.figuresEditor;
	const inner = (cls: string) => cx(!settings.unstyled && cls);
	const ref = useRef<HTMLDivElement>(null);
	const figure = category.figures?.[index];

	useEffect(() => {
		const onPointer = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Node) || ref.current?.contains(target)) return;
			if (
				target instanceof Element &&
				target.closest("[data-variants-button]")
			) {
				return;
			}
			onClose();
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			onClose();
		};
		document.addEventListener("pointerdown", onPointer);
		document.addEventListener("keydown", onKey, true);
		return () => {
			document.removeEventListener("pointerdown", onPointer);
			document.removeEventListener("keydown", onKey, true);
		};
	}, [onClose]);

	if (!figure) return null;
	return (
		<div
			ref={ref}
			role="group"
			aria-label={words.figureVariantsOf(figure.code)}
			className={inner("hb-figures__menu")}
		>
			<span className={inner("hb-figures__menu-title")}>
				{words.figureVariantsOf(figure.code)}
			</span>
			{(scoring.variants ?? []).length === 0 && (
				<span className={inner("hb-scoring__hint")}>{words.variantsEmpty}</span>
			)}
			{(scoring.variants ?? []).map((variant) => (
				<label key={variant.code} className={inner("hb-figures__menu-item")}>
					<input
						type="checkbox"
						checked={figure.variants?.includes(variant.code) === true}
						onChange={() =>
							onChange((c) => toggleFigureVariant(c, index, variant.code))
						}
					/>
					<span>{variant.name || variant.suffix}</span>
					<span className={inner("hb-figures__menu-result")}>
						{figure.code}
						{variant.suffix}
					</span>
				</label>
			))}
		</div>
	);
}
