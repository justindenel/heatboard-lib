import { partProps, useBoardSettings, type BoardErrorProps } from "./settings";

/** Dismissable banner announcing a refused change. */
export function BoardError({ message, onDismiss }: BoardErrorProps) {
	const settings = useBoardSettings();
	const root = partProps(settings, "boardError", "hb-board-error");
	const text = partProps(
		settings,
		"boardErrorMessage",
		"hb-board-error__message",
	);
	const dismiss = partProps(
		settings,
		"boardErrorDismiss",
		"hb-board-error__dismiss",
	);
	return (
		<div className={root.className} style={root.style} role="alert">
			<span className={text.className} style={text.style}>
				{message}
			</span>
			<button
				type="button"
				className={dismiss.className}
				style={dismiss.style}
				onClick={onDismiss}
			>
				{settings.labels.dismissError}
			</button>
		</div>
	);
}
