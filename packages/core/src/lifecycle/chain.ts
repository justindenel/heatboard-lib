import { setHeatStatus } from "../actions/heats";
import { mapHeats } from "../internal/bracket";
import { withChain } from "../internal/chain";
import type { Bracket, Heat } from "../model";
import { numberedHeats, raceFormatOf, type NumberedHeat } from "../queries";

/** Most recently started heat: the one the chain follows. */
function latestStarted(heats: NumberedHeat[]): NumberedHeat | undefined {
	let latest: NumberedHeat | undefined;
	for (const found of heats) {
		const { startedAt, status } = found.heat;
		if (status === "pending" || startedAt === undefined) continue;
		if (
			!latest ||
			Date.parse(startedAt) >= Date.parse(latest.heat.startedAt as string)
		) {
			latest = found;
		}
	}
	return latest;
}

/** First pending heat after `head` (the first one overall without head): the chain never skips an empty heat. */
function nextAfter(
	heats: NumberedHeat[],
	head: NumberedHeat | undefined,
): NumberedHeat | undefined {
	return heats.find(
		(found) =>
			found.number > (head?.number ?? 0) && found.heat.status === "pending",
	);
}

/** End of the heat's timer in ms; undefined without start or duration. */
function timerEndMs(bracket: Bracket, heat: Heat): number | undefined {
	const durationSec = raceFormatOf(bracket, heat).timing.heatDurationSec;
	if (heat.startedAt === undefined || durationSec === undefined)
		return undefined;
	return Date.parse(heat.startedAt) + durationSec * 1000;
}

/** Whether a heat's timer is still running at `now` (ISO) for the heat the chain follows. */
export function timerRunningAt(bracket: Bracket, now: string): boolean {
	const head = latestStarted(numberedHeats(bracket));
	if (!head) return false;
	const end = timerEndMs(bracket, head.heat);
	return end !== undefined && end > Date.parse(now);
}

function stampEnds(bracket: Bracket, nowMs: number): Bracket {
	return mapHeats(bracket, (heat) => {
		if (heat.status === "pending" || heat.endedAt !== undefined) return heat;
		const end = timerEndMs(bracket, heat);
		if (end === undefined || end > nowMs) return heat;
		return { ...heat, endedAt: new Date(end).toISOString() };
	});
}

function advance(bracket: Bracket, nowMs: number): Bracket {
	const current = stampEnds(bracket, nowMs);
	if (current !== bracket) return current;

	const heats = numberedHeats(current);
	const head = latestStarted(heats);
	const chain = current.chain ?? {};
	if (head) {
		const end = timerEndMs(current, head.heat);
		if (end === undefined || end > nowMs) return current;
	} else if (!chain.break) {
		return current;
	}
	if (chain.pause === "paused") return current;
	if (chain.pause === "requested")
		return withChain(current, { pause: "paused" });
	if (current.status === "draft" || current.status === "validated")
		return current;

	const next = nextAfter(heats, head);
	if (!next || next.round.optional) return current;
	const ridersKnown = next.heat.slots.length > 0;
	const breakSec = current.timing?.breakSec ?? 0;

	let planned = chain.break;
	if (chain.waiting) {
		if (!ridersKnown) return current;
		// The qualifiers arrived after the break: the riders get a whole new one.
		planned = {
			startedAt: new Date(nowMs).toISOString(),
			durationSec: breakSec,
		};
	} else if (!planned) {
		const endedAt = head?.heat.endedAt;
		if (endedAt === undefined) return current;
		planned = { startedAt: endedAt, durationSec: breakSec };
	}
	const startMs = Date.parse(planned.startedAt) + planned.durationSec * 1000;
	if (startMs > nowMs) {
		return chain.break === planned
			? current
			: withChain(current, { break: planned });
	}
	if (!ridersKnown) return withChain(current, { waiting: true });
	const started = setHeatStatus(
		current,
		next.heat.id,
		"running",
		new Date(startMs).toISOString(),
	);
	return started.ok ? started.bracket : current;
}

/**
 * Deduces what the timers did up to `now` (ISO): heats whose timer ran out get an `endedAt`, the
 * break starts, and the next heat starts when it is over, with the race format in force at that
 * moment. Pure: nothing runs in the background, callers settle before reading or writing a bracket.
 * Returns the same bracket when nothing happened.
 */
