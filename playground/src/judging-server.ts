import type {
	AnnouncedRides,
	JudgeNotes,
	JudgingServer,
} from "@heatboard/react";
import type { HeatData, Ride, Score } from "@heatboard/core";
import type { DemoMode } from "./demo-bracket";

export interface DemoJudgingServer extends JudgingServer {
	/** Replaces the notes of a judge, as the host would after reading them elsewhere (free mode). */
	replace: (heatId: string, judgeId: string, notes: JudgeNotes) => void;
	/** Replaces the announced rides and every judge's scores of a heat (head-judge mode). */
	replaceHeat: (heatId: string, data: AnnouncedRides) => void;
	/** For `useSyncExternalStore`: notified on every change of the notes. */
	subscribeSnapshot: (listener: () => void) => () => void;
	/** Stable until the notes change, so it can feed `useSyncExternalStore`. */
	getSnapshot: () => JudgingSnapshot;
}

export interface JudgingSnapshot {
	/** Notes of every judge of the heat, ready for the admin side. */
	heatData: (heatId: string) => HeatData | undefined;
}

const EMPTY: JudgeNotes = { rides: [], scores: [] };

/**
 * In-memory stand-in for the host's API. Free mode keeps notes per heat and judge slot; head-judge
 * mode keeps one list of announced rides per heat and the scores of every judge, and drops the
 * scores of a ride as soon as it is retracted.
 */
export function createDemoJudgingServer(
	mode: DemoMode = "headJudge",
	latencyMs: number = 150,
): DemoJudgingServer {
	const notes = new Map<string, JudgeNotes>();
	const announced = new Map<string, AnnouncedRides>();
	const storeListeners = new Set<() => void>();
	const heatListeners = new Map<string, Set<() => void>>();

	const heatOf = (heatId: string): AnnouncedRides =>
		announced.get(heatId) ?? { rides: [], scores: [] };
	const snapshotOf = (): JudgingSnapshot => {
		const frozen = new Map(notes);
		const frozenHeats = new Map(announced);
		return {
			heatData: (heatId) => {
				if (mode === "headJudge") {
					const heat = frozenHeats.get(heatId);
					return heat;
				}
				const prefix = `${heatId}\n`;
				const all = [...frozen].filter(([k]) => k.startsWith(prefix));
				if (all.length === 0) return undefined;
				return {
					rides: all.flatMap(([, n]) => n.rides),
					scores: all.flatMap(([, n]) => n.scores),
				};
			},
		};
	};
	let snapshot = snapshotOf();

	const key = (heatId: string, judgeId: string) => `${heatId}\n${judgeId}`;
	const bump = (heatId: string) => {
		snapshot = snapshotOf();
		storeListeners.forEach((listener) => listener());
		heatListeners.get(heatId)?.forEach((listener) => listener());
	};
	const reach = async () => {
		if (latencyMs > 0) await new Promise((r) => setTimeout(r, latencyMs));
	};
	const survivors = (rides: Ride[], scores: Score[]) => {
		const ids = new Set(rides.map((r) => r.id));
		return scores.filter((s) => ids.has(s.rideId));
	};

	return {
		load: async (heatId, judgeId) => {
			await reach();
			if (mode === "headJudge") {
				const heat = heatOf(heatId);
				return {
					rides: heat.rides,
					scores: heat.scores.filter((s) => s.judgeId === judgeId),
				};
			}
			return notes.get(key(heatId, judgeId)) ?? EMPTY;
		},
		save: async (heatId, judgeId, next) => {
			await reach();
			if (mode === "headJudge") {
				const heat = heatOf(heatId);
				const own = survivors(
					heat.rides,
					next.scores.filter((s) => s.judgeId === judgeId),
				);
				announced.set(heatId, {
					rides: heat.rides,
					scores: [...heat.scores.filter((s) => s.judgeId !== judgeId), ...own],
				});
			} else {
				notes.set(key(heatId, judgeId), next);
			}
			bump(heatId);
		},
		loadRides: async (heatId) => {
			await reach();
			return heatOf(heatId);
		},
		saveRides: async (heatId, rides) => {
			await reach();
			announced.set(heatId, {
				rides,
				scores: survivors(rides, heatOf(heatId).scores),
			});
			bump(heatId);
		},
		subscribe: (heatId, onChange) => {
			const set = heatListeners.get(heatId) ?? new Set<() => void>();
			set.add(onChange);
			heatListeners.set(heatId, set);
			return () => set.delete(onChange);
		},
		replace: (heatId, judgeId, next) => {
			notes.set(key(heatId, judgeId), next);
			bump(heatId);
		},
		replaceHeat: (heatId, data) => {
			announced.set(heatId, data);
			bump(heatId);
		},
		subscribeSnapshot: (listener) => {
			storeListeners.add(listener);
			return () => storeListeners.delete(listener);
		},
		getSnapshot: () => snapshot,
	};
}
