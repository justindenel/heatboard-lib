import { alignRides } from "./scoring/align";
import { computeHeatResult } from "./scoring/compute";
import type {
	AlignedGroup,
	RideResult,
	Ride,
	RiderResult,
	Score,
	ScoringMethod,
} from "./scoring/model";
import type { Bracket, JudgingMode, ViewerDisplay } from "./model";
import { findHeat, raceFormatOf, scoringOf, viewerDisplayOf } from "./queries";

/** One move of a rider as a spectator sees it: no judge and no ride id. */
export interface ViewerMove {
	type: string;
	at: string;
	figure?: string;
	value: number;
	/** Head-judge mode: whether the ride is retained. Free mode: always false, the move is indicative. */
	counted: boolean;
	/** Judges who gave a note. */
	judges: number;
	/** Judges who answered, "not seen" included; fewer than `of` means someone has not answered yet. */
	answers: number;
	of: number;
	figureAgreement: boolean;
}

/** Free-mode ride or head-judge ride with the judges' answers; only with the `judges` setting. */
export interface ViewerJudgeRide {
	rideId: string;
	type: string;
	at: string;
	figure?: string;
	value: number;
	counted: boolean;
	judges: number;
	judgeId?: string;
	/** `null` is "not seen". */
	scores: RideResult["scores"];
}

export interface ViewerRiderResult {
	riderId: string;
	rank: number;
	tied: boolean;
	total: number;
	/** Only with the `typeSubtotals` setting. */
	byType?: Record<string, number>;
	/** Only with the `rides` setting, in time order. */
	moves?: ViewerMove[];
	/** Only with the `judges` setting. */
	judgeRides?: ViewerJudgeRide[];
	/** Placings method: the figure that ranks the rider. */
	placingsSum?: number;
	/** Placings method, only with the `judgePlaces` setting; anonymous, in judge order. */
	places?: number[];
	/** Placings method, only with the `judgePlaces` and `judges` settings. */
	placesByJudge?: Record<string, number>;
	interferences: number;
	dsqSuggested: boolean;
	missingScores: boolean;
}

/** A heat result cut down to the viewer settings: what a spectator page may receive, never the raw notes. */
export interface ViewerHeatResult {
	method: ScoringMethod;
	/** Drives how the rides are drawn (shared or per judge); not a label to show spectators. */
	mode: JudgingMode;
	unresolvedTie: boolean;
	/** Judges in the order their first score appears; only with `judges`. */
	judgeIds?: string[];
	riders: ViewerRiderResult[];
}

const ALL: Required<ViewerDisplay> = {
	typeSubtotals: true,
	rides: true,
	judgePlaces: true,
	judges: true,
};

function distinctJudges(scores: Score[]): string[] {
	const ids: string[] = [];
	for (const score of scores) {
		if (!ids.includes(score.judgeId)) ids.push(score.judgeId);
	}
	return ids;
}

function sharedMoves(rides: RideResult[], of: number): ViewerMove[] {
	return rides
		.filter((ride) => ride.scores.length > 0)
		.map((ride) => ({
			type: ride.type,
			at: ride.at,
			...(ride.figure !== undefined && { figure: ride.figure }),
			value: ride.value,
			counted: ride.counted,
			judges: ride.judges,
			answers: ride.scores.length,
			of,
			figureAgreement: true,
		}));
}

/**
 * Result of a started heat for display, from the heat's notes; undefined without scoring, for an
 * unknown or pending heat. `"all"` gives the full detail (host side); otherwise the settings cut it
 * down, and judge ids only appear with `judges`.
 */
export function viewerHeatResult(
	bracket: Bracket,
	heatId: string,
	notes: { rides: Ride[]; scores: Score[] },
	display: ViewerDisplay | "all" = viewerDisplayOf(bracket),
): ViewerHeatResult | undefined {
	const found = findHeat(bracket, heatId);
	const scoring = found && scoringOf(bracket, found.heat);
	if (!scoring || !found || found.heat.status === "pending") return;
	const show: Required<ViewerDisplay> =
		display === "all" ? ALL : { ...viewerDisplayOf(bracket), ...display };

	const riderIds = found.heat.slots
		.filter((slot) => slot.status === undefined)
		.map((slot) => slot.riderId);
	const configured = raceFormatOf(bracket, found.heat).judgingMode;
	const mode: JudgingMode =
		scoring.method === "rideMeans" ? "headJudge" : configured;
	const result = computeHeatResult(
		scoring,
		riderIds,
		notes.rides,
		notes.scores,
		found.heat.penalties ?? [],
		{ judgingMode: mode },
	);
	const judgeIds = distinctJudges(notes.scores);
	const aligned = new Map<string, AlignedGroup[]>(
		show.rides && mode !== "headJudge"
			? alignRides(scoring, notes.rides, notes.scores, { riderIds }).map(
					(entry) => [entry.riderId, entry.groups],
				)
			: [],
	);

	const toViewer = (rider: RiderResult): ViewerRiderResult => ({
		riderId: rider.riderId,
		rank: rider.rank,
		tied: rider.tied,
		total: rider.total,
		...(show.typeSubtotals && { byType: rider.byType }),
		...(show.rides && {
			moves:
				mode === "headJudge"
					? sharedMoves(rider.rides, judgeIds.length)
					: (aligned.get(rider.riderId) ?? []).map((group): ViewerMove => ({
							type: group.type,
							at: group.at,
							...(group.figure !== undefined && { figure: group.figure }),
							value: group.mean,
							counted: false,
							judges: group.judges,
							answers: group.judges,
							of: group.of,
							figureAgreement: group.figureAgreement,
						})),
		}),
		...(show.judges && {
			judgeRides: rider.rides.map((ride): ViewerJudgeRide => ({
				rideId: ride.rideId,
				type: ride.type,
				at: ride.at,
				...(ride.figure !== undefined && { figure: ride.figure }),
				value: ride.value,
				counted: ride.counted,
				judges: ride.judges,
				...(ride.judgeId !== undefined && { judgeId: ride.judgeId }),
				scores: ride.scores,
			})),
		}),
		...(rider.placingsSum !== undefined && { placingsSum: rider.placingsSum }),
		...(show.judgePlaces &&
			rider.placesByJudge !== undefined && {
				places: Object.values(rider.placesByJudge),
			}),
		...(show.judgePlaces &&
			show.judges &&
			rider.placesByJudge !== undefined && {
				placesByJudge: rider.placesByJudge,
			}),
		interferences: rider.interferences,
		dsqSuggested: rider.dsqSuggested,
		missingScores: rider.missingScores,
	});

	return {
		method: result.method,
		mode,
		unresolvedTie: result.unresolvedTie,
		...(show.judges && { judgeIds }),
		riders: result.riders.map(toViewer),
	};
}
