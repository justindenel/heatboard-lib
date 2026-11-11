import type {
	Aggregation,
	BracketStatus,
	HeatStatus,
	JudgingMode,
	ParticipantStatus,
	PenaltyKind,
	PlanProblemCode,
} from "@heatboard/core";

export type Locale = "en" | "fr";

export interface Labels {
	heatStatus: Record<HeatStatus, string>;
	bracketStatus: Record<BracketStatus, string>;
	participantStatus: Record<ParticipantStatus, string>;
	qualified: string;
	/** Short badge and full text of a seed that joins a round directly. */
	seedEntry: { short: string; title: string };
	emptySlot: string;
	needsReview: string;
	heatTitle: (position: number) => string;
	advancing: (count: number) => string;
	maxPerHeat: (count: number) => string;
	rank: (rank: number) => string;
	/** Short form of a heat title, for references between heats ("H3"). */
	heatShort: (position: number) => string;
	/** Where a rider of a judged heat goes: `to` is a round and heat reference. */
	slotDestination: (to: string) => string;
	slotEliminated: string;
	/** Where the rider of an open place comes from: `rank` is an ordinal, `from` a round and heat reference. */
	slotOrigin: (rank: string, from: string) => string;
	expandRound: (name: string) => string;
	collapseRound: (name: string) => string;
	roundCollapsedSummary: (heats: number, places: number) => string;
	/** Shown in the list of a later entry round while a rider is dragged out of that round. */
	entryPoolDropHere: string;
	/** Display names of lycra colors, keyed by lowercase color value. */
	lycraColorNames: Record<string, string>;
	lycra: (color: string) => string;
	entryPoolTitle: string;
	entryPoolEmpty: string;
	dismissError: string;
	/** Messages keyed by `BracketError` or `ServerError` code. */
	errors: Record<string, string>;
	/** Messages keyed by `details.reason`: `DOUBLE_UNAVAILABLE`, `DOUBLE_OPEN` and the automatic `INVALID_STATUS_TRANSITION`. */
	doubleUnavailable: Record<string, string>;
	errorGeneric: string;
	dndRoleDescription: string;
	dndInstructions: string;
	dndStart: (rider: string) => string;
	dndOver: (rider: string, target: string | undefined) => string;
	dndDrop: (rider: string, target: string) => string;
	dndCancel: (rider: string) => string;
	dndRefused: (rider: string, reason: string) => string;
	dndOverCopy: (rider: string, heat: string, round: string) => string;
	dndDropCopy: (rider: string, heat: string, round: string) => string;
	dndOverPool: (rider: string) => string;
	dndDropPool: (rider: string) => string;
	dndDropRank: (rider: string, rank: string) => string;
	dndDropOrder: (rider: string, position: string) => string;
	dndConfirm: (rider: string) => string;
	/** Why the riders of a heat cannot be reordered, by cause. */
	rankingReason: Record<"judged" | "locked" | "points" | "status", string>;
	rankHandle: (rider: string) => string;
	startHeat: string;
	/** Accessible name of the start button of a heat, by its bracket-wide number. */
	startHeatNumbered: (number: number) => string;
	cancelStart: string;
	judgeHeat: string;
	lockHeat: string;
	reopenHeat: string;
	rankByOrder: string;
	clearRanks: string;
	markReviewed: string;
	setByFormat: string;
	participantStatusOf: (rider: string) => string;
	maxPerHeatField: string;
	advancingField: string;
	publishBracket: string;
	unpublishBracket: string;
	validateBracket: string;
	unvalidateBracket: string;
	makePublic: string;
	makePrivate: string;
	resetBracket: string;
	nameField: string;
	add: string;
	remove: string;
	addRound: string;
	addHeat: string;
	removeRound: (name: string) => string;
	removeHeat: (name: string) => string;
	newRoundName: (position: number) => string;
	entryNameField: string;
	entrySeedField: string;
	addEntry: string;
	removeEntry: (name: string) => string;
	entrySeed: (name: string) => string;
	/** Dialog titles keyed by action type. */
	confirmTitle: Record<string, string>;
	confirmTitleGeneric: string;
	confirmImpact: (judgedHeats: number) => string;
	qualificationGained: (rider: string) => string;
	qualificationLost: (rider: string) => string;
	confirmCancel: string;
	confirmConfirm: string;
	confirmSure: string;
	confirmRemoveHeat: (name: string, riders: number) => string;
	confirmRemoveRound: (name: string, heats: number, riders: number) => string;
	confirmReset: (ranks: number, rounds: number) => string;
	confirmStartOpenPlaces: (places: number) => string;
	confirmApplyFormat: string;
	invalidSeed: string;
	visibility: Record<"public" | "private", string>;
	inspect: (name: string) => string;
	openHeatPanel: (name: string) => string;
	closeInspector: string;
	inspectorRiders: string;
	toggleEntryPool: string;
	entryMenu: (name: string) => string;
	formatScore: (value: number) => string;
	/** Aggregated totals, always with two decimals. */
	formatTotal: (value: number) => string;
	heatDurationField: string;
	timerRemaining: (time: string) => string;
	timerElapsed: (time: string) => string;
	timerOver: string;
	/** Countdown shown on the heat that starts at the end of the break. */
	timerBreak: (time: string) => string;
	/** The big pause button of the race, with its tooltips. */
	racePause: {
		pause: string;
		pauseHint: string;
		requested: string;
		requestedHint: string;
		resume: string;
		resumeHint: (breakSec: number) => string;
	};
	/** The words of a race format line: "Heat 10 min · pause 2 min · 2 Wave + 2 Jump · Points · Free judges". */
	raceFormat: {
		duration: (sec: number) => string;
		heat: (duration: string) => string;
		pause: (duration: string) => string;
		counted: (counted: number, type: string) => string;
		judging: Record<JudgingMode, string>;
		/** Inspector line of a heat that has started. */
		ranWith: (line: string) => string;
		/** Tooltips of the marker on a heat that ran with another format. */
		driftCurrent: string;
		driftPrevious: string;
	};
	/** Final place of a rider in a heat judged by placings, then each judge's place, in judge order. */
	placingsLine: (place: string, judgePlaces: string) => string;
	/** Riders tied after scoring, one group per tie. */
	unresolvedTie: (groups: string[][]) => string;
	unresolvedTieHint: string;
	judgeTotal: string;
	judgeSync: Record<
		"loading" | "synced" | "saving" | "diverged" | "revoked",
		string
	>;
	judgeDisabled: Record<"loading" | "notRunning" | "revoked", string>;
	judgeRiderButton: (name: string) => string;
	judgeAddNote: string;
	judgeNoRiders: string;
	judgeNoNotes: string;
	judgeSheet: (name: string) => string;
	judgeClose: string;
	judgeCategory: string;
	judgeFigure: string;
	judgeValues: string;
	judgeNoteChip: (
		type: string,
		figure: string | undefined,
		value: string,
	) => string;
	judgeNoteOptions: (description: string) => string;
	/** Full text of a compact note chip. */
	noteSummary: (
		type: string,
		figure: string | undefined,
		value: string,
		counted: boolean,
	) => string;
	/** Default name of a judge in the live notes, from its position (1-based). */
	judgeShortName: (position: number) => string;
	provisionalRank: (rank: number) => string;
	liveNotes: string;
	/** Averaged notes of a rider, one chip per move. */
	alignedNotes: string;
	/** Full text of an averaged chip; `judges` of `of` judges noted the move. */
	alignedSummary: (
		type: string,
		average: string,
		judges: number,
		of: number,
		figure: string | undefined,
		disagree: boolean,
	) => string;
	/** Toggle showing the notes of each judge under the averages. */
	judgeDetails: string;
	judgeEditNote: string;
	judgeDeleteNote: string;
	judgeEditing: string;
	judgeUndo: string;
	judgeNoteSaved: (name: string, value: string) => string;
	/** Head-judge page of a judge. */
	judgeQueue: string;
	judgeQueueEmpty: string;
	judgeRiders: string;
	judgeValidate: string;
	unseen: string;
	/** Heading of the grid sheet of an announced ride. */
	judgeRideSheet: (
		name: string,
		type: string,
		figure: string | undefined,
	) => string;
	/** Option of the figure choice meaning "no figure". */
	noFigure: string;
	headJudgeRiders: string;
	headJudgeCategory: string;
	headJudgeFigure: string;
	headJudgeRiderButton: (name: string) => string;
	headJudgeAnnounced: string;
	headJudgeNone: string;
	/** Manual ordering of a running heat by the head judge. */
	judgeRanking: {
		title: string;
		hint: string;
		moveUp: (rider: string) => string;
		moveDown: (rider: string) => string;
		position: (rank: number, total: number) => string;
		computed: string;
		manual: string;
		revert: string;
		tied: string;
	};
	headJudgeProgress: (noted: number, judges: number, unseen: number) => string;
	headJudgeRetract: string;
	headJudgeRetractAria: (description: string) => string;
	headJudgeRetractConfirm: string;
	headJudgeRetractYes: string;
	/** Mention on ride means that do not make the result. */
	indicative: string;
	categoryLine: (type: string) => string;
	categorySubtotal: (type: string, value: string) => string;
	/** Full text of a ride mean chip; `noted` of `of` judges gave a note. */
	rideMeanSummary: (
		type: string,
		mean: string,
		noted: number,
		of: number,
		figure: string | undefined,
		counted: boolean,
		indicative: boolean,
	) => string;
	rideUnseenSummary: (type: string, figure: string | undefined) => string;
	judgePlaces: string;
	viewerDisplay: string;
	viewerDisplayOptions: Record<
		"typeSubtotals" | "rides" | "judgePlaces" | "judges",
		string
	>;
	scoringEditor: string;
	scoringMethod: string;
	scoringMethods: Record<
		"manual" | "placings" | "points" | "rideMeans",
		string
	>;
	scoringScale: Record<"min" | "max" | "step", string>;
	scoringAggregation: string;
	scoringAggregations: Record<Aggregation, string>;
	scoringTrimPlacings: string;
	scoringPriorityType: string;
	scoringNoPriority: string;
	scoringAlignWindow: string;
	scoringCategoryType: string;
	scoringCategoryCounted: string;
	scoringCategoryCoefficient: string;
	scoringAddCategory: string;
	scoringRemoveCategory: (type: string) => string;
	scoringJudgingMode: string;
	judgingModes: Record<JudgingMode, string>;
	/** Reasons the scoring cannot be applied, keyed by problem code. */
	scoringProblems: Record<string, string>;
	scoringColumns: Record<"category" | "counted" | "coefficient", string>;
	/** Title of the plain-language sentence under the categories. */
	scoringPlain: string;
	/** Checkbox of a category with at least two families. */
	scoringDistinctFamilies: (type: string) => string;
	scoringFigures: string;
	scoringFiguresSummary: (figures: number, families: number) => string;
	scoringFiguresNone: string;
	scoringFiguresAdd: string;
	scoringFiguresOpen: string;
	scoringFiguresOpenAria: (type: string) => string;
	scoringJudgingModeHints: Record<JudgingMode, string>;
	scoringDetails: string;
	/** Pieces of the one-line summary of the closed details block. */
	scoringDetailsSummary: {
		scale: (min: number, max: number, step: number) => string;
		aggregation: (aggregation: Aggregation) => string;
		tieBreak: (priorityType: string | undefined) => string;
		window: (seconds: number) => string;
	};
	scoringScaleWords: Record<"label" | "from" | "to" | "by", string>;
	scoringAggregationHint: string;
	scoringPriorityOption: (type: string) => string;
	scoringAlignWindowHint: string;
	scoringAlignWindowHidden: string;
	scoringTemplatesHint: string;
	scoringTemplatesNote: string;
	/** Summary line, tags and footer of the race format panel. */
	raceFormatEditor: {
		inForce: string;
		afterSave: string;
		fixFirst: (count: number) => string;
		save: string;
		/** Shorter form of `save`, for narrow screens. */
		saveShort: string;
		discard: string;
		noChange: string;
		changes: (count: number) => string;
		problems: (count: number) => string;
		goToFirst: string;
		appliesLater: string;
		saved: string;
		failed: (message: string) => string;
		modified: string;
		errors: (count: number) => string;
	};
	/** Panel of the families and figures of one category. */
	figuresEditor: {
		title: (type: string) => string;
		back: string;
		close: string;
		hint: string;
		variants: string;
		variantsEdit: string;
		variantsDone: string;
		variantAdd: string;
		variantCode: string;
		variantName: string;
		variantRemove: (code: string) => string;
		variantsEmpty: string;
		search: string;
		count: (figures: number, families: number) => string;
		columns: Record<"code" | "name" | "variants", string>;
		familyMove: (name: string) => string;
		familyRename: (name: string) => string;
		familyName: string;
		familyUp: (name: string) => string;
		familyDown: (name: string) => string;
		familyRemove: (name: string) => string;
		familyFigures: (count: number) => string;
		familyAdd: string;
		familyGroup: (name: string) => string;
		noResults: string;
		removeTitle: (name: string) => string;
		removeAll: (count: number) => string;
		removeBody: (count: number) => string;
		removeInto: string;
		removeConfirm: string;
		figureMove: (code: string) => string;
		figureCode: string;
		figureName: string;
		figureNameOptional: string;
		figureVariants: (code: string) => string;
		figureAddVariant: string;
		figureVariantsOf: (code: string) => string;
		figureUp: (code: string) => string;
		figureDown: (code: string) => string;
		figureRemove: (code: string) => string;
		figureAdd: (family: string) => string;
		movedFigure: (code: string, family: string, position: number) => string;
		movedFamily: (name: string, position: number) => string;
		dragPickedUp: (name: string) => string;
		dragDropped: (name: string) => string;
		dragCancelled: (name: string) => string;
	};
	/** Entry sheet of a judge: category, figure, variant, score. */
	judgeEntry: {
		category: string;
		figure: string;
		variant: (figure: string) => string;
		noVariant: string;
		/** What follows the code of the chosen figure, e.g. `Forward one hand · family Forward`. */
		recap: (name: string, family: string) => string;
		score: string;
		announce: string;
	};
	penalties: string;
	penaltyKinds: Record<PenaltyKind, string>;
	penaltyRider: string;
	penaltyType: string;
	penaltyKind: string;
	penaltyAdd: string;
	penaltyNone: string;
	penaltyItem: (rider: string, type: string, kind: string) => string;
	penaltyRemove: (description: string) => string;
	penaltyDsqSuggested: (rider: string) => string;
	formatEditor: string;
	formatEmpty: string;
	formatReshuffle: string;
	formatPlacementOptions: Record<"branch" | "spread", string>;
	formatPlacementHelp: Record<"branch" | "spread", string>;
	formatRepechageName: (position: number) => string;
	formatPreview: (sizes: number[]) => string;
	formatWarningRematch: (heat: string, source: string) => string;
	formatWarningTooManyHeats: (
		round: string,
		riders: number,
		heats: number,
	) => string;
	formatProblem: (path: string, message: string) => string;
	formatEntryRoundMissing: (round: string) => string;
	formatImport: string;
	formatExport: string;
	formatJson: string;
	formatLoadJson: string;
	formatCloseJson: string;
	formatApply: string;
	formatDiscard: string;
	formatUnchanged: string;
	formatLocked: string;
	/** Display names of `bracketTemplates` by template id. */
	bracketTemplates: Record<string, { name: string; description: string }>;
	/** Presents a template name as an example to start from, not a rule. */
	exampleTemplate: (name: string) => string;
	scoringTemplates: string;
	/** Pieces of the sentence `describeScoring` writes. */
	scoringSentence: {
		manual: string;
		scale: (min: number, max: number, step: number) => string;
		/** `list` is the already joined `categoryCount` items. */
		categories: (list: string) => string;
		categoryCount: (
			counted: number,
			type: string,
			coefficient: number | undefined,
		) => string;
		and: string;
		placings: (trimmed: boolean) => string;
		points: (aggregation: Aggregation) => string;
		rideMeans: (aggregation: Aggregation) => string;
		tieBreak: (priorityType: string | undefined) => string;
		/** Rule of a category whose counted rides must come from different families. */
		distinctFamilies: (
			counted: number,
			type: string,
			families: string[],
		) => string;
	};
	/** Names of the rounds a generated format creates (repechage ones are `formatRepechageName`). */
	formatRoundNames: {
		round: (position: number) => string;
		quarterFinals: string;
		semiFinals: string;
		smallFinal: string;
		final: string;
		double: (position: number) => string;
		doubleFinal: string;
		superFinal: string;
	};
	/** Round-by-round editor. */
	formatRows: {
		riders: string;
		ridersHelp: string;
		heatsInRound1: string;
		advance: string;
		repechageAfterFirst: string;
		columns: {
			round: string;
			heats: string;
			advance: string;
			repechage: string;
			seedSlots: string;
			duration: string;
			state: string;
		};
		/** Riders arriving in a round, of which `fromRepechage` come from the repechage and `seedSlots` join directly. */
		incoming: (
			count: number,
			fromRepechage: number,
			seedSlots?: number,
		) => string;
		setAbove: string;
		auto: string;
		modified: string;
		/** Accessible names of the two buttons of a stepper. */
		less: (field: string) => string;
		more: (field: string) => string;
		menu: (round: string) => string;
		resetFollowing: string;
		remove: string;
		addRound: string;
		repechageGoesTo: (round: string) => string;
		smallFinal: string;
		adjust: string;
		summary: (rounds: number, heats: number, modified: number) => string;
		problemsTitle: string;
		problems: Record<PlanProblemCode, (where: string) => string>;
		moreOptions: string;
		fill: string;
		fillOptions: Record<"serpentine" | "draw", string>;
		fillHelp: Record<"serpentine" | "draw", string>;
		placement: string;
		placementHelp: string;
		placementSame: (from: string, to: string) => string;
		showPlacementDetail: string;
		hidePlacementDetail: string;
		readOnly: string;
		importNotRows: string;
	};
	/** Explanation of how the qualifiers of a round are placed in the next one. */
	formatPlacementNote: {
		title: (from: string, to: string) => string;
		diagram: (from: string, to: string) => string;
		legend: { first: string; second: string; repechage: string };
		focusHint: string;
		focusHeat: (heat: string) => string;
		same: string;
		branch: string;
		spread: string;
		/** `heat` is e.g. "Semi-finals, Heat 1", `from` the feeders of that heat. */
		example: (heat: string, from: string) => string;
		top: (count: number, source: string, heats: number[]) => string;
		ranked: (rank: number, source: string, heats: number[]) => string;
	};
	formatShape: {
		title: string;
		/** Accessible name of the preview container. */
		region: string;
		summary: (riders: number) => string;
		heats: (count: number) => string;
		rounds: (count: number) => string;
		/** Reading of a heat fed by two lanes, e.g. 3 riders from the main path and 1 from the repechage. */
		composition: (own: number, foreign: number) => string;
		/** Seeds joining a round directly, shown under its name. */
		seedSlots: (count: number) => string;
		/** Group names by group key; other keys are shown as they are. */
		groups: Record<"main" | "repechage" | "double", string>;
		optional: string;
	};
}

