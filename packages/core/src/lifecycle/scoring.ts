import type { Ride, Score } from "../scoring/model";

export interface HeatData {
	rides: Ride[];
	scores: Score[];
}
