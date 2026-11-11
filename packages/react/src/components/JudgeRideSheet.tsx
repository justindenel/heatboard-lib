import { useEffect, useRef, type CSSProperties } from "react";
import { CloseIcon } from "./icons";
import { ScorePicker } from "./ScorePicker";
import {
	partProps,
	useBoardSettings,
	type JudgeRideSheetProps,
} from "./settings";

/** Bottom sheet of one announced ride: a tap selects a value, "Confirm" sends it, "Not seen" sends no note. */
export function JudgeRideSheet(props: JudgeRideSheetProps) {
	const { name, label, color, type, figure, draft, current } = props;
	const settings = useBoardSettings();
	const { labels } = settings;
	const sheetRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		sheetRef.current?.focus();
	}, []);

	const overlay = partProps(settings, "judgeOverlay", "hb-judge-overlay");
	const sheet = partProps(settings, "judgeSheet", "hb-judge-sheet");
	const head = partProps(settings, "judgeSheetHead", "hb-judge-sheet__head");
	const body = partProps(settings, "judgeSheetBody", "hb-judge-sheet__body");
	const button = partProps(settings, "button", "hb-button");
	const Picker = settings.components.ScorePicker ?? ScorePicker;
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
				aria-label={labels.judgeRideSheet(label, type, figure)}
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
							{type}
							{figure ? ` ${figure}` : ""}
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
					{current !== undefined && (
						<p className={inner("hb-judge-sheet__hint")}>
							{labels.judgeEditing}
						</p>
					)}
					<Picker
						values={props.values}
						selected={draft}
						onSelect={props.onSelect}
					/>
					<div className={inner("hb-judge-sheet__actions")}>
						<button
							type="button"
							className={button.className}
							style={button.style}
							disabled={draft === undefined}
							onClick={props.onConfirm}
						>
							{labels.judgeValidate}
						</button>
						<button
							type="button"
							className={button.className}
							style={button.style}
							aria-pressed={current === null ? true : undefined}
							onClick={props.onUnseen}
						>
							{labels.unseen}
						</button>
					</div>
				</div>
			</div>
		</>
	);
}
