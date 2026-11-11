import { cx, useBoardSettings, type ScoringEditorProps } from "./settings";
import { FiguresPanel } from "./FiguresPanel";
import { Heading } from "./Heading";
import { ArrowLeftIcon } from "./icons";
import { RaceFormatFooter } from "./RaceFormatFooter";
import { RaceFormatLines } from "./RaceFormatLines";
import { RaceFormatProvider } from "./RaceFormatProvider";
import { useRaceFormatEditor } from "./raceFormatContext";
import { ScoringSections } from "./ScoringSections";

/**
 * Editor of the bracket's scoring and judging mode: sections, then a footer that saves with one
 * `setRaceFormat` action. The figures of a category replace the sections while they are open.
 * Hosts that also edit the timing compose `RaceFormatProvider` and the pieces themselves.
 */
export function ScoringEditor(props: ScoringEditorProps) {
	return (
		<RaceFormatProvider presets={props.presets}>
			<ScoringEditorBody />
		</RaceFormatProvider>
	);
}

function ScoringEditorBody() {
	const editor = useRaceFormatEditor();
	const settings = useBoardSettings();
	const { labels } = settings;
	const category =
		editor.figuresIndex === null
			? undefined
			: editor.scoring?.categories[editor.figuresIndex];

	return (
		<section
			className={cx(!settings.unstyled && "hb-format-editor")}
			aria-label={labels.scoringEditor}
			data-hb-format-root=""
		>
			<RaceFormatLines />
			{category ? (
				<>
					<div className={settings.unstyled ? undefined : "hb-figures__bar"}>
						<button
							type="button"
							className={
								settings.unstyled ? undefined : "hb-button hb-icon-button"
							}
							aria-label={labels.figuresEditor.back}
							onClick={editor.closeFigures}
						>
							<ArrowLeftIcon />
						</button>
						<Heading depth={1}>
							{labels.figuresEditor.title(category.type)}
						</Heading>
					</div>
					<FiguresPanel />
				</>
			) : (
				<ScoringSections />
			)}
			<RaceFormatFooter />
		</section>
	);
}
