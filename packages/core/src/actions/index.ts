import {
	addHeat,
	addRound,
	removeHeat,
	removeRound,
	type NewRound,
} from "./structure";
import { setLinks, updateRound } from "./advancement";
import {
	renameBracket,
	renameHeat,
	renameRound,
	setBracketStatus,
	setVisibility,
} from "./bracket";
import { addEntries, addEntry, removeEntry, updateEntry } from "./entries";
import { clearReview, setHeatStatus } from "./heats";
import { judgeHeatFromScores } from "./judging";
import { addPenalty, removePenalty, setPenalties } from "./penalties";
import { setViewerDisplay } from "./judgingMode";
import { setRaceFormat } from "./raceFormat";
import { cancelPauseRequest, pauseRace, resumeRace } from "./chain";
import type { HeatData } from "../lifecycle/scoring";
import { move, place, remove } from "./composition";
import { drawRound } from "./draw";
import { closeDoubleElimination, openDoubleElimination } from "./double";
import { applyFormat } from "./format";
import type { DoubleFinalMode } from "../format/double";
import type { FormatEditorState, FormatSettings } from "../format/model";
import type { DoubleRoundNames } from "../format/names";
import {
	clearRanks,
	rankByPosition,
	reorderSlots,
	setRanks,
	setStatus,
} from "./ranking";
import { reset, setMaxPerHeat } from "./rounds";
import { requiredHeatsJudged } from "../internal/bracket";
import { withChain } from "../internal/chain";
import { fail, ok } from "../internal/result";
import type { ActionResult } from "../errors";
import type {
	Bracket,
	BracketStatus,
	Entry,
	HeatStatus,
	JudgingMode,
	Link,
	ParticipantStatus,
	RaceTiming,
	ViewerDisplay,
	Visibility,
} from "../model";
import type { Penalty, ScoringConfig } from "../scoring/model";
import { DEFAULT_OPTIONS, type BracketOptions } from "../options";

export type Action =
	| { type: "place"; riderId: string; heatId: string; index?: number }
	| {
			type: "move";
			riderId: string;
			fromHeatId: string;
			toHeatId: string;
			index?: number;
	  }
	| { type: "remove"; riderId: string; heatId: string }
	| { type: "drawRound"; roundId: string; drawSeed: number }
	| { type: "setRanks"; heatId: string; riderIds: string[]; override?: boolean }
	| { type: "reorderSlots"; heatId: string; riderIds: string[] }
	| { type: "rankByPosition"; heatId: string }
	| { type: "clearRanks"; heatId: string }
	| {
			type: "setStatus";
			heatId: string;
			riderId: string;
			status: ParticipantStatus | null;
			override?: boolean;
	  }
	| { type: "setHeatStatus"; heatId: string; status: HeatStatus; at?: string }
	| { type: "judgeHeatFromScores"; heatId: string; data: HeatData }
	| { type: "setPenalties"; heatId: string; penalties: Penalty[] }
	| { type: "addPenalty"; heatId: string; penalty: Penalty }
	| { type: "removePenalty"; heatId: string; penalty: Penalty }
	| { type: "clearReview"; heatId: string }
	| { type: "setMaxPerHeat"; roundId: string; max: number }
	| {
			type: "applyFormat";
			format: FormatSettings;
			drawSeed: number;
			editor?: FormatEditorState;
	  }
	| {
			type: "openDoubleElimination";
			mode: DoubleFinalMode;
			/** Duels mode only; defaults to true. */
			superFinal?: boolean;
			/** Names of the generated rounds; English when absent. */
			names?: DoubleRoundNames;
	  }
	| { type: "closeDoubleElimination" }
	| { type: "reset"; keepRounds?: number; confirm?: boolean }
	| { type: "setBracketStatus"; status: BracketStatus }
	| { type: "setVisibility"; visibility: Visibility }
	| { type: "renameBracket"; name: string }
	| { type: "renameRound"; roundId: string; name: string }
	| { type: "renameHeat"; heatId: string; name?: string }
	| { type: "addEntry"; entry: Entry }
	| { type: "addEntries"; entries: Entry[] }
	| {
			type: "updateEntry";
			riderId: string;
			displayName?: string;
			seed?: number | null;
			entryRoundId?: string | null;
	  }
	| { type: "removeEntry"; riderId: string }
	| {
			type: "addRound";
			round: NewRound;
			index?: number;
	  }
	| {
			type: "updateRound";
			roundId: string;
			advancing?: number;
			confirm?: boolean;
	  }
	| { type: "removeRound"; roundId: string; confirm?: boolean }
	| {
			type: "addHeat";
			roundId: string;
			heat: { id: string; name?: string };
			index?: number;
	  }
	| { type: "removeHeat"; heatId: string; confirm?: boolean }
	| { type: "setViewerDisplay"; display: ViewerDisplay }
	| { type: "setLinks"; links: Link[]; confirm?: boolean }
	| {
			type: "setRaceFormat";
			/** Applies to heats that start afterwards only; a running or judged heat keeps its own. */
			timing?: RaceTiming;
			scoring?: ScoringConfig | null;
			judgingMode?: JudgingMode;
	  }
	/** `at` is the clock of the action; the server stamps it. */
	| { type: "pauseRace"; at?: string }
	| { type: "cancelPauseRequest" }
	| { type: "resumeRace"; at?: string };

const VALIDATED_ALLOWED: ReadonlySet<Action["type"]> = new Set([
	"setVisibility",
	"renameBracket",
	"renameRound",
	"renameHeat",
]);

