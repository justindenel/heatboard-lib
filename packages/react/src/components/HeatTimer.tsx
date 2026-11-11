import { useBracketContext } from "../context";
import { useHeatTimer } from "../useHeatTimer";
import { partProps, useBoardSettings, type HeatTimerProps } from "./settings";

function formatClock(totalSec: number): string {
	const hours = Math.floor(totalSec / 3600);
	const minutes = Math.floor((totalSec % 3600) / 60);
	const seconds = String(totalSec % 60).padStart(2, "0");
	return hours > 0
		? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
		: `${minutes}:${seconds}`;
}

/** Time left in a running heat, or the time elapsed when the round has no duration. */
export function HeatTimer({ heatId }: HeatTimerProps) {
	const { bracket } = useBracketContext();
	const settings = useBoardSettings();
	const clock = useHeatTimer(bracket, heatId);
	const { className, style } = partProps(
		settings,
		"timer",
		"hb-timer",
		clock.isOver && "hb-timer--over",
		clock.breakRemainingSec !== undefined && "hb-timer--break",
	);
	const { labels } = settings;
	if (clock.breakRemainingSec !== undefined) {
		const time = formatClock(clock.breakRemainingSec);
		return (
			<time
				className={className}
				style={style}
				role="timer"
				aria-label={labels.timerBreak(time)}
				dateTime={`PT${clock.breakRemainingSec}S`}
			>
				{labels.timerBreak(time)}
			</time>
		);
	}
	if (clock.elapsedSec === undefined) return null;

	const seconds = clock.remainingSec ?? clock.elapsedSec;
	const time = formatClock(seconds);
	const label = clock.isOver
		? labels.timerOver
		: clock.remainingSec !== undefined
			? labels.timerRemaining(time)
			: labels.timerElapsed(time);
	return (
		<time
			className={className}
			style={style}
			role="timer"
			aria-label={label}
			title={label}
			dateTime={`PT${seconds}S`}
		>
			{time}
		</time>
	);
}
