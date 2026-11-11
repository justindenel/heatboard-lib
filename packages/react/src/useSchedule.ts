import { useEffect, useMemo, useState } from "react";
import { schedule, type Bracket, type Schedule } from "@heatboard/core";

/** Some heat started and its timer has not been stamped as over yet, or a chain state is pending. */
function clockMatters(bracket: Bracket): boolean {
	return (
		bracket.chain !== undefined ||
		bracket.rounds.some((round) =>
			round.heats.some(
				(heat) =>
					heat.status !== "pending" &&
					heat.startedAt !== undefined &&
					heat.endedAt === undefined,
			),
		)
	);
}

/** Where the race stands (running heat, break, pause) from the bracket and the device clock, refreshed every second while it matters. */
export function useSchedule(bracket: Bracket): Schedule {
	const active = clockMatters(bracket);
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!active) return;
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [active]);
	return useMemo(
		() => schedule(bracket, new Date(now).toISOString()),
		[bracket, now],
	);
}
