import { useState, type ReactNode } from "react";
import {
	currentRaceFormat,
	scoringPresets as corePresets,
	type ScoringCategory,
	type ScoringConfig,
} from "@heatboard/core";
import { useBracketContext } from "../context";
import { errorMessage } from "../labels";
import { useAdmin } from "./admin";
import {
	RaceFormatContext,
	type HostTiming,
	type RaceFormatEditorState,
} from "./raceFormatContext";
import {
	changedSections,
	draftOf,
	formatOf,
	issuesOf,
	planOf,
	type FormatDraft,
} from "./raceFormatDraft";
import { useBoardSettings } from "./settings";

export interface RaceFormatProviderProps {
	/** Starting points offered when manual ranking becomes a method; defaults to the `scoringPresets` of the board, then of the core. */
	presets?: Record<string, ScoringConfig>;
	/** Timing fields of the host: they are saved with the format, in the same action. */
	timing?: HostTiming;
	children: ReactNode;
}

/**
 * Holds the draft of the race format shared by the pieces of the editor (summary, sections,
 * figures, footer). Edits stay local until `save` sends one `setRaceFormat` action.
 */
export function RaceFormatProvider(props: RaceFormatProviderProps) {
	const { bracket } = useBracketContext();
	const settings = useBoardSettings();
	const { run, labels } = useAdmin();
	const presets = props.presets ?? settings.scoringPresets ?? corePresets;
	const { timing } = props;

	const source = JSON.stringify(draftOf(bracket));
	const [draft, setDraft] = useState<FormatDraft>(() => draftOf(bracket));
	const [seen, setSeen] = useState(source);
	const [failure, setFailure] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);
	const [opened, setOpened] = useState<number | null>(null);
	if (seen !== source) {
		setSeen(source);
		setDraft(draftOf(bracket));
	}

	const { scoring } = draft;
	const figuresIndex =
		opened !== null && scoring?.categories[opened] ? opened : null;
	const issues = issuesOf(draft);
	const errorCount = issues.length + (timing?.errors ?? 0);
	const changed = changedSections(bracket, draft, timing?.next);
	const plan = planOf(changed, draft, timing?.next);
	const changeCount = Object.values(changed).filter(Boolean).length;
	const current = currentRaceFormat(bracket);
	const next =
		errorCount > 0 ? current : formatOf(draft, timing?.next ?? current.timing);

	const edit = (value: FormatDraft) => {
		setDraft(value);
		setFailure(null);
		setSaved(false);
	};
	const patchScoring = (change: (config: ScoringConfig) => ScoringConfig) => {
		if (scoring) edit({ ...draft, scoring: change(scoring) });
	};
	const patchCategory = (
		index: number,
		change: (category: ScoringCategory) => ScoringCategory,
	) =>
		patchScoring((config) => ({
			...config,
			categories: config.categories.map((c, i) =>
				i === index ? change(c) : c,
			),
		}));

	const state: RaceFormatEditorState = {
		draft,
		scoring,
		presets,
		edit,
		patchScoring,
		patchCategory,
		issues,
		errorCount,
		changed,
		changeCount,
		plan,
		current,
		next,
		saved,
		failure,
		save: () => {
			setFailure(null);
			for (const action of plan) {
				const result = run(action);
				if (!result.ok) {
					setSaved(false);
					setFailure(errorMessage(labels, result.error));
					return;
				}
			}
			setSaved(true);
		},
		discard: () => {
			setDraft(draftOf(bracket));
			setFailure(null);
			setSaved(false);
			timing?.reset();
		},
		figuresIndex,
		openFigures: setOpened,
		closeFigures: () => setOpened(null),
	};

	return (
		<RaceFormatContext.Provider value={state}>
			{props.children}
		</RaceFormatContext.Provider>
	);
}