function breakDuration(sec: number): string {
	return sec % 60 === 0 ? `${sec / 60} min` : `${sec} s`;
}

function englishOrdinal(n: number): string {
	const tens = n % 100;
	if (tens >= 11 && tens <= 13) return `${n}th`;
	switch (n % 10) {
		case 1:
			return `${n}st`;
		case 2:
			return `${n}nd`;
		case 3:
			return `${n}rd`;
		default:
			return `${n}th`;
	}
}

/** "heat 1", "heats 1 and 3", "heats 1, 2 and 3". */
function heatsList(numbers: number[], and: string): string {
	const last = numbers[numbers.length - 1];
	const list =
		numbers.length <= 1
			? String(last)
			: `${numbers.slice(0, -1).join(", ")} ${and} ${last}`;
	return `${numbers.length > 1 ? "heats" : "heat"} ${list}`;
}

const en: Labels = {
	heatStatus: {
		pending: "Pending",
		running: "Running",
		judged: "Judged",
		locked: "Locked",
	},
	bracketStatus: {
		draft: "Draft",
		published: "Ready",
		running: "Running",
		finished: "Finished",
		validated: "Validated",
	},
	participantStatus: {
		DNF: "Did not finish",
		DSQ: "Disqualified",
		DNS: "Did not start",
	},
	qualified: "Qualified",
	seedEntry: { short: "Seed", title: "Seed" },
	emptySlot: "Open slot",
	needsReview: "Needs review",
	heatTitle: (position) => `Heat ${position}`,
	advancing: (count) => `${count} qualified`,
	maxPerHeat: (count) => `${count} per heat`,
	rank: englishOrdinal,
	heatShort: (position) => `H${position}`,
	slotDestination: (to) => `\u2192 ${to}`,
	slotEliminated: "eliminated",
	slotOrigin: (rank, from) => `${rank} \u00B7 ${from}`,
	expandRound: (name) => `Show ${name}`,
	collapseRound: (name) => `Hide ${name}`,
	roundCollapsedSummary: (heats, places) =>
		`${heats} ${heats === 1 ? "heat" : "heats"} \u00B7 ${places} ${places === 1 ? "place" : "places"}`,
	entryPoolDropHere: "Drop here to take the rider out of the round",
	lycraColorNames: {
		red: "red",
		blue: "blue",
		yellow: "yellow",
		green: "green",
		white: "white",
		black: "black",
		orange: "orange",
		pink: "pink",
		purple: "purple",
		grey: "grey",
		gray: "grey",
	},
	lycra: (color) => `Lycra: ${color}`,
	entryPoolTitle: "Unplaced riders",
	entryPoolEmpty: "Every rider is placed",
	dismissError: "Dismiss",
	errors: {
		HEAT_FULL: "This heat is full.",
		HEAT_STARTED: "This heat has started and can no longer be changed.",
		HEAT_LOCKED: "This heat is locked.",
		HEAT_JUDGED: "This heat has been judged and can no longer be changed.",
		RIDER_ALREADY_IN_ROUND: "This rider is already in this round.",
		CROSS_ROUND_MOVE: "Riders cannot be moved from one round to another.",
		BEFORE_ENTRY_ROUND: "This rider only enters in a later round.",
		BRACKET_VALIDATED: "The bracket is validated and can no longer be changed.",
		UNKNOWN_HEAT: "This heat no longer exists.",
		UNKNOWN_RIDER: "This rider is not registered.",
		RIDER_NOT_IN_HEAT: "This rider is no longer in this heat.",
		INVALID_ARGUMENT: "This position is not valid.",
		OTHER_POOL_ROUND: "This is not the round this list is for.",
		SERVER_ERROR: "The server refused the change.",
		UNKNOWN_ROUND: "This round no longer exists.",
		HEAT_NOT_JUDGED: "Every source heat must be judged first.",
		HEAT_NOT_RANKED: "Every rider needs a rank or a status first.",
		HEAT_EMPTY: "No rider is known in this heat yet.",
		INVALID_STATUS_TRANSITION: "This status change is not possible now.",
		BRACKET_NOT_PUBLISHED: "Mark the bracket as ready before starting a heat.",
		FORMAT_LOCKED:
			"The rounds follow the format: change them with the round settings of the bracket.",
		INVALID_MAX: "This size is not valid.",
		MAX_BELOW_CURRENT: "A heat already holds more riders than this.",
		INVALID_RANKS: "These ranks are not valid.",
		DUPLICATE_ID: "This identifier is already used.",
		ROUND_STARTED: "This round has started.",
		ROUND_REFERENCED: "A rider enters the bracket at this round.",
		RIDER_IN_STARTED_HEAT: "This rider is in a heat that has started.",
		DESTRUCTIVE_CHANGE: "This change needs confirmation.",
		DOWNSTREAM_STARTED:
			"A later heat holding one of these riders has started: cancel its start first.",
		HEAT_HAS_RANKS: "Clear the ranks of this heat before cancelling its start.",
		HEAT_NOT_RUNNING: "Only a running heat can be reordered.",
		NO_SCORING: "This bracket has no scoring.",
		UNRESOLVED_TIE:
			"Riders are still tied after scoring. Break the tie in \u201CForce the heat order\u201D: move one of the tied riders.",
		SIMULATE_WHILE_RUNNING:
			"A heat is running or a break is counting down: wait for it to end before simulating.",
		INVALID_SCORING:
			"This scoring is not allowed here: the ride means method needs head-judge mode.",
		INVALID_PENALTY: "This penalty is not valid.",
		INVALID_FORMAT: "These round settings are not valid.",
		ROUND_LIMIT:
			"This change creates and removes too many rounds at once (97 at most).",
		DOUBLE_OPEN: "The double elimination is already open.",
		DOUBLE_NOT_OPEN: "There is no double elimination to remove.",
		DOUBLE_STARTED:
			"A heat of the double elimination has started: it can no longer be removed.",
		DOUBLE_UNAVAILABLE: "The double elimination is not available here.",
	},
	doubleUnavailable: {
		NO_FORMAT: "This bracket was not created from round settings.",
		FORMAT_MISMATCH:
			"The rounds no longer match the round settings: adjust the rounds first.",
		NOT_SINGLE_ELIMINATION:
			"Only a plain elimination bracket can have one: remove the repechage, the small final and optional rounds first.",
		FINAL_TOO_SMALL: "The final has too few riders.",
		NOTHING_ELIMINATED: "Nobody is eliminated in the first round.",
		KEY_CONFLICT: "A round name is already used.",
		ROUND_LIMIT: "That would make too many rounds.",
		HEAT_LIMIT: "That would make too many heats.",
		HAS_DOUBLE_ELIMINATION: "The double elimination is already open.",
		UNEVEN_HEATS: "The heats of the first round are too uneven.",
		APPLY_FORMAT:
			"Remove the double elimination first to change the round settings.",
		TABLE_NOT_FINISHED:
			"The double elimination opens once every heat of the first table is judged.",
		AUTOMATIC:
			"This status follows the heats: it changes by itself once they are judged.",
	},
	errorGeneric: "This change is not allowed.",
	dndRoleDescription: "draggable rider",
	dndInstructions:
		"Press space to pick up a rider. Use the arrow keys to move it, space to drop it, escape to cancel.",
	dndStart: (rider) => `Picked up ${rider}.`,
	dndOver: (rider, target) =>
		target === undefined
			? `${rider} is not over a heat.`
			: `${rider} is over ${target}.`,
	dndDrop: (rider, target) => `${rider} was dropped in ${target}.`,
	dndCancel: (rider) => `Move cancelled, ${rider} was not moved.`,
	dndRefused: (rider, reason) => `${rider} was not moved. ${reason}`,
	dndOverCopy: (rider, heat, round) =>
		`${rider} will be added to ${heat} of ${round}.`,
	dndDropCopy: (rider, heat, round) =>
		`${rider} was added to ${heat} of ${round}.`,
	dndOverPool: (rider) => `${rider} will be removed from the heat.`,
	dndDropPool: (rider) =>
		`${rider} was removed from the heat and is unplaced again.`,
	dndDropRank: (rider, rank) => `${rider} is now ranked ${rank}.`,
	dndDropOrder: (rider, position) =>
		`${rider} now comes ${position} in the order.`,
	dndConfirm: (rider) =>
		`${rider} was dropped. Confirm the change to apply it.`,
	rankingReason: {
		judged: "Heat judged: reopen it to change the ranking.",
		locked: "Heat locked: unlock and reopen it to change the ranking.",
		points: "The ranking follows the scores of this heat.",
		status: "A rider with a status is not ranked.",
	},
	rankHandle: (rider) => `Reorder ${rider}`,
	startHeat: "Start",
	startHeatNumbered: (number) => `Start heat ${number}`,
	cancelStart: "Cancel start",
	judgeHeat: "Judge",
	lockHeat: "Lock",
	reopenHeat: "Reopen",
	rankByOrder: "Rank by order",
	clearRanks: "Clear ranks",
	markReviewed: "Mark as reviewed",
	setByFormat: "Heats and qualifiers are set by the format.",
	participantStatusOf: (rider) => `Status of ${rider}`,
	maxPerHeatField: "Riders per heat",
	advancingField: "Qualified",
	publishBracket: "Mark as ready",
	unpublishBracket: "Back to draft",
	validateBracket: "Validate",
	unvalidateBracket: "Unvalidate",
	makePublic: "Make public",
	makePrivate: "Make private",
	resetBracket: "Reset",
	nameField: "Name",
	add: "Add",
	remove: "Remove",
	addRound: "Add round",
	addHeat: "Add heat",
	removeRound: (name) => `Remove ${name}`,
	removeHeat: (name) => `Remove ${name}`,
	newRoundName: (position) => `Round ${position}`,
	entryNameField: "Rider name",
	entrySeedField: "Seed",
	addEntry: "Add rider",
	removeEntry: (name) => `Remove ${name}`,
	entrySeed: (name) => `Seed of ${name}`,
	confirmTitle: {
		updateRound: "Change the number of qualified riders?",
		removeHeat: "Remove this heat?",
		removeRound: "Remove this round?",
		reset: "Reset the bracket?",
		applyFormat: "Apply the format?",
		setHeatStatus: "Start this incomplete heat?",
	},
	confirmTitleGeneric: "Confirm this change?",
	confirmImpact: (count) =>
		count === 1
			? "This affects 1 judged heat."
			: `This affects ${count} judged heats.`,
	qualificationGained: (rider) => `${rider} becomes qualified`,
	qualificationLost: (rider) => `${rider} is no longer qualified`,
	confirmCancel: "Cancel",
	confirmConfirm: "Confirm",
	confirmSure: "Are you sure?",
	confirmRemoveHeat: (name, riders) =>
		`${name} will be removed, along with ${riders === 1 ? "1 placement" : `${riders} placements`}.`,
	confirmRemoveRound: (name, heats, riders) =>
		`${name} will be removed, with ${heats === 1 ? "1 heat" : `${heats} heats`} and ${riders === 1 ? "1 placement" : `${riders} placements`}.`,
	confirmReset: (ranks, rounds) =>
		`${ranks === 1 ? "1 rank" : `${ranks} ranks`} will be cleared and ${rounds === 1 ? "1 round" : `${rounds} rounds`} emptied.`,
	confirmStartOpenPlaces: (places) =>
		places === 1
			? "1 place is still waiting for its rider, who cannot join this heat once it has started."
			: `${places} places are still waiting for their riders, who cannot join this heat once it has started.`,
	confirmApplyFormat:
		"Applying replaces the rounds and redraws round 1. Riders placed by hand will be moved. Continue?",
	invalidSeed: "The seed must be a whole number, 1 or more.",
	visibility: { public: "Public", private: "Private" },
	inspect: (name) => `Options for ${name}`,
	openHeatPanel: (name) => `Open the panel of ${name}`,
	closeInspector: "Close",
	inspectorRiders: "Riders",
	toggleEntryPool: "Show or hide unplaced riders",
	entryMenu: (name) => `Options for ${name}`,
	formatScore: (value) =>
		value.toLocaleString("en", { maximumFractionDigits: 2 }),
	formatTotal: (value) =>
		value.toLocaleString("en", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}),
	heatDurationField: "Heat duration (min)",
	timerRemaining: (time) => `${time} remaining`,
	timerElapsed: (time) => `${time} elapsed`,
	timerOver: "Time is up",
	timerBreak: (time) => `Starts in ${time}`,
	racePause: {
		pause: "Pause the race",
		pauseHint:
			"The heat in progress runs to the end of its timer, then the race stops.",
		requested: "Pause after this heat",
		requestedHint:
			"The race will stop at the end of the heat in progress. Click to cancel.",
		resume: "Resume",
		resumeHint: (breakSec) =>
			breakSec === 0
				? "Resuming starts the next heat right away."
				: `Resuming starts with a ${breakDuration(breakSec)} break before the next heat.`,
	},
	raceFormat: {
		duration: breakDuration,
		heat: (duration) => `Heat ${duration}`,
		pause: (duration) => `break ${duration}`,
		counted: (counted, type) => `${counted} ${type}`,
		judging: { free: "Free judges", headJudge: "Head judge" },
		ranWith: (line) => `Ran with: ${line}`,
		driftCurrent:
			"This heat ran with a format other than the one in force now.",
		driftPrevious: "This heat ran with a format other than the previous heat.",
	},
	placingsLine: (place, judgePlaces) => `${place} — judges: ${judgePlaces}`,
	unresolvedTie: (groups) =>
		`Tied after scoring: ${groups.map((g) => g.join(" = ")).join("; ")}.`,
	unresolvedTieHint: "Rank them by hand, then judge the heat.",
	judgeTotal: "Total",
	judgeSync: {
		loading: "Loading",
		synced: "Synced",
		saving: "Saving",
		diverged: "Not synced",
		revoked: "Access revoked",
	},
	judgeDisabled: {
		loading: "Loading your scores.",
		notRunning: "Scoring is closed: the heat is not running.",
		revoked: "Your access was revoked. Scoring is disabled.",
	},
	judgeRiderButton: (name) => `Score ${name}`,
	judgeAddNote: "+ Score",
	judgeNoRiders: "No rider to score in this heat.",
	judgeNoNotes: "No score yet",
	judgeSheet: (name) => `Score ${name}`,
	judgeClose: "Close without scoring",
	judgeCategory: "Type",
	judgeFigure: "Figure (optional)",
	judgeValues: "Score",
	judgeNoteChip: (type, figure, value) =>
		`${figure ? `${type}, ${figure}` : type}: ${value}`,
	judgeNoteOptions: (description) => `Options for ${description}`,
	noteSummary: (type, figure, value, counted) =>
		`${type} ${value}${figure ? `, ${figure}` : ""}${counted ? ", counted" : ""}`,
	judgeShortName: (position) => `J${position}`,
	liveNotes: "Scores by judge",
	alignedNotes: "Average scores",
	alignedSummary: (type, average, judges, of, figure, disagree) =>
		`${type}, average ${average} from ${judges} of ${of} judges${figure ? `, figure ${figure}` : ""}${disagree ? ", judges disagree on the figure" : ""}`,
	judgeDetails: "Judge details",
	provisionalRank: (rank) => `Provisional rank ${englishOrdinal(rank)}`,
	judgeEditNote: "Edit",
	judgeDeleteNote: "Delete",
	judgeEditing: "Editing a score",
	judgeUndo: "Undo last score",
	judgeNoteSaved: (name, value) => `${value} recorded for ${name}`,
	judgeQueue: "To score",
	judgeQueueEmpty: "Nothing waiting.",
	judgeRiders: "Riders",
	judgeValidate: "Confirm",
	unseen: "Not seen",
	judgeRideSheet: (name, type, figure) =>
		`Score ${name}, ${figure ? `${type}, ${figure}` : type}`,
	noFigure: "No figure",
	headJudgeRiders: "Riders",
	headJudgeCategory: "Category",
	headJudgeFigure: "Figure",
	headJudgeRiderButton: (name) => `Announce a ride for ${name}`,
	headJudgeAnnounced: "Announced rides",
	headJudgeNone: "No ride announced yet.",
	judgeRanking: {
		title: "Force the heat order (exceptional)",
		hint: "Overrides the computed ranking: validating the heat keeps the order set by hand here.",
		moveUp: (rider) => `Move ${rider} up`,
		moveDown: (rider) => `Move ${rider} down`,
		position: (rank, total) => `${rank} of ${total}`,
		computed: "Computed from the notes",
		manual: "Manual order active",
		revert: "Back to the computed ranking",
		tied: "Tied",
	},
	headJudgeProgress: (noted, judges, unseen) =>
		`${noted}/${judges} scored${unseen > 0 ? ` · ${unseen} not seen` : ""}`,
	headJudgeRetract: "Retract",
	headJudgeRetractAria: (description) => `Retract ${description}`,
	headJudgeRetractConfirm: "Retract this ride? Its scores are removed with it.",
	headJudgeRetractYes: "Yes, retract",
	indicative: "indicative",
	categoryLine: (type) => type,
	categorySubtotal: (type, value) => `${type} subtotal ${value}`,
	rideMeanSummary: (type, mean, noted, of, figure, counted, indicative) =>
		`${type}, mean ${mean} from ${noted} of ${of} judges${figure ? `, figure ${figure}` : ""}${counted ? ", counted" : ""}${indicative ? ", indicative" : ""}`,
	rideUnseenSummary: (type, figure) =>
		`${figure ? `${type}, ${figure}` : type}, not seen`,
	judgePlaces: "Places",
	viewerDisplay: "Spectator view",
	viewerDisplayOptions: {
		typeSubtotals: "Subtotal per category",
		rides: "Ride details",
		judgePlaces: "Places of each judge",
		judges: "Judges' notes",
	},
	scoringEditor: "Scoring",
	scoringMethod: "Method",
	scoringMethods: {
		manual: "Manual ranking",
		placings: "Places of each judge",
		points: "Points",
		rideMeans: "Ride means",
	},
	scoringScale: { min: "Scale min", max: "Scale max", step: "Scale step" },
	scoringAggregation: "Judges' notes",
	scoringAggregations: {
		mean: "Mean",
		trimmedMean: "Trimmed mean",
		sum: "Sum",
	},
	scoringTrimPlacings: "Trim placings",
	scoringPriorityType: "Tie-break",
	scoringNoPriority: "Best single score",
	scoringAlignWindow: "Alignment window",
	scoringCategoryType: "Category name",
	scoringCategoryCounted: "Counted rides",
	scoringCategoryCoefficient: "Coefficient",
	scoringAddCategory: "Add a category",
	scoringRemoveCategory: (type) => `Remove category ${type || "(unnamed)"}`,
	scoringJudgingMode: "Judging mode",
	judgingModes: { free: "Free", headJudge: "Head judge" },
	scoringProblems: {
		"scale.min": "The scale minimum must be a multiple of the step.",
		"scale.max":
			"The scale maximum must be a multiple of the step and above the minimum.",
		"scale.step": "The scale step must be 1 or 0.5.",
		alignWindowSec: "The alignment window must be a whole number of seconds.",
		noCategory: "Add at least one category.",
		categoryType: "Every category needs a name.",
		categoryDuplicate: "Category names must be unique.",
		categoryCounted: "Counted rides must be a whole number, at least 1.",
		categoryCoefficient: "A coefficient must be above 0.",
		priorityType: "The tie-break category must be one of the categories.",
		rideMeansNeedsHeadJudge: "Ride means need the head-judge mode.",
		figureCodeEmpty: "A figure needs a code.",
		figureCodeDuplicate: "This code is already used in this category.",
		familyNameEmpty: "A family needs a name.",
		familyNameDuplicate: "Family names must be unique in a category.",
		variantCodeEmpty: "A variant needs a code.",
		variantCodeDuplicate: "This variant code is already used.",
		variantNameEmpty: "A variant needs a name.",
		scoringInvalid: "This scoring is not valid.",
	},
	scoringPlain: "In plain words",
	scoringColumns: {
		category: "Category",
		counted: "Counted",
		coefficient: "Coefficient",
	},
	scoringDistinctFamilies: (type) =>
		`Counted ${type} must be of different families`,
	scoringFigures: "Figures",
	scoringFiguresSummary: (figures, families) =>
		figures === 0
			? `none, ${families} ${families === 1 ? "family" : "families"}`
			: `${figures} ${figures === 1 ? "figure" : "figures"} in ${families} ${
					families === 1 ? "family" : "families"
				}`,
	scoringFiguresNone: "none",
	scoringFiguresAdd: "Add figures",
	scoringFiguresOpen: "Open",
	scoringFiguresOpenAria: (type) => `Figures of ${type || "(unnamed)"}`,
	scoringJudgingModeHints: {
		free: "Each judge creates and scores their own rides.",
		headJudge:
			"The head judge announces every ride; the judges score the quality.",
	},
	scoringDetails: "Scoring details",
	scoringDetailsSummary: {
		scale: (min, max, step) => `Score from ${min} to ${max} by ${step}`,
		aggregation: (aggregation) =>
			({
				mean: "judges averaged",
				trimmedMean: "trimmed mean",
				sum: "judges added",
			})[aggregation],
		tieBreak: (priorityType) =>
			priorityType === undefined
				? "tie-break: best single score"
				: `tie-break: best ${priorityType} score`,
		window: (seconds) => `window ${seconds} s`,
	},
	scoringScaleWords: { label: "Score scale", from: "from", to: "to", by: "by" },
	scoringAggregationHint:
		"Trimmed mean: without the highest and the lowest, from 3 judges.",
	scoringPriorityOption: (type) => `Best ${type} score, then single score`,
	scoringAlignWindowHint:
		"Groups, on display, the notes of several judges on the same ride. Free mode only; no effect on the ranking. Empty: 30 s.",
	scoringAlignWindowHidden:
		"Alignment window hidden: it is only used in free mode.",
	scoringTemplatesHint:
		"Replaces the scoring and the judging mode being edited",
	scoringTemplatesNote: 'Nothing is applied before "Save the format".',
	raceFormatEditor: {
		inForce: "In force",
		afterSave: "After saving",
		fixFirst: (count) =>
			`${count} ${count === 1 ? "point" : "points"} to fix first`,
		save: "Save the format",
		saveShort: "Save",
		discard: "Cancel",
		noChange: "No change",
		changes: (count) => `${count} ${count === 1 ? "change" : "changes"}`,
		problems: (count) => `${count} ${count === 1 ? "point" : "points"} to fix`,
		goToFirst: "Go to the first",
		appliesLater:
			"Applies to heats that start from now on; the heat in progress keeps its format.",
		saved: "Saved. The next heat to start will take this format.",
		failed: (message) =>
			`The format was not saved: ${message} Your input is kept.`,
		modified: "Modified",
		errors: (count) => `${count} ${count === 1 ? "error" : "errors"}`,
	},
	figuresEditor: {
		title: (type) => `Figures · ${type || "(unnamed)"}`,
		back: "Back to the format",
		close: "Close the figures",
		hint: "Drag ⠿ to reorder or to move a figure to another family; from the keyboard, use ↑ ↓.",
		variants: "Variants",
		variantsEdit: "Edit",
		variantsDone: "Done",
		variantAdd: "Add a variant",
		variantCode: "Variant code",
		variantName: "Variant name",
		variantRemove: (code) => `Remove the variant ${code || "(no code)"}`,
		variantsEmpty: "No variant yet.",
		search: "Find a code or a name",
		count: (figures, families) =>
			`${figures} ${figures === 1 ? "figure" : "figures"} · ${families} ${
				families === 1 ? "family" : "families"
			}`,
		columns: { code: "Code", name: "Name", variants: "Variants" },
		familyMove: (name) => `Move the family ${name}`,
		familyRename: (name) => `Rename the family ${name}`,
		familyName: "Family name",
		familyUp: (name) => `Move the family ${name} up`,
		familyDown: (name) => `Move the family ${name} down`,
		familyRemove: (name) => `Remove the family ${name}`,
		familyFigures: (count) => `${count} ${count === 1 ? "figure" : "figures"}`,
		familyAdd: "Add a family of figures",
		familyGroup: (name) => `Family ${name}`,
		noResults: "No figure matches.",
		removeAll: (count) =>
			`It holds ${count} ${count === 1 ? "figure" : "figures"}; they are removed with it.`,
		removeTitle: (name) => `Remove the family "${name}"?`,
		removeBody: (count) =>
			`It holds ${count} ${count === 1 ? "figure" : "figures"}. Move them to:`,
		removeInto: "Destination family",
		removeConfirm: "Remove and move",
		figureMove: (code) => `Move ${code || "the figure"}`,
		figureCode: "Code",
		figureName: "Name",
		figureNameOptional: "Name (optional)",
		figureVariants: (code) => `Variants of ${code || "the figure"}`,
		figureAddVariant: "+ Variant",
		figureVariantsOf: (code) => `Variants allowed for ${code || "the figure"}`,
		figureUp: (code) => `Move ${code || "the figure"} up`,
		figureDown: (code) => `Move ${code || "the figure"} down`,
		figureRemove: (code) => `Delete ${code || "the figure"}`,
		figureAdd: (family) => `Add a figure to ${family || "the family"}`,
		movedFigure: (code, family, position) =>
			`${code} moved to ${family}, position ${position}`,
		movedFamily: (name, position) => `${name} moved to position ${position}`,
		dragPickedUp: (name) => `Picked up ${name}`,
		dragDropped: (name) => `Dropped ${name}`,
		dragCancelled: (name) => `Move of ${name} cancelled`,
	},
	judgeEntry: {
		category: "Category",
		figure: "Figure (optional)",
		variant: (figure) => `Variant of ${figure} (optional)`,
		noVariant: "None",
		recap: (name, family) => `${name} · family ${family}`,
		score: "Score (tap one to save)",
		announce: "Announce the ride",
	},
	penalties: "Penalties",
	penaltyKinds: {
		zeroBest: "Best ride at 0",
		zeroSecondBest: "2nd best ride at 0",
		halfSecondBest: "2nd best ride halved",
	},
	penaltyRider: "Rider",
	penaltyType: "Category",
	penaltyKind: "Penalty",
	penaltyAdd: "Add penalty",
	penaltyNone: "No penalty.",
	penaltyItem: (rider, type, kind) => `${rider} · ${type} · ${kind}`,
	penaltyRemove: (description) => `Remove ${description}`,
	penaltyDsqSuggested: (rider) => `Disqualification suggested for ${rider}`,
	formatEditor: "Round settings",
	formatEmpty: "There are no valid rounds to apply.",
	formatReshuffle: "Draw again",
	formatPlacementOptions: { branch: "By branch", spread: "Spread" },
	formatPlacementHelp: {
		branch:
			"Heats that sit next to each other meet again; the top and bottom of the bracket only cross in the final.",
		spread: "Qualifiers are mixed over all the heats, dealt like cards.",
	},
	formatRepechageName: (position) => `Repechage ${position}`,
	formatPreview: (sizes) => `Riders per heat: ${sizes.join(", ")}`,
	formatWarningRematch: (heat, source) =>
		`${heat}: riders who already met in ${source} will meet again.`,
	formatWarningTooManyHeats: (round, riders, heats) =>
		`${round}: ${riders} riders for ${heats} heats, some heats will stay empty.`,
	formatProblem: (path, message) => `${path || "format"}: ${message}`,
	formatEntryRoundMissing: (round) =>
		`A rider enters at "${round}", which is not in these settings.`,
	formatImport: "Import JSON",
	formatExport: "Export JSON",
	formatJson: "Round settings JSON",
	formatLoadJson: "Load this JSON",
	formatCloseJson: "Close the JSON",
	formatApply: "Apply to the rounds",
	formatDiscard: "Discard round changes",
	formatUnchanged: "No change to apply.",
	formatLocked: "A heat has started: the rounds can no longer be changed.",
	bracketTemplates: {
		windsurfWave: {
			name: "Windsurf wave",
			description: "Heats of 4, top 2. Points, 2 waves + 2 jumps.",
		},
		windsurfFreestyle: {
			name: "Windsurf freestyle",
			description: "Heats of 4, top 2. Points, 5 best moves.",
		},
		surf: {
			name: "Surf",
			description: "Heats of 4, top 2. Ride means, 2 waves, head judge.",
		},
		kiteFreestyle: {
			name: "Kitesurf freestyle",
			description: "Heats of 4, top 2. Points, 3 best tricks.",
		},
		slalom: {
			name: "Slalom / race",
			description: "Heats of 8, top 4. Manual ranking, no judges.",
		},
		custom: {
			name: "Custom",
			description:
				"Heats of 4, top 2, manual ranking. Everything can be changed afterwards.",
		},
	},
	exampleTemplate: (name) => `Example template · ${name}`,
	scoringTemplates: "Import a scoring example",
	scoringSentence: {
		manual: "No judges: the order of each heat is entered by hand.",
		scale: (min, max, step) =>
			`Each judge scores from ${min} to ${max} ${
				step === 0.5
					? "in half-point steps"
					: step === 1
						? "in whole points"
						: `in steps of ${step}`
			}.`,
		categories: (list) => `We keep ${list}.`,
		categoryCount: (counted, type, coefficient) =>
			`the ${counted === 1 ? "best" : `${counted} best`} ${type} ${
				counted === 1 ? "score" : "scores"
			}${coefficient === undefined ? "" : ` (x${coefficient})`}`,
		and: "and",
		placings: (trimmed) =>
			`Each judge ranks the riders on their own scores; places are added up and the lowest sum wins.${
				trimmed
					? " The best and the worst place of each rider are dropped (from 5 judges)."
					: ""
			}`,
		points: (aggregation) =>
			`Each judge adds up a rider's kept scores; the judges' totals are ${
				{
					mean: "averaged",
					trimmedMean: "averaged without the highest and the lowest",
					sum: "added",
				}[aggregation]
			} and the highest total wins.`,
		rideMeans: (aggregation) =>
			`The head judge announces each ride; the judges' scores on a ride are ${
				{
					mean: "averaged",
					trimmedMean: "averaged without the highest and the lowest",
					sum: "added",
				}[aggregation]
			} and the highest total wins.`,
		tieBreak: (priorityType) =>
			priorityType === undefined
				? "Ties: the best single score decides."
				: `Ties: the best ${priorityType} score decides, then the best single score.`,
		distinctFamilies: (counted, type, families) =>
			`The ${counted} counted ${type} rides must be from different families (${families.join(", ")}).`,
	},
	formatRoundNames: {
		round: (position) => `Round ${position}`,
		quarterFinals: "Quarter-finals",
		semiFinals: "Semi-finals",
		smallFinal: "Small final",
		final: "Final",
		double: (position) => `Double ${position}`,
		doubleFinal: "Double final",
		superFinal: "Super final",
	},
	formatRows: {
		riders: "Riders",
		ridersHelp:
			"An estimate is enough: heat sizes are recalculated from the riders entered.",
		heatsInRound1: "Heats in round 1",
		advance: "Qualifiers per heat",
		repechageAfterFirst: "Repechage after round 1",
		columns: {
			round: "Round",
			heats: "Heats",
			advance: "Qualifiers / heat",
			repechage: "Repechage",
			seedSlots: "Seeds entering here",
			duration: "Duration (min)",
			state: "State",
		},
		incoming: (count, fromRepechage, seedSlots = 0) => {
			const parts = [
				...(fromRepechage > 0 ? [`${fromRepechage} from the repechage`] : []),
				...(seedSlots > 0 ? [`${seedSlots} seeded`] : []),
			];
			return parts.length > 0
				? `${count} ${count === 1 ? "arrives" : "arrive"} (${parts.join(", ")})`
				: `${count} ${count === 1 ? "arrives" : "arrive"}`;
		},
		setAbove: "set above",
		auto: "auto",
		modified: "modified",
		less: (field) => `${field}: less`,
		more: (field) => `${field}: more`,
		menu: (round) => `Options for ${round}`,
		resetFollowing: "↺ following rounds",
		remove: "Remove",
		addRound: "+ Add a round before the final",
		repechageGoesTo: (round) => `→ ${round}`,
		smallFinal: "Small final",
		adjust: "Adjust the rounds",
		summary: (rounds, heats, modified) =>
			`${rounds} rounds · ${heats} heats · ${modified === 0 ? "all auto" : `${modified} modified`}`,
		problemsTitle: "Checks",
		problems: {
			EMPTY_HEAT: (where) => `${where}: a heat has no rider.`,
			NO_FINAL: (where) => `${where}: these settings never lead to a final.`,
			TOO_MANY_ROUNDS: () => "There are too many rounds.",
			TOO_MANY_HEATS: (where) => `${where}: too many heats in one round.`,
			SINGLE_RIDER_HEAT: (where) => `${where}: a heat has a single rider.`,
			LARGE_HEAT: (where) => `${where}: a heat has more than 8 riders.`,
			ADVANCE_ALL: (where) =>
				`${where}: as many qualifiers as riders in a heat, nobody is eliminated.`,
			LARGE_FINAL: (where) => `${where}: more than 8 riders in a single heat.`,
			SHIFTED_ROUND: (where) =>
				`${where}: modified round that no longer matches the riders it receives.`,
			TOO_MANY_SEED_SLOTS: () => "There are more seeds than riders.",
		},
		moreOptions: "More options",
		fill: "Placement in round 1",
		fillOptions: { serpentine: "By seed", draw: "Draw" },
		fillHelp: {
			serpentine:
				"Seeded riders are spread across the heats, the others are drawn; rematches are avoided.",
			draw: "Every rider is drawn at random.",
		},
		placement: "Placement of the qualifiers",
		placementHelp:
			"How the qualifiers are placed in the heats of the next round, for the whole bracket.",
		placementSame: (from, to) =>
			`${from} → ${to}: by branch and spread give the same result.`,
		showPlacementDetail: "Show the detail",
		hidePlacementDetail: "Hide the detail",
		readOnly:
			"These rounds cannot be written as one row per round (destinations by place, double elimination, round names...), so they are shown as they are and cannot be edited here.",
		importNotRows:
			"This format cannot be written as one row per round: it cannot be edited here.",
	},
	formatPlacementNote: {
		title: (from, to) => `Placement · ${from} → ${to}`,
		diagram: (from, to) => `Passage from ${from} to ${to}`,
		legend: { first: "1st", second: "2nd and after", repechage: "repechage" },
		focusHint: "Select a heat on the right",
		focusHeat: (heat) => `Show where the riders of ${heat} come from`,
		same: "By branch and spread give the same placement here: the qualifiers are mixed over all the heats either way, without putting two riders of one heat together.",
		branch:
			"Qualifiers stay in their branch: neighbouring heats meet again, and the top and bottom of the bracket only cross in the final.",
		spread:
			"Qualifiers are dealt over all the heats like cards: the 1sts first, then the 2nds, back and forth, never two riders of the same heat together.",
		example: (heat, from) => `${heat}: ${from}.`,
		top: (count, source, heats) =>
			`the top ${count} of ${source} ${heatsList(heats, "and")}`,
		ranked: (rank, source, heats) =>
			`${englishOrdinal(rank)} of ${source} ${heatsList(heats, "and")}`,
	},
	formatShape: {
		title: "Preview",
		region: "Format preview",
		summary: (riders) => `${riders} riders`,
		heats: (count) => (count === 1 ? "heat" : "heats"),
		rounds: (count) => (count === 1 ? "round" : "rounds"),
		composition: (own, foreign) =>
			`${own} from the main path, ${foreign} from the repechage`,
		seedSlots: (count) => `+ ${count} ${count === 1 ? "seed" : "seeds"}`,
		groups: { main: "Main", repechage: "Repechage", double: "Double" },
		optional: "optional",
	},
};