export function settleChain(bracket: Bracket, now: string): Bracket {
	const nowMs = Date.parse(now);
	if (!Number.isFinite(nowMs)) return bracket;
	let current = bracket;
	// Each round of the loop stamps an end, stores a break or starts a heat, or stops.
	const limit = 3 * numberedHeats(bracket).length + 3;
	for (let i = 0; i < limit; i++) {
		const next = advance(current, nowMs);
		if (next === current) break;
		current = next;
	}
	return current;
}

export type SchedulePhase = "heat" | "break" | "paused" | "waiting" | "idle";

export interface ScheduleNext {
	heatId: string;
	number: number;
	/** No rider is known yet: the chain waits for the qualifiers. */
	ridersKnown: boolean;
	/** Exact estimated start, ISO; absent while paused, waiting or when nothing is going on. */
	startsAt?: string;
}

export interface Schedule {
	phase: SchedulePhase;
	/** The pause button was pressed during a heat: the chain stops when it ends. */
	pauseRequested: boolean;
	/** Phase `heat`: the heat that is running. */
	heatId?: string;
	number?: number;
	/** Start and end of the current heat or break, ISO; a heat without duration has no end. */
	startedAt?: string;
	endsAt?: string;
	remainingSec?: number;
	next?: ScheduleNext;
	/** Seconds the next start is late compared to a chain that never paused or waited. */
	delaySec: number;
}

/** Where the race stands at `now` (ISO) and when the next heat is expected to start. */
export function schedule(bracket: Bracket, now: string): Schedule {
	const nowMs = Date.parse(now);
	const settled = settleChain(bracket, now);
	const heats = numberedHeats(settled);
	const head = latestStarted(heats);
	const over = settled.status === "finished" || settled.status === "validated";
	const chain = over ? {} : (settled.chain ?? {});
	const breakSec = settled.timing?.breakSec ?? 0;
	const nextFound = nextAfter(heats, head);
	const nextBase: ScheduleNext | undefined = nextFound && {
		heatId: nextFound.heat.id,
		number: nextFound.number,
		ridersKnown: nextFound.heat.slots.length > 0,
	};
	const result: Schedule = {
		phase: "idle",
		pauseRequested: chain.pause === "requested",
		delaySec: 0,
	};
	const withNext = (startsAt?: number) => {
		if (nextBase) {
			result.next =
				startsAt === undefined
					? nextBase
					: { ...nextBase, startsAt: new Date(startsAt).toISOString() };
		}
	};
	const headEnd = head && timerEndMs(settled, head.heat);
	const theoretical =
		headEnd === undefined ? undefined : headEnd + breakSec * 1000;
	const lateSec = (startsAt: number) =>
		theoretical === undefined
			? 0
			: Math.max(0, Math.floor((startsAt - theoretical) / 1000));

	if (head && headEnd !== undefined && headEnd > nowMs) {
		const startedAt = head.heat.startedAt as string;
		const durationSec = (headEnd - Date.parse(startedAt)) / 1000;
		result.phase = "heat";
		result.heatId = head.heat.id;
		result.number = head.number;
		result.startedAt = startedAt;
		result.endsAt = new Date(headEnd).toISOString();
		result.remainingSec = Math.max(
			0,
			durationSec -
				Math.max(0, Math.floor((nowMs - Date.parse(startedAt)) / 1000)),
		);
		withNext(
			chain.pause === "requested" ? undefined : headEnd + breakSec * 1000,
		);
	} else if (head && headEnd === undefined && head.heat.status === "running") {
		result.phase = "heat";
		result.heatId = head.heat.id;
		result.number = head.number;
		result.startedAt = head.heat.startedAt;
		withNext();
	} else if (chain.pause === "paused") {
		result.phase = "paused";
		withNext();
		result.delaySec = lateSec(nowMs);
	} else if (chain.break) {
		const startMs = Date.parse(chain.break.startedAt);
		const endMs = startMs + chain.break.durationSec * 1000;
		result.phase = "break";
		result.startedAt = chain.break.startedAt;
		result.endsAt = new Date(endMs).toISOString();
		result.remainingSec = Math.max(0, Math.ceil((endMs - nowMs) / 1000));
		withNext(endMs);
		result.delaySec = lateSec(endMs);
	} else if (chain.waiting) {
		result.phase = "waiting";
		withNext();
		result.delaySec = lateSec(nowMs);
	} else {
		withNext();
	}
	return result;
}