/** Actions that stay available once the bracket is validated. */
function allowedWhenValidated(action: Action): boolean {
	if (action.type === "setBracketStatus") {
		return action.status === "finished" || action.status === "validated";
	}
	return VALIDATED_ALLOWED.has(action.type);
}

/** "finished" follows the heats: reached when the last required heat is judged, left when one is reopened. */
function followHeats(result: ActionResult): ActionResult {
	if (!result.ok) return result;
	const { bracket } = result;
	if (bracket.status !== "running" && bracket.status !== "finished") {
		return result;
	}
	const status = requiredHeatsJudged(bracket.rounds) ? "finished" : "running";
	if (status === bracket.status) return result;
	// A finished race has nothing left to pause or wait for.
	return ok(
		status === "finished"
			? withChain({ ...bracket, status }, {})
			: { ...bracket, status },
	);
}

/**
 * Applies one action without mutating the input; untouched rounds, heats and
 * slots keep their reference, and a no-op returns the same bracket. The shape
 * of action fields is not validated here (the API layer does that), and id
 * uniqueness is not checked either: see `validateBracket`.
 */
export function applyAction(
	bracket: Bracket,
	action: Action,
	options: BracketOptions = {},
): ActionResult {
	return followHeats(dispatch(bracket, action, options));
}

function dispatch(
	bracket: Bracket,
	action: Action,
	options: BracketOptions,
): ActionResult {
	if (bracket.status === "validated" && !allowedWhenValidated(action)) {
		return fail(
			"BRACKET_VALIDATED",
			`Action "${action.type}" is not allowed on a validated bracket`,
			{ type: action.type },
		);
	}
	const resolved = { ...DEFAULT_OPTIONS, ...options };
	switch (action.type) {
		case "place":
			return place(bracket, action.riderId, action.heatId, action.index);
		case "move":
			return move(
				bracket,
				action.riderId,
				action.fromHeatId,
				action.toHeatId,
				action.index,
				resolved,
			);
		case "drawRound":
			return drawRound(bracket, action.roundId, action.drawSeed);
		case "remove":
			return remove(bracket, action.riderId, action.heatId);
		case "setRanks":
			return setRanks(
				bracket,
				action.heatId,
				action.riderIds,
				action.override ?? false,
			);
		case "reorderSlots":
			return reorderSlots(bracket, action.heatId, action.riderIds);
		case "rankByPosition":
			return rankByPosition(bracket, action.heatId);
		case "clearRanks":
			return clearRanks(bracket, action.heatId);
		case "setStatus":
			return setStatus(
				bracket,
				action.heatId,
				action.riderId,
				action.status,
				action.override ?? false,
			);
		case "setHeatStatus":
			return setHeatStatus(bracket, action.heatId, action.status, action.at);
		case "judgeHeatFromScores":
			return judgeHeatFromScores(bracket, action.heatId, action.data);
		case "setPenalties":
			return setPenalties(bracket, action.heatId, action.penalties);
		case "addPenalty":
			return addPenalty(bracket, action.heatId, action.penalty);
		case "removePenalty":
			return removePenalty(bracket, action.heatId, action.penalty);
		case "clearReview":
			return clearReview(bracket, action.heatId);
		case "setMaxPerHeat":
			return setMaxPerHeat(bracket, action.roundId, action.max);
		case "applyFormat":
			return applyFormat(
				bracket,
				action.format,
				action.drawSeed,
				action.editor,
			);
		case "openDoubleElimination":
			return openDoubleElimination(
				bracket,
				action.mode,
				action.superFinal ?? true,
				action.names,
			);
		case "closeDoubleElimination":
			return closeDoubleElimination(bracket);
		case "reset":
			return reset(bracket, action.keepRounds ?? 1, action.confirm ?? false);
		case "setBracketStatus":
			return setBracketStatus(bracket, action.status);
		case "setVisibility":
			return setVisibility(bracket, action.visibility);
		case "renameBracket":
			return renameBracket(bracket, action.name);
		case "renameRound":
			return renameRound(bracket, action.roundId, action.name);
		case "renameHeat":
			return renameHeat(bracket, action.heatId, action.name);
		case "addEntry":
			return addEntry(bracket, action.entry);
		case "addEntries":
			return addEntries(bracket, action.entries);
		case "updateEntry":
			return updateEntry(bracket, action.riderId, action);
		case "removeEntry":
			return removeEntry(bracket, action.riderId);
		case "addRound":
			return addRound(bracket, action.round, action.index);
		case "updateRound":
			return updateRound(
				bracket,
				action.roundId,
				{ advancing: action.advancing },
				action.confirm ?? false,
			);
		case "removeRound":
			return removeRound(bracket, action.roundId, action.confirm ?? false);
		case "addHeat":
			return addHeat(bracket, action.roundId, action.heat, action.index);
		case "removeHeat":
			return removeHeat(bracket, action.heatId, action.confirm ?? false);
		case "setViewerDisplay":
			return setViewerDisplay(bracket, action.display);
		case "setLinks":
			return setLinks(bracket, action.links, action.confirm ?? false);
		case "setRaceFormat":
			return setRaceFormat(bracket, action);
		case "pauseRace":
			return pauseRace(bracket, action.at);
		case "cancelPauseRequest":
			return cancelPauseRequest(bracket);
		case "resumeRace":
			return resumeRace(bracket, action.at);
		default: {
			const unknown: never = action;
			return fail(
				"UNKNOWN_ACTION",
				`Unknown action type "${String((unknown as { type?: unknown }).type)}"`,
			);
		}
	}
}
