import { describeRaceFormatParts } from "../describeRaceFormat";
import { useRaceFormatEditor } from "./raceFormatContext";
import { diffParts } from "./raceFormatDraft";
import { cx, useBoardSettings } from "./settings";

/** The race format in force and, once something changed, the one a save would put in force. */
export function RaceFormatLines() {
	const settings = useBoardSettings();
	const { labels } = settings;
	const editor = useRaceFormatEditor();
	const words = labels.raceFormatEditor;
	const inner = (cls: string) => cx(!settings.unstyled && cls);
	const before = describeRaceFormatParts(editor.current, labels);
	const showAfter = editor.changeCount > 0 || editor.errorCount > 0;
	return (
		<div className={inner("hb-format-lines")}>
			<p>
				<span className={inner("hb-format-lines__key")}>{words.inForce}</span>
				<span className={inner("hb-format-lines__text")}>
					{before.join(" · ")}
				</span>
			</p>
			{showAfter && (
				<p>
					<span className={inner("hb-format-lines__key")}>
						{words.afterSave}
					</span>
					{editor.errorCount > 0 ? (
						<span className={inner("hb-format-lines__bad")}>
							{words.fixFirst(editor.errorCount)}
						</span>
					) : (
						<span className={inner("hb-format-lines__text")}>
							{diffParts(
								before,
								describeRaceFormatParts(editor.next, labels),
							).map((part, i) => (
								<span key={i}>
									{i > 0 && " · "}
									{part.changed ? (
										<mark className={inner("hb-format-lines__changed")}>
											{part.text}
										</mark>
									) : (
										part.text
									)}
								</span>
							))}
						</span>
					)}
				</p>
			)}
		</div>
	);
}