const fr: Labels = {
	heatStatus: {
		pending: "En attente",
		running: "En cours",
		judged: "Jugé",
		locked: "Verrouillé",
	},
	bracketStatus: {
		draft: "Brouillon",
		published: "Prêt",
		running: "En cours",
		finished: "Terminé",
		validated: "Validé",
	},
	participantStatus: {
		DNF: "N'a pas terminé",
		DSQ: "Disqualifié",
		DNS: "N'a pas pris le départ",
	},
	qualified: "Qualifié",
	seedEntry: { short: "TS", title: "Tête de série" },
	emptySlot: "Place libre",
	needsReview: "À revoir",
	heatTitle: (position) => `Heat ${position}`,
	advancing: (count) =>
		count === 1 ? `${count} qualifié` : `${count} qualifiés`,
	maxPerHeat: (count) => `${count} par heat`,
	rank: (rank) => (rank === 1 ? "1er" : `${rank}e`),
	heatShort: (position) => `H${position}`,
	slotDestination: (to) => `\u2192 ${to}`,
	slotEliminated: "éliminé",
	slotOrigin: (rank, from) => `${rank} \u00B7 ${from}`,
	expandRound: (name) => `Afficher ${name}`,
	collapseRound: (name) => `Masquer ${name}`,
	roundCollapsedSummary: (heats, places) =>
		`${heats} ${heats === 1 ? "heat" : "heats"} \u00B7 ${places} ${places === 1 ? "place" : "places"}`,
	entryPoolDropHere: "Déposer ici pour sortir le rider du tour",
	lycraColorNames: {
		red: "rouge",
		blue: "bleue",
		yellow: "jaune",
		green: "verte",
		white: "blanche",
		black: "noire",
		orange: "orange",
		pink: "rose",
		purple: "violette",
		grey: "grise",
		gray: "grise",
	},
	lycra: (color) => `Lycra : ${color}`,
	entryPoolTitle: "Inscrits non placés",
	entryPoolEmpty: "Tous les inscrits sont placés",
	dismissError: "Fermer",
	errors: {
		HEAT_FULL: "Ce heat est complet.",
		HEAT_STARTED: "Ce heat a démarré et ne peut plus être modifié.",
		HEAT_LOCKED: "Ce heat est verrouillé.",
		HEAT_JUDGED: "Ce heat est jugé et ne peut plus être modifié.",
		RIDER_ALREADY_IN_ROUND: "Ce rider est déjà dans ce tour.",
		CROSS_ROUND_MOVE: "Un rider ne peut pas changer de tour.",
		BEFORE_ENTRY_ROUND: "Ce rider n'entre qu'à un tour suivant.",
		BRACKET_VALIDATED: "Le tableau est validé et ne peut plus être modifié.",
		UNKNOWN_HEAT: "Ce heat n'existe plus.",
		UNKNOWN_RIDER: "Ce rider n'est pas inscrit.",
		RIDER_NOT_IN_HEAT: "Ce rider n'est plus dans ce heat.",
		INVALID_ARGUMENT: "Cette position n'est pas valide.",
		OTHER_POOL_ROUND: "Ce n'est pas le tour de cette liste.",
		SERVER_ERROR: "Le serveur a refusé la modification.",
		UNKNOWN_ROUND: "Ce tour n'existe plus.",
		HEAT_NOT_JUDGED: "Tous les heats sources doivent être jugés.",
		HEAT_NOT_RANKED: "Chaque rider doit avoir un rang ou un statut.",
		HEAT_EMPTY: "Aucun rider n'est encore connu dans ce heat.",
		INVALID_STATUS_TRANSITION: "Ce changement de statut est impossible.",
		BRACKET_NOT_PUBLISHED:
			"Passez le tableau à « Prêt » avant de démarrer un heat.",
		FORMAT_LOCKED:
			"Les tours suivent le format : modifiez-les dans les réglages du tableau.",
		INVALID_MAX: "Cette taille n'est pas valide.",
		MAX_BELOW_CURRENT: "Un heat contient déjà plus de riders.",
		INVALID_RANKS: "Ces rangs ne sont pas valides.",
		DUPLICATE_ID: "Cet identifiant est déjà utilisé.",
		ROUND_STARTED: "Ce tour a démarré.",
		ROUND_REFERENCED: "Un rider entre dans le tableau à ce tour.",
		RIDER_IN_STARTED_HEAT: "Ce rider est dans un heat démarré.",
		DESTRUCTIVE_CHANGE: "Cette modification demande une confirmation.",
		DOWNSTREAM_STARTED:
			"Un heat suivant contenant l'un de ces riders a démarré : annulez d'abord son départ.",
		HEAT_HAS_RANKS: "Effacez les rangs de ce heat avant d'annuler son départ.",
		HEAT_NOT_RUNNING: "Seul un heat en cours peut être réordonné.",
		NO_SCORING: "Ce tableau n'a pas de barème.",
		UNRESOLVED_TIE:
			"Des riders restent à égalité après les notes. Départagez-les dans « Forcer l'ordre du heat » : déplacez un des riders à égalité.",
		SIMULATE_WHILE_RUNNING:
			"Un heat est en cours ou une pause se décompte : attendez la fin avant de simuler.",
		INVALID_SCORING:
			"Ce barème n'est pas permis ici : la moyenne des passages exige le mode chef-juge.",
		INVALID_PENALTY: "Cette pénalité n'est pas valide.",
		INVALID_FORMAT: "Ces réglages des tours ne sont pas valides.",
		ROUND_LIMIT:
			"Cette modification crée et supprime trop de tours à la fois (97 au maximum).",
		DOUBLE_OPEN: "La double élimination est déjà ouverte.",
		DOUBLE_NOT_OPEN: "Il n'y a pas de double élimination à retirer.",
		DOUBLE_STARTED:
			"Un heat de la double élimination a démarré : elle ne peut plus être retirée.",
		DOUBLE_UNAVAILABLE: "La double élimination n'est pas possible ici.",
	},
	doubleUnavailable: {
		NO_FORMAT: "Ce tableau n'a pas été créé à partir de réglages de tours.",
		FORMAT_MISMATCH:
			"Les tours ne correspondent plus aux réglages : ajustez d'abord les tours.",
		NOT_SINGLE_ELIMINATION:
			"Seul un tableau à élimination simple peut en avoir une : retirez d'abord le repêchage, la petite finale et les tours facultatifs.",
		FINAL_TOO_SMALL: "La finale a trop peu de riders.",
		NOTHING_ELIMINATED: "Personne n'est éliminé au premier tour.",
		KEY_CONFLICT: "Un nom de tour est déjà utilisé.",
		ROUND_LIMIT: "Cela ferait trop de tours.",
		HEAT_LIMIT: "Cela ferait trop de heats.",
		HAS_DOUBLE_ELIMINATION: "La double élimination est déjà ouverte.",
		UNEVEN_HEATS: "Les heats du premier tour sont trop inégaux.",
		APPLY_FORMAT:
			"Retirez d'abord la double élimination pour changer le format.",
		TABLE_NOT_FINISHED:
			"La double élimination s'ouvre quand tous les heats du tableau 1 sont jugés.",
		AUTOMATIC:
			"Ce statut suit les heats : il change tout seul quand ils sont jugés.",
	},
	errorGeneric: "Cette modification n'est pas autorisée.",
	dndRoleDescription: "rider déplaçable",
	dndInstructions:
		"Appuyez sur Espace pour saisir un rider. Utilisez les flèches pour le déplacer, Espace pour le déposer, Échap pour annuler.",
	dndStart: (rider) => `${rider} saisi.`,
	dndOver: (rider, target) =>
		target === undefined
			? `${rider} n'est au-dessus d'aucun heat.`
			: `${rider} est au-dessus de ${target}.`,
	dndDrop: (rider, target) => `${rider} a été déposé dans ${target}.`,
	dndCancel: (rider) => `Déplacement annulé, ${rider} n'a pas bougé.`,
	dndRefused: (rider, reason) => `${rider} n'a pas bougé. ${reason}`,
	dndOverCopy: (rider, heat, round) =>
		`${rider} sera ajouté à ${heat} de ${round}.`,
	dndDropCopy: (rider, heat, round) =>
		`${rider} a été ajouté à ${heat} de ${round}.`,
	dndOverPool: (rider) => `${rider} sera retiré du heat.`,
	dndDropPool: (rider) => `${rider} a été retiré du heat et n'est plus placé.`,
	dndDropRank: (rider, rank) => `${rider} est maintenant classé ${rank}.`,
	dndDropOrder: (rider, position) =>
		`${rider} est maintenant ${position} dans l'ordre.`,
	dndConfirm: (rider) =>
		`${rider} a été déposé. Confirmez la modification pour l'appliquer.`,
	rankingReason: {
		judged: "Heat jugé : rouvrez-le pour modifier le classement.",
		locked:
			"Heat verrouillé : déverrouillez-le et rouvrez-le pour modifier le classement.",
		points: "Le classement suit les notes de ce heat.",
		status: "Un rider avec un statut n'est pas classé.",
	},
	rankHandle: (rider) => `Réordonner ${rider}`,
	startHeat: "Démarrer",
	startHeatNumbered: (number) => `Démarrer le heat ${number}`,
	cancelStart: "Annuler le départ",
	judgeHeat: "Juger",
	lockHeat: "Verrouiller",
	reopenHeat: "Rouvrir",
	rankByOrder: "Classer selon l'ordre",
	clearRanks: "Effacer les rangs",
	markReviewed: "Marquer comme revu",
	setByFormat: "Heats et qualifiés : réglés par le format.",
	participantStatusOf: (rider) => `Statut de ${rider}`,
	maxPerHeatField: "Riders par heat",
	advancingField: "Qualifiés",
	publishBracket: "Marquer comme prêt",
	unpublishBracket: "Repasser en brouillon",
	validateBracket: "Valider",
	unvalidateBracket: "Dévalider",
	makePublic: "Rendre public",
	makePrivate: "Rendre privé",
	resetBracket: "Réinitialiser",
	nameField: "Nom",
	add: "Ajouter",
	remove: "Supprimer",
	addRound: "Ajouter un tour",
	addHeat: "Ajouter un heat",
	removeRound: (name) => `Supprimer ${name}`,
	removeHeat: (name) => `Supprimer ${name}`,
	newRoundName: (position) => `Tour ${position}`,
	entryNameField: "Nom du rider",
	entrySeedField: "Tête de série",
	addEntry: "Ajouter un rider",
	removeEntry: (name) => `Supprimer ${name}`,
	entrySeed: (name) => `Tête de série de ${name}`,
	confirmTitle: {
		updateRound: "Changer le nombre de qualifiés ?",
		removeHeat: "Supprimer ce heat ?",
		removeRound: "Supprimer ce tour ?",
		reset: "Réinitialiser le tableau ?",
		applyFormat: "Appliquer le format ?",
		setHeatStatus: "Démarrer ce heat incomplet ?",
	},
	confirmTitleGeneric: "Confirmer cette modification ?",
	confirmImpact: (count) =>
		count === 1
			? "Cela concerne 1 heat jugé."
			: `Cela concerne ${count} heats jugés.`,
	qualificationGained: (rider) => `${rider} devient qualifié`,
	qualificationLost: (rider) => `${rider} n'est plus qualifié`,
	confirmCancel: "Annuler",
	confirmConfirm: "Confirmer",
	confirmSure: "Êtes-vous sûr ?",
	confirmRemoveHeat: (name, riders) =>
		`${name} sera supprimé, avec ${riders === 1 ? "1 placement" : `${riders} placements`}.`,
	confirmRemoveRound: (name, heats, riders) =>
		`${name} sera supprimé, avec ${heats === 1 ? "1 heat" : `${heats} heats`} et ${riders === 1 ? "1 placement" : `${riders} placements`}.`,
	confirmReset: (ranks, rounds) =>
		`${ranks === 1 ? "1 rang sera effacé" : `${ranks} rangs seront effacés`} et ${rounds === 1 ? "1 tour vidé" : `${rounds} tours vidés`}.`,
	confirmStartOpenPlaces: (places) =>
		places === 1
			? "1 place attend encore son rider : il ne pourra pas rejoindre ce heat une fois parti."
			: `${places} places attendent encore leur rider : ils ne pourront pas rejoindre ce heat une fois parti.`,
	confirmApplyFormat:
		"Appliquer remplace les tours et refait le tirage du tour 1. Les riders placés à la main seront déplacés. Continuer ?",
	invalidSeed: "La tête de série doit être un entier supérieur ou égal à 1.",
	visibility: { public: "Public", private: "Privé" },
	inspect: (name) => `Options de ${name}`,
	openHeatPanel: (name) => `Ouvrir le panneau de ${name}`,
	closeInspector: "Fermer",
	inspectorRiders: "Riders",
	toggleEntryPool: "Afficher ou masquer les inscrits non placés",
	entryMenu: (name) => `Options de ${name}`,
	formatScore: (value) =>
		value.toLocaleString("fr", { maximumFractionDigits: 2 }),
	formatTotal: (value) =>
		value.toLocaleString("fr", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}),
	heatDurationField: "Durée du heat (min)",
	timerRemaining: (time) => `${time} restantes`,
	timerElapsed: (time) => `${time} écoulées`,
	timerOver: "Temps écoulé",
	timerBreak: (time) => `Départ dans ${time}`,
	racePause: {
		pause: "Mettre la course en pause",
		pauseHint:
			"Le heat en cours va au bout de son chrono, puis la course s'arrête.",
		requested: "Pause après ce heat",
		requestedHint:
			"La course s'arrêtera à la fin du heat en cours. Cliquer pour annuler.",
		resume: "Reprendre",
		resumeHint: (breakSec) =>
			breakSec === 0
				? "La reprise démarre aussitôt le heat suivant."
				: `La reprise commence par une pause de ${breakDuration(breakSec)} avant le heat suivant.`,
	},
	raceFormat: {
		duration: breakDuration,
		heat: (duration) => `Heat ${duration}`,
		pause: (duration) => `pause ${duration}`,
		counted: (counted, type) => `${counted} ${type}`,
		judging: { free: "Juges libres", headJudge: "Chef-juge" },
		ranWith: (line) => `Couru avec : ${line}`,
		driftCurrent:
			"Ce heat a couru avec un format différent de celui en vigueur maintenant.",
		driftPrevious:
			"Ce heat a couru avec un format différent du heat précédent.",
	},
	placingsLine: (place, judgePlaces) => `${place} — juges : ${judgePlaces}`,
	unresolvedTie: (groups) =>
		`Égalité après les notes : ${groups.map((g) => g.join(" = ")).join(" ; ")}.`,
	unresolvedTieHint: "Classez-les à la main, puis jugez le heat.",
	judgeTotal: "Total",
	judgeSync: {
		loading: "Chargement",
		synced: "Synchronisé",
		saving: "Envoi",
		diverged: "Non synchronisé",
		revoked: "Accès révoqué",
	},
	judgeDisabled: {
		loading: "Chargement de vos notes.",
		notRunning: "Notation fermée : le heat n'est pas en cours.",
		revoked: "Votre accès a été révoqué. La notation est désactivée.",
	},
	judgeRiderButton: (name) => `Noter ${name}`,
	judgeAddNote: "+ Noter",
	judgeNoRiders: "Aucun rider à noter dans ce heat.",
	judgeNoNotes: "Aucune note",
	judgeSheet: (name) => `Noter ${name}`,
	judgeClose: "Fermer sans noter",
	judgeCategory: "Type",
	judgeFigure: "Figure (optionnelle)",
	judgeValues: "Note",
	judgeNoteChip: (type, figure, value) =>
		`${figure ? `${type}, ${figure}` : type} : ${value}`,
	judgeNoteOptions: (description) => `Options de ${description}`,
	noteSummary: (type, figure, value, counted) =>
		`${type} ${value}${figure ? `, ${figure}` : ""}${counted ? ", comptée" : ""}`,
	judgeShortName: (position) => `J${position}`,
	liveNotes: "Notes par juge",
	alignedNotes: "Moyennes par passage",
	alignedSummary: (type, average, judges, of, figure, disagree) =>
		`${type}, moyenne ${average} de ${judges} juges sur ${of}${figure ? `, figure ${figure}` : ""}${disagree ? ", désaccord des juges sur la figure" : ""}`,
	judgeDetails: "Détail par juge",
	provisionalRank: (rank) =>
		`Rang provisoire ${rank === 1 ? "1er" : `${rank}e`}`,
	judgeEditNote: "Modifier",
	judgeDeleteNote: "Supprimer",
	judgeEditing: "Modification d'une note",
	judgeUndo: "Annuler la dernière note",
	judgeNoteSaved: (name, value) => `${value} enregistré pour ${name}`,
	judgeQueue: "À noter",
	judgeQueueEmpty: "Rien en attente.",
	judgeRiders: "Riders",
	judgeValidate: "Valider",
	unseen: "Pas vu",
	judgeRideSheet: (name, type, figure) =>
		`Noter ${name}, ${figure ? `${type}, ${figure}` : type}`,
	noFigure: "Sans figure",
	headJudgeRiders: "Riders",
	headJudgeCategory: "Catégorie",
	headJudgeFigure: "Figure",
	headJudgeRiderButton: (name) => `Annoncer un passage pour ${name}`,
	headJudgeAnnounced: "Passages annoncés",
	headJudgeNone: "Aucun passage annoncé.",
	judgeRanking: {
		title: "Forcer l'ordre du heat (exceptionnel)",
		hint: "Remplace le classement calculé : valider le heat garde l'ordre fixé à la main ici.",
		moveUp: (rider) => `Monter ${rider}`,
		moveDown: (rider) => `Descendre ${rider}`,
		position: (rank, total) => `${rank} sur ${total}`,
		computed: "Calculé d'après les notes",
		manual: "Ordre manuel actif",
		revert: "Revenir au classement calculé",
		tied: "Égalité",
	},
	headJudgeProgress: (noted, judges, unseen) =>
		`${noted}/${judges} notés${unseen > 0 ? ` · ${unseen} pas vu` : ""}`,
	headJudgeRetract: "Retirer",
	headJudgeRetractAria: (description) => `Retirer ${description}`,
	headJudgeRetractConfirm:
		"Retirer ce passage ? Ses notes disparaissent avec lui.",
	headJudgeRetractYes: "Oui, retirer",
	indicative: "indicatif",
	categoryLine: (type) => type,
	categorySubtotal: (type, value) => `Sous-total ${type} ${value}`,
	rideMeanSummary: (type, mean, noted, of, figure, counted, indicative) =>
		`${type}, moyenne ${mean} de ${noted} juges sur ${of}${figure ? `, figure ${figure}` : ""}${counted ? ", comptée" : ""}${indicative ? ", indicatif" : ""}`,
	rideUnseenSummary: (type, figure) =>
		`${figure ? `${type}, ${figure}` : type}, pas vu`,
	judgePlaces: "Places",
	viewerDisplay: "Vue spectateur",
	viewerDisplayOptions: {
		typeSubtotals: "Sous-total par catégorie",
		rides: "Détail des passages",
		judgePlaces: "Places de chaque juge",
		judges: "Notes des juges",
	},
	scoringEditor: "Barème",
	scoringMethod: "Méthode",
	scoringMethods: {
		manual: "Classement manuel",
		placings: "Places de chaque juge",
		points: "Points",
		rideMeans: "Moyenne des passages",
	},
	scoringScale: {
		min: "Échelle min",
		max: "Échelle max",
		step: "Pas de l'échelle",
	},
	scoringAggregation: "Notes des juges",
	scoringAggregations: {
		mean: "Moyenne",
		trimmedMean: "Moyenne tronquée",
		sum: "Somme",
	},
	scoringTrimPlacings: "Écarter les places extrêmes",
	scoringPriorityType: "Départage des égalités",
	scoringNoPriority: "Meilleure note isolée",
	scoringAlignWindow: "Fenêtre d'alignement",
	scoringCategoryType: "Nom de la catégorie",
	scoringCategoryCounted: "Passages comptés",
	scoringCategoryCoefficient: "Coefficient",
	scoringAddCategory: "Ajouter une catégorie",
	scoringRemoveCategory: (type) =>
		`Retirer la catégorie ${type || "(sans nom)"}`,
	scoringJudgingMode: "Mode de jugement",
	judgingModes: { free: "Libre", headJudge: "Chef-juge" },
	scoringProblems: {
		"scale.min": "Le minimum de l'échelle doit être un multiple du pas.",
		"scale.max":
			"Le maximum de l'échelle doit être un multiple du pas et dépasser le minimum.",
		"scale.step": "Le pas de l'échelle doit valoir 1 ou 0,5.",
		alignWindowSec:
			"La fenêtre d'alignement doit être un nombre entier de secondes.",
		noCategory: "Ajoutez au moins une catégorie.",
		categoryType: "Chaque catégorie doit avoir un nom.",
		categoryDuplicate: "Les noms de catégorie doivent être uniques.",
		categoryCounted:
			"Les passages comptés doivent être un nombre entier, au moins 1.",
		categoryCoefficient: "Un coefficient doit être supérieur à 0.",
		priorityType: "La catégorie de départage doit être l'une des catégories.",
		rideMeansNeedsHeadJudge: "La moyenne des passages exige le mode chef-juge.",
		figureCodeEmpty: "Une figure doit avoir un code.",
		figureCodeDuplicate: "Ce code est déjà pris dans cette catégorie.",
		familyNameEmpty: "Une famille doit avoir un nom.",
		familyNameDuplicate:
			"Les noms de famille doivent être uniques dans une catégorie.",
		variantCodeEmpty: "Une variante doit avoir un code.",
		variantCodeDuplicate: "Ce code de variante est déjà pris.",
		variantNameEmpty: "Une variante doit avoir un nom.",
		scoringInvalid: "Ce barème n'est pas valide.",
	},
	scoringPlain: "En clair",
	scoringColumns: {
		category: "Catégorie",
		counted: "Comptés",
		coefficient: "Coefficient",
	},
	scoringDistinctFamilies: (type) =>
		`Les ${type} comptés doivent être de familles différentes`,
	scoringFigures: "Figures",
	scoringFiguresSummary: (figures, families) =>
		figures === 0
			? `aucune, ${families} ${families === 1 ? "famille" : "familles"}`
			: `${figures} ${figures === 1 ? "figure" : "figures"} dans ${families} ${
					families === 1 ? "famille" : "familles"
				}`,
	scoringFiguresNone: "aucune",
	scoringFiguresAdd: "Ajouter des figures",
	scoringFiguresOpen: "Ouvrir",
	scoringFiguresOpenAria: (type) => `Figures de ${type || "(sans nom)"}`,
	scoringJudgingModeHints: {
		free: "Chaque juge crée et note ses propres passages.",
		headJudge:
			"Le chef-juge annonce chaque passage ; les juges notent la qualité.",
	},
	scoringDetails: "Détails du barème",
	scoringDetailsSummary: {
		scale: (min, max, step) =>
			`Note de ${min.toLocaleString("fr")} à ${max.toLocaleString("fr")} par ${step.toLocaleString("fr")}`,
		aggregation: (aggregation) =>
			({
				mean: "moyenne des juges",
				trimmedMean: "moyenne tronquée",
				sum: "somme des juges",
			})[aggregation],
		tieBreak: (priorityType) =>
			priorityType === undefined
				? "départage : meilleure note isolée"
				: `départage : meilleure note de ${priorityType}`,
		window: (seconds) => `fenêtre ${seconds} s`,
	},
	scoringScaleWords: {
		label: "Échelle des notes",
		from: "de",
		to: "à",
		by: "par",
	},
	scoringAggregationHint:
		"Moyenne tronquée : sans la plus haute ni la plus basse, à partir de 3 juges.",
	scoringPriorityOption: (type) => `Meilleure note de ${type}, puis isolée`,
	scoringAlignWindowHint:
		"Regroupe à l'affichage les notes de plusieurs juges sur un même passage. Mode libre seulement ; sans effet sur le classement. Vide : 30 s.",
	scoringAlignWindowHidden:
		"Fenêtre d'alignement masquée : elle ne sert qu'en mode libre.",
	scoringTemplatesHint:
		"Remplace le barème et le mode de jugement en cours de saisie",
	scoringTemplatesNote: "Rien n'est appliqué avant « Enregistrer le format ».",
	raceFormatEditor: {
		inForce: "En vigueur",
		afterSave: "Après enregistrement",
		fixFirst: (count) =>
			`${count} ${count === 1 ? "point" : "points"} à corriger d'abord`,
		save: "Enregistrer le format",
		saveShort: "Enregistrer",
		discard: "Annuler",
		noChange: "Aucune modification",
		changes: (count) =>
			`${count} ${count === 1 ? "modification" : "modifications"}`,
		problems: (count) =>
			`${count} ${count === 1 ? "point" : "points"} à corriger`,
		goToFirst: "Aller au premier",
		appliesLater:
			"S'applique aux heats qui démarrent à partir de maintenant ; le heat en cours garde son format.",
		saved: "Enregistré. Le prochain heat qui démarre prendra ce format.",
		failed: (message) =>
			`Le format n'a pas été enregistré : ${message} Votre saisie est conservée.`,
		modified: "Modifié",
		errors: (count) => `${count} ${count === 1 ? "erreur" : "erreurs"}`,
	},
	figuresEditor: {
		title: (type) => `Figures · ${type || "(sans nom)"}`,
		back: "Retour au format",
		close: "Fermer les figures",
		hint: "Glisser ⠿ pour réordonner ou changer une figure de famille ; au clavier, ↑ ↓.",
		variants: "Variantes",
		variantsEdit: "Modifier",
		variantsDone: "Terminé",
		variantAdd: "Ajouter une variante",
		variantCode: "Code de la variante",
		variantName: "Nom de la variante",
		variantRemove: (code) => `Retirer la variante ${code || "(sans code)"}`,
		variantsEmpty: "Aucune variante pour l'instant.",
		search: "Chercher un code ou un nom",
		count: (figures, families) =>
			`${figures} ${figures === 1 ? "figure" : "figures"} · ${families} ${
				families === 1 ? "famille" : "familles"
			}`,
		columns: { code: "Code", name: "Nom", variants: "Variantes" },
		familyMove: (name) => `Déplacer la famille ${name}`,
		familyRename: (name) => `Renommer la famille ${name}`,
		familyName: "Nom de la famille",
		familyUp: (name) => `Monter la famille ${name}`,
		familyDown: (name) => `Descendre la famille ${name}`,
		familyRemove: (name) => `Retirer la famille ${name}`,
		familyFigures: (count) => `${count} ${count === 1 ? "figure" : "figures"}`,
		familyAdd: "Ajouter une famille de figures",
		familyGroup: (name) => `Famille ${name}`,
		noResults: "Aucune figure ne correspond.",
		removeAll: (count) =>
			`Elle contient ${count} ${count === 1 ? "figure" : "figures"} ; elles sont retirées avec elle.`,
		removeTitle: (name) => `Retirer la famille « ${name} » ?`,
		removeBody: (count) =>
			`Elle contient ${count} ${count === 1 ? "figure" : "figures"}. Les déplacer dans :`,
		removeInto: "Famille de destination",
		removeConfirm: "Retirer et déplacer",
		figureMove: (code) => `Déplacer ${code || "la figure"}`,
		figureCode: "Code",
		figureName: "Nom",
		figureNameOptional: "Nom (optionnel)",
		figureVariants: (code) => `Variantes de ${code || "la figure"}`,
		figureAddVariant: "+ Variante",
		figureVariantsOf: (code) =>
			`Variantes autorisées pour ${code || "la figure"}`,
		figureUp: (code) => `Monter ${code || "la figure"}`,
		figureDown: (code) => `Descendre ${code || "la figure"}`,
		figureRemove: (code) => `Supprimer ${code || "la figure"}`,
		figureAdd: (family) => `Ajouter une figure à ${family || "la famille"}`,
		movedFigure: (code, family, position) =>
			`${code} déplacée dans ${family}, position ${position}`,
		movedFamily: (name, position) => `${name} déplacée en position ${position}`,
		dragPickedUp: (name) => `${name} saisie`,
		dragDropped: (name) => `${name} déposée`,
		dragCancelled: (name) => `Déplacement de ${name} annulé`,
	},
	judgeEntry: {
		category: "Catégorie",
		figure: "Figure (optionnelle)",
		variant: (figure) => `Variante de ${figure} (optionnelle)`,
		noVariant: "Aucune",
		recap: (name, family) => `${name} · famille ${family}`,
		score: "Note (la toucher l'enregistre)",
		announce: "Annoncer le passage",
	},
	penalties: "Pénalités",
	penaltyKinds: {
		zeroBest: "Meilleur passage à 0",
		zeroSecondBest: "2e meilleur passage à 0",
		halfSecondBest: "2e meilleur passage divisé par 2",
	},
	penaltyRider: "Rider",
	penaltyType: "Catégorie",
	penaltyKind: "Pénalité",
	penaltyAdd: "Ajouter la pénalité",
	penaltyNone: "Aucune pénalité.",
	penaltyItem: (rider, type, kind) => `${rider} · ${type} · ${kind}`,
	penaltyRemove: (description) => `Retirer ${description}`,
	penaltyDsqSuggested: (rider) => `Disqualification suggérée pour ${rider}`,
	formatEditor: "Réglages des tours",
	formatEmpty: "Il n'y a pas de tours valides à appliquer.",
	formatReshuffle: "Nouveau tirage",
	formatPlacementOptions: { branch: "Par branche", spread: "Réparti" },
	formatPlacementHelp: {
		branch:
			"Les heats voisins se retrouvent ; le haut et le bas du tableau ne se croisent qu'en finale.",
		spread:
			"Les qualifiés sont mélangés sur tous les heats, distribués comme des cartes.",
	},
	formatRepechageName: (position) => `Repêchage ${position}`,
	formatPreview: (sizes) => `Riders par heat : ${sizes.join(", ")}`,
	formatWarningRematch: (heat, source) =>
		`${heat} : des riders qui se sont déjà rencontrés en ${source} se retrouveront face à face.`,
	formatWarningTooManyHeats: (round, riders, heats) =>
		`${round} : ${riders} riders pour ${heats} heats, certains heats resteront vides.`,
	formatProblem: (path, message) => `${path || "format"} : ${message}`,
	formatEntryRoundMissing: (round) =>
		`Un rider entre à « ${round} », qui n'est pas dans ces réglages.`,
	formatImport: "Importer du JSON",
	formatExport: "Exporter en JSON",
	formatJson: "JSON des réglages des tours",
	formatLoadJson: "Charger ce JSON",
	formatCloseJson: "Fermer le JSON",
	formatApply: "Appliquer aux tours",
	formatDiscard: "Annuler les changements de tours",
	formatUnchanged: "Aucune modification à appliquer.",
	formatLocked: "Un heat a démarré : les tours ne peuvent plus changer.",
	bracketTemplates: {
		windsurfWave: {
			name: "Windsurf vague",
			description: "Heats de 4, top 2. Points, 2 vagues + 2 sauts.",
		},
		windsurfFreestyle: {
			name: "Windsurf freestyle",
			description: "Heats de 4, top 2. Points, 5 meilleures figures.",
		},
		surf: {
			name: "Surf",
			description:
				"Heats de 4, top 2. Moyenne des passages, 2 vagues, chef-juge.",
		},
		kiteFreestyle: {
			name: "Kitesurf freestyle",
			description: "Heats de 4, top 2. Points, 3 meilleures figures.",
		},
		slalom: {
			name: "Slalom / course",
			description: "Heats de 8, top 4. Classement manuel, pas de juge.",
		},
		custom: {
			name: "Personnalisé",
			description:
				"Heats de 4, top 2, classement manuel. Tout se règle ensuite.",
		},
	},
	exampleTemplate: (name) => `Modèle d'exemple · ${name}`,
	scoringTemplates: "Importer un exemple de barème",
	scoringSentence: {
		manual: "Pas de juges : l'ordre de chaque heat est saisi à la main.",
		scale: (min, max, step) =>
			`Chaque juge note de ${min.toLocaleString("fr")} à ${max.toLocaleString("fr")} ${
				step === 0.5
					? "par demi-point"
					: step === 1
						? "par point entier"
						: `par pas de ${step.toLocaleString("fr")}`
			}.`,
		categories: (list) => `On garde ${list}.`,
		categoryCount: (counted, type, coefficient) =>
			`${
				counted === 1
					? `la meilleure note de ${type}`
					: `les ${counted} meilleures notes de ${type}`
			}${coefficient === undefined ? "" : ` (×${coefficient.toLocaleString("fr")})`}`,
		and: "et",
		placings: (trimmed) =>
			`Chaque juge classe les riders sur ses notes ; les places sont additionnées et la plus petite somme gagne.${
				trimmed
					? " La meilleure et la pire place de chaque rider sont écartées (à partir de 5 juges)."
					: ""
			}`,
		points: (aggregation) =>
			`Chaque juge additionne les notes retenues d'un rider ; les totaux des juges sont ${
				{
					mean: "moyennés",
					trimmedMean: "moyennés sans le plus haut ni le plus bas",
					sum: "additionnés",
				}[aggregation]
			} et le total le plus haut gagne.`,
		rideMeans: (aggregation) =>
			`Le chef-juge annonce chaque passage ; les notes des juges sur un passage sont ${
				{
					mean: "moyennées",
					trimmedMean: "moyennées sans la plus haute ni la plus basse",
					sum: "additionnées",
				}[aggregation]
			} et le total le plus haut gagne.`,
		tieBreak: (priorityType) =>
			priorityType === undefined
				? "En cas d'égalité, la meilleure note isolée départage."
				: `En cas d'égalité, la meilleure note de ${priorityType} départage, puis la meilleure note isolée.`,
		distinctFamilies: (counted, type, families) =>
			`Les ${counted} ${type} comptés doivent être de familles différentes (${families.join(", ")}).`,
	},
	formatRoundNames: {
		round: (position) => `Tour ${position}`,
		quarterFinals: "Quarts",
		semiFinals: "Demi-finales",
		smallFinal: "Petite finale",
		final: "Finale",
		double: (position) => `Double ${position}`,
		doubleFinal: "Finale du double",
		superFinal: "Super finale",
	},
	formatRows: {
		riders: "Riders",
		ridersHelp:
			"Une estimation suffit : la taille des heats se recalcule d'après les riders saisis.",
		heatsInRound1: "Heats au tour 1",
		advance: "Qualifiés par heat",
		repechageAfterFirst: "Repêchage après le tour 1",
		columns: {
			round: "Tour",
			heats: "Heats",
			advance: "Qualifiés / heat",
			repechage: "Repêchage",
			seedSlots: "Têtes de série qui entrent ici",
			duration: "Durée (min)",
			state: "État",
		},
		incoming: (count, fromRepechage, seedSlots = 0) => {
			const parts = [
				...(fromRepechage > 0 ? [`${fromRepechage} du repêchage`] : []),
				...(seedSlots > 0
					? [`${seedSlots} ${seedSlots === 1 ? "tête" : "têtes"} de série`]
					: []),
			];
			const verb = count === 1 ? "arrive" : "arrivent";
			return parts.length > 0
				? `${count} ${verb} (dont ${parts.join(", ")})`
				: `${count} ${verb}`;
		},
		setAbove: "réglé ci-dessus",
		auto: "auto",
		modified: "modifié",
		less: (field) => `${field} : moins`,
		more: (field) => `${field} : plus`,
		menu: (round) => `Options de ${round}`,
		resetFollowing: "↺ suite",
		remove: "Supprimer",
		addRound: "+ Ajouter un tour avant la finale",
		repechageGoesTo: (round) => `→ ${round}`,
		smallFinal: "Petite finale",
		adjust: "Ajuster les tours",
		summary: (rounds, heats, modified) =>
			`${rounds} tours · ${heats} heats · ${modified === 0 ? "tous auto" : modified === 1 ? "1 modifié" : `${modified} modifiés`}`,
		problemsTitle: "Contrôles",
		problems: {
			EMPTY_HEAT: (where) => `${where} : un heat n'a aucun rider.`,
			NO_FINAL: (where) =>
				`${where} : ce format n'aboutit jamais à une finale.`,
			TOO_MANY_ROUNDS: () => "Il y a trop de tours.",
			TOO_MANY_HEATS: (where) => `${where} : trop de heats dans un tour.`,
			SINGLE_RIDER_HEAT: (where) => `${where} : un heat n'a qu'un rider.`,
			LARGE_HEAT: (where) => `${where} : un heat dépasse 8 riders.`,
			ADVANCE_ALL: (where) =>
				`${where} : autant de qualifiés que de riders dans un heat, personne n'est éliminé.`,
			LARGE_FINAL: (where) => `${where} : plus de 8 riders dans un seul heat.`,
			SHIFTED_ROUND: (where) =>
				`${where} : tour modifié qui ne colle plus aux riders qu'il reçoit.`,
			TOO_MANY_SEED_SLOTS: () => "Il y a plus de têtes de série que de riders.",
		},
		moreOptions: "Plus d'options",
		fill: "Placement au tour 1",
		fillOptions: { serpentine: "Têtes de série", draw: "Tirage au sort" },
		fillHelp: {
			serpentine:
				"Les riders avec une tête de série sont répartis entre les heats, les autres tirés au sort ; les re-matchs sont évités.",
			draw: "Tous les riders sont tirés au sort.",
		},
		placement: "Placement des qualifiés",
		placementHelp:
			"Comment les qualifiés sont placés dans les heats du tour suivant, pour tout le tableau.",
		placementSame: (from, to) =>
			`${from} → ${to} : par branche et réparti donnent le même résultat.`,
		showPlacementDetail: "Voir le détail",
		hidePlacementDetail: "Masquer le détail",
		readOnly:
			"Ces tours ne s'écrivent pas en une ligne par tour (destinations par place, double élimination, noms de tours...) : ils sont affichés tels quels et ne se modifient pas ici.",
		importNotRows:
			"Ce format ne s'écrit pas en une ligne par tour : il ne peut pas être modifié ici.",
	},
	formatPlacementNote: {
		title: (from, to) => `Placement · ${from} → ${to}`,
		diagram: (from, to) => `Passage de ${from} vers ${to}`,
		legend: { first: "1er", second: "2e et suivants", repechage: "repêché" },
		focusHint: "Touchez un heat à droite",
		focusHeat: (heat) => `Voir d'où viennent les riders de ${heat}`,
		same: "Par branche et réparti donnent le même placement ici : les qualifiés sont mélangés sur tous les heats dans les deux cas, sans remettre ensemble deux riders d'un même heat.",
		branch:
			"Les qualifiés restent dans leur branche : les heats voisins se retrouvent, et le haut et le bas du tableau ne se croisent qu'en finale.",
		spread:
			"Les qualifiés sont distribués sur tous les heats comme des cartes : d'abord les 1ers, puis les 2es, dans un sens puis dans l'autre, sans mettre ensemble deux riders d'un même heat.",
		example: (heat, from) => `${heat} : ${from}.`,
		top: (count, source, heats) =>
			`les ${count} premiers de ${source} ${heatsList(heats, "et")}`,
		ranked: (rank, source, heats) =>
			`${rank === 1 ? "1er" : `${rank}e`} de ${source} ${heatsList(heats, "et")}`,
	},
	formatShape: {
		title: "Aperçu",
		region: "Aperçu du format",
		summary: (riders) => `${riders} riders`,
		heats: (count) => (count === 1 ? "heat" : "heats"),
		rounds: (count) => (count === 1 ? "tour" : "tours"),
		composition: (own, foreign) =>
			`${own} du parcours principal, ${foreign} du repêchage`,
		seedSlots: (count) =>
			`+ ${count} ${count === 1 ? "tête de série" : "têtes de série"}`,
		groups: { main: "Principal", repechage: "Repêchage", double: "Double" },
		optional: "facultatif",
	},
};

export const labels: Record<Locale, Labels> = { en, fr };

/** Translated message for a bracket or server error code; the codes below get the message of their `details.reason` when there is one. */
export function errorMessage(
	labels: Pick<Labels, "errors" | "errorGeneric" | "doubleUnavailable">,
	error: { code: string; details?: Record<string, unknown> },
): string {
	if (
		error.code === "DOUBLE_UNAVAILABLE" ||
		error.code === "DOUBLE_OPEN" ||
		error.code === "INVALID_STATUS_TRANSITION"
	) {
		const reason = error.details?.reason;
		const text =
			typeof reason === "string" ? labels.doubleUnavailable[reason] : undefined;
		if (text) return text;
	}
	return labels.errors[error.code] ?? labels.errorGeneric;
}
