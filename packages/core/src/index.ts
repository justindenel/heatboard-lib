import { version } from "../package.json";

export const VERSION: string = version;

export type {
	Bracket,
	BracketStatus,
	Entry,
	Heat,
	HeatSlot,
	HeatStatus,
	JudgingMode,
	Link,
	ParticipantStatus,
	RaceTiming,
	RaceChain,
	Round,
	ViewerDisplay,
	Visibility,
} from "./model";
export type { ActionResult, BracketError, BracketErrorCode } from "./errors";
export type { BracketOptions } from "./options";
export { applyAction } from "./actions";
export type { Action } from "./actions";
export { hasManualRanks } from "./actions/judging";
export type { HeatData } from "./lifecycle/scoring";
export { schedule, settleChain } from "./lifecycle/chain";
export type { Schedule, SchedulePhase, ScheduleNext } from "./lifecycle/chain";
export { canSimulateRound, simulateRound } from "./lifecycle/simulate";
export type {
	SimulateRoundOptions,
	SimulateRoundResult,
	SimulatedHeat,
} from "./lifecycle/simulate";
export { generateHeadJudgeNotes, generateNotes } from "./internal/notes";
export type {
	GenerateNotesOptions,
	HeadJudgeNotes,
	HeadJudgeOptions,
} from "./internal/notes";
export { simulateAdvancementChange } from "./lifecycle/advancement";
export type {
	AdvancementChange,
	AdvancementConflict,
	AdvancementSimulation,
	HeatEntryImpact,
	QualificationChange,
} from "./lifecycle/advancement";
export {
	currentRaceFormat,
	findHeat,
	defaultOpenRoundId,
	getQualified,
	hasRunningHeat,
	heatClock,
	heatNumbers,
	getRiderPath,
	judgingModeOf,
	numberedHeats,
	pickLiveHeat,
	pickNextHeat,
	provisionalOrder,
	raceFormatDrift,
	raceFormatOf,
	roundProgress,
	roundState,
	scoringOf,
	viewerDisplayOf,
} from "./queries";
export type {
	FoundHeat,
	HeatClock,
	HeatRef,
	NumberedHeat,
	RaceFormat,
	RiderPathStep,
	RoundState,
} from "./queries";
export { validateBracket } from "./validate";
export { viewerHeatResult } from "./viewer";
export type {
	ViewerHeatResult,
	ViewerJudgeRide,
	ViewerMove,
	ViewerRiderResult,
} from "./viewer";
export { computeStandings } from "./standings";
export type { Standing } from "./standings";
export { alignRides } from "./scoring/align";
export { computeHeatResult } from "./scoring/compute";
export { rankingFromResult } from "./scoring/ranking";
export { scoreNeeded } from "./scoring/needed";
export {
	ridesProblem as validateRides,
	scoringProblem as validateScoring,
} from "./scoring/validate";
export { localiseScoring, scoringPresets } from "./scoring/presets";
export type { PresetLocale } from "./scoring/presets";
export { bracketTemplates, templatePlan } from "./templates";
export type { BracketTemplate, TemplateFormat } from "./templates";
export type {
	Aggregation,
	AlignedGroup,
	AlignedNote,
	AlignedRider,
	ComputeOptions,
	EntryAuthor,
	HeatResult,
	Penalty,
	PenaltyKind,
	RankingFromResult,
	Ride,
	RideResult,
	RiderResult,
	Score,
	ScoreNeeded,
	ScoringCategory,
	ScoringConfig,
	ScoringFamily,
	ScoringFigure,
	ScoringIssue,
	ScoringIssueCode,
	ScoringMethod,
	ScoringVariant,
} from "./scoring/model";
export { parseFormat } from "./format/parse";
export { buildFromFormat } from "./format/build";
export { exportFormat } from "./format/export";
export { formatPresets } from "./format/presets";
export {
	generateDoubleElimination,
	hasDoubleElimination,
	isSingleElimination,
	removeDoubleElimination,
} from "./format/double";
export {
	canHaveRepechage,
	defaultPlan,
	editorFromPlan,
	firstRoundRiders,
	formatFromPlan,
	planFlow,
	planFromFormat,
	planProblems,
	planRoundName,
	refillPlan,
} from "./format/plan";
export type {
	DefaultPlanInput,
	FormatPlan,
	PlanFlow,
	PlanProblem,
	PlanProblemCode,
	RepechageFlow,
	RepechagePlan,
	RoundFlow,
	RoundPlan,
} from "./format/plan";
export type { FormatNames, DoubleRoundNames } from "./format/names";
export type {
	DoubleEliminationErrorCode,
	DoubleEliminationResult,
	DoubleFinalMode,
} from "./format/double";
export type {
	BuildFormatResult,
	BuiltRound,
	FormatEditorState,
	FormatFill,
	FormatIssue,
	FormatOutcome,
	FormatPlacement,
	FormatRound,
	FormatSettings,
	FormatWarning,
	ParseFormatResult,
} from "./format/model";
