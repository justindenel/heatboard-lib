import { partProps, useBoardSettings, type ScorePickerProps } from "./settings";

/** Grid of every value of the scale; the selected one is pressed. */
export function ScorePicker(props: ScorePickerProps) {
	const { values, selected, onSelect } = props;
	const settings = useBoardSettings();
	const { labels } = settings;
	const option = (isSelected: boolean) =>
		partProps(
			settings,
			"judgeOption",
			"hb-judge-option",
			isSelected && "hb-judge-option--selected",
		);
	return (
		<div
			role="group"
			aria-label={labels.judgeValues}
			className={settings.unstyled ? undefined : "hb-judge-sheet__grid"}
		>
			{values.map((value) => {
				const isSelected = value === selected;
				const { className, style } = option(isSelected);
				return (
					<button
						key={value}
						type="button"
						aria-pressed={isSelected}
						className={className}
						style={style}
						data-value={value}
						onClick={() => onSelect(value)}
					>
						{labels.formatScore(value)}
					</button>
				);
			})}
		</div>
	);
}
