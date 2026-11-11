import type { CSSProperties } from "react";
import { ScorePicker } from "./ScorePicker";
import {
	partProps,
	useBoardSettings,
	type JudgeQueueItemProps,
} from "./settings";

/** One announced ride waiting for this judge, scored in place: colour stripe, name, category, figure code, heat time, value picker, "Not seen" and "Confirm". */
export function JudgeQueueItem(props: JudgeQueueItemProps) {
	const { name, label, color, type, figure, time, draft } = props;
	const settings = useBoardSettings();
	const { labels } = settings;
	const item = partProps(settings, "judgeQueueItem", "hb-judge-queue__item");
	const actions = partProps(
		settings,
		"judgeQueueActions",
		"hb-judge-queue__actions",
	);
	const button = partProps(settings, "button", "hb-button");
	const Picker = settings.components.ScorePicker ?? ScorePicker;
	const inner = (cls: string) => (settings.unstyled ? undefined : cls);
	return (
		<div
			role="group"
			className={item.className}
			style={
				{
					...item.style,
					"--hb-judge-lycra": color ?? "transparent",
				} as CSSProperties
			}
			aria-label={labels.judgeRideSheet(label, type, figure)}
		>
			<div className={inner("hb-judge-queue__head")}>
				<span className={inner("hb-judge-queue__name")}>{name}</span>
				<span className={inner("hb-judge-queue__what")}>
					{type}
					{figure ? <strong> {figure}</strong> : null}
				</span>
				{time !== "" && (
					<span className={inner("hb-judge-queue__time")}>{time}</span>
				)}
			</div>
			<Picker
				values={props.values}
				selected={draft}
				onSelect={props.onSelect}
			/>
			<div className={actions.className} style={actions.style}>
				<button
					type="button"
					className={button.className}
					style={button.style}
					onClick={props.onUnseen}
				>
					{labels.unseen}
				</button>
				<button
					type="button"
					className={button.className}
					style={button.style}
					disabled={draft === undefined}
					onClick={props.onConfirm}
				>
					{draft === undefined
						? labels.judgeValidate
						: `${labels.judgeValidate} ${labels.formatScore(draft)}`}
				</button>
			</div>
		</div>
	);
}
