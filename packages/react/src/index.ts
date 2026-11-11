import { version } from "../package.json";

export const VERSION: string = version;

export { useBracket } from "./useBracket";
export type {
	BracketChangeCause,
	BracketController,
	DispatchResult,
	ServerError,
	UseBracketParams,
} from "./useBracket";
export {
	JudgingRevokedError,
	isJudgingRevoked,
	useJudging,
} from "./useJudging";
export { useHeadJudging } from "./useHeadJudging";
export type {
	HeadJudgingController,
	NewRide,
	RideProgress,
	UseHeadJudgingParams,
} from "./useHeadJudging";
export type {
	AnnouncedRides,
	JudgeNotes,
	JudgingController,
	JudgingDisabledReason,
	JudgingServer,
	JudgingStatus,
	NewNote,
	NoteChanges,
	UseJudgingParams,
} from "./useJudging";
export { useSchedule } from "./useSchedule";
export { useRacePause } from "./useRacePause";
export type { RacePause } from "./useRacePause";
export { useHeatTimer } from "./useHeatTimer";
export type { HeatTimerState } from "./useHeatTimer";
export { BracketProvider } from "./BracketProvider";
export type { BracketProviderProps } from "./BracketProvider";
export { useBracketContext, useEntry, useHeat, useRound } from "./context";
export { HeatboardProvider, useHeatboardConfig } from "./config";
export type { HeatboardConfig, ResolvedHeatboardConfig } from "./config";
export { defineTheme, themes } from "./theme";
export type {
	ColorScheme,
	ColorSchemeSetting,
	HeatboardTheme,
	ThemeDefinition,
	ThemeTokenName,
	ThemeTokens,
} from "./theme";
export { describeScoring } from "./describeScoring";
export {
	describeRaceFormat,
	describeRaceFormatParts,
} from "./describeRaceFormat";
export { doubleNamesOf, formatNamesOf } from "./formatNames";
export { errorMessage, labels } from "./labels";
export type { Labels, Locale } from "./labels";
export { HeatboardDnd } from "./dnd";
export * from "./components";
