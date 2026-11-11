import { useEffect, useRef, type CSSProperties } from "react";
import { CloseIcon } from "./icons";
import { JudgeFigureSteps } from "./JudgeFigureSteps";
import { partProps, useBoardSettings, type JudgeSheetProps } from "./settings";

/** Full-screen sheet to score one rider: category, optional figure and variant, then one tap on the value. */
export function JudgeSheet(props: JudgeSheetProps) {
	const { name, label, color, total, categories, category, figure } = props;
	const settings = useBoardSettings();
	const { labels } = settings;
	const sheetRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		sheetRef.current?.focus();
	}, []);

	const overlay = partProps(settings, "judgeOverlay", "hb-judge-overlay");
	const sheet = partProps(
		settings,
		"judgeSheet",
		"hb-judge-sheet hb-judge-sheet--full",
	);
	const head = partProps(settings, "judgeSheetHead", "hb-judge-sheet__head");
	const body = partProps(settings, "judgeSheetBody", "hb-judge-sheet__body");
	const option = (selected: boolean) =>
		partProps(
			settings,
			"judgeOption",
			"hb-judge-option",
			selected && "hb-judge-option--selected",
		);
	const inner = (cls: string) => (settings.unstyled ? undefined : cls);

	return (
		<>
			<button
				type="button"
				className={overlay.className}
				style={overlay.style}
				aria-label={labels.judgeClose}
				tabIndex={-1}
				onClick={props.onClose}
			/>
			<div
				ref={sheetRef}
				role="dialog"
				aria-modal="true"
				aria-label={labels.judgeSheet(label)}
				tabIndex={-1}
				className={sheet.className}
				style={
					{
						...sheet.style,
						"--hb-judge-lycra": color ?? "transparent",
					} as CSSProperties
				}
			>
				<div className={head.className} style={head.style}>
					<span className={inner("hb-judge-sheet__who")}>
						{name}
						<small>
							{labels.judgeTotal} {labels.formatTotal(total)}
						</small>
					</span>
					<button
						type="button"
						className={inner("hb-judge-sheet__close")}
						aria-label={labels.judgeClose}
						onClick={props.onClose}
					>
						<CloseIcon />
					</button>
				</div>
				<div className={body.className} style={body.style}>
					{props.editing && (
						<p className={inner("hb-judge-sheet__hint")}>
							{labels.judgeEditing}
						</p>
					)}
					<JudgeFigureSteps
						categories={categories}
						category={category}
						onCategory={props.onCategory}
						figure={figure}
						onFigure={props.onFigure}
						variant={props.variant}
						onVariant={props.onVariant}
					/>
					<p className={inner("hb-judge-step__title")}>
						{labels.judgeEntry.score}
					</p>
					<div
						role="group"
						aria-label={labels.judgeValues}
						className={inner("hb-judge-sheet__grid")}
					>
						{props.values.map((value) => {
							const selected = value === props.currentValue;
							const { className, style } = option(selected);
							const text = labels.formatScore(value);
							return (
								<button
									key={value}
									type="button"
									aria-pressed={props.editing ? selected : undefined}
									className={className}
									style={style}
									data-value={value}
									onClick={() => props.onPick(value)}
								>
									{text}
								</button>
							);
						})}
					</div>
				</div>
			</div>
		</>
	);
}
