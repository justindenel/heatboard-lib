import { useEffect, useState } from "react";
import {
	heatClock,
	schedule,
	type Bracket,
	type HeatClock,
} from "@heatboard/core";

export interface HeatTimerState extends HeatClock {
	/** True once the heat has a duration and it is used up. */
	isOver: boolean;
	/** Heat that is waiting to start: seconds left in the break before it. */
	breakRemainingSec?: number;
}

/** A timed heat is on, so the next heat may be about to start. */
function timedHeatRunning(bracket: Bracket): boolean {
	return bracket.rounds.some((round) =>
		round.heats.some(
			(heat) =>
				heat.status === "running" &&
				heat.startedAt !== undefined &&
				heat.endedAt === undefined,
		),
	);
}

/**
 * Clock of a running heat, refreshed every second; for the next heat during the break, the
 * countdown to its start; empty otherwise.
 */
export function useHeatTimer(bracket: Bracket, heatId: string): HeatTimerState {
	const heat = bracket.rounds
		.flatMap((round) => round.heats)
		.find((candidate) => candidate.id === heatId);
	const running = heat?.status === "running" && heat.startedAt !== undefined;
	const waiting =
		heat?.status === "pending" &&
		(bracket.chain?.break !== undefined || timedHeatRunning(bracket));
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!running && !waiting) return;
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [running, waiting]);

	if (running) {
		const clock = heatClock(bracket, heatId, new Date(now).toISOString());
		return { ...clock, isOver: clock.remainingSec === 0 };
	}
	if (waiting) {
		const plan = schedule(bracket, new Date(now).toISOString());
		if (
			plan.phase === "break" &&
			plan.next?.heatId === heatId &&
			plan.remainingSec !== undefined
		) {
			return { isOver: false, breakRemainingSec: plan.remainingSec };
		}
	}
	return { isOver: false };
}
