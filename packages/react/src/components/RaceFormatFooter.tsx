import { useRaceFormatEditor } from "./raceFormatContext";
import { cx, partProps, useBoardSettings } from "./settings";
import { RefusableButton } from "./admin";

/** Reminder of when the format applies, banner of the last save, change or problem count, and the two buttons. */
export function RaceFormatFooter() {
	const settings = useBoardSettings();
	const { labels } = settings;
	const editor = useRaceFormatEditor();
	const words = labels.raceFormatEditor;
	const button = partProps(settings, "button", "hb-button");
	const primary = partProps(settings, "button", "hb-button hb-button--primary");
	const inner = (cls: string) => cx(!settings.unstyled && cls);
	const { errorCount, changeCount } = editor;
	const reason =
		errorCount > 0
			? words.problems(errorCount)
			: changeCount === 0
				? words.noChange
				: undefined;

	const goToFirst = (event: { currentTarget: HTMLElement }) => {
		const scope =
			event.currentTarget.closest("dialog, [data-hb-format-root]") ?? document;
		const target = scope.querySelector<HTMLElement>('[aria-invalid="true"]');
		target?.scrollIntoView({ block: "center" });
		target?.focus();
	};

	return (
		<div className={inner("hb-format-footer")}>
			<p className={inner("hb-format-footer__note")}>{words.appliesLater}</p>
			{editor.failure !== null && (
				<p
					className={inner("hb-format-banner hb-format-banner--error")}
					role="alert"
				>
					{words.failed(editor.failure)}
				</p>
			)}
			{editor.saved && changeCount === 0 && errorCount === 0 && (
				<p
					className={inner("hb-format-banner hb-format-banner--success")}
					role="status"
				>
					{words.saved}
				</p>
			)}
			<div className={inner("hb-format-footer__actions")}>
				<span
					className={inner(
						errorCount > 0
							? "hb-format-footer__count hb-format-footer__count--error"
							: "hb-format-footer__count",
					)}
				>
					{errorCount > 0
						? words.problems(errorCount)
						: changeCount === 0
							? words.noChange
							: words.changes(changeCount)}
					{errorCount > 0 && (
						<>
							{" "}
							<button
								type="button"
								className={inner("hb-format-footer__jump")}
								onClick={goToFirst}
							>
								{words.goToFirst}
							</button>
						</>
					)}
				</span>
				<button
					type="button"
					className={button.className}
					style={button.style}
					disabled={changeCount === 0 && errorCount === 0 && !editor.failure}
					onClick={editor.discard}
				>
					{words.discard}
				</button>
				<RefusableButton
					reason={reason}
					className={primary.className}
					style={primary.style}
					ariaLabel={words.save}
					onPress={editor.save}
				>
					<span className={inner("hb-format-footer__long")}>{words.save}</span>
					<span className={inner("hb-format-footer__short")}>
						{words.saveShort}
					</span>
				</RefusableButton>
			</div>
		</div>
	);
}
