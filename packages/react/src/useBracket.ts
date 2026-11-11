import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
	applyAction,
	type Action,
	type ActionResult,
	type Bracket,
	type BracketError,
	type BracketOptions,
} from "@heatboard/core";

export interface ServerError {
	code:
		| "SERVER_ERROR"
		| "ACTION_ID_FAILED"
		| "CALLBACK_FAILED"
		| "INVALID_SERVER_RESPONSE";
	message: string;
	cause?: unknown;
}

export type DispatchResult = ActionResult | { ok: false; error: ServerError };

export type BracketChangeCause =
	| { type: "action"; action: Action }
	| { type: "server" }
	| { type: "rollback"; error: ServerError | BracketError };

export interface UseBracketParams {
	/** Controlled mode: the host owns the bracket and feeds it back from `onChange`. */
	bracket?: Bracket;
	/** Uncontrolled mode: initial bracket, then owned by the hook. */
	defaultBracket?: Bracket;
	options?: BracketOptions;
	onChange?: (next: Bracket, cause: BracketChangeCause) => void;
	onAction?: (
		action: Action,
		actionId: string,
		optimistic: Bracket,
	) => Promise<Bracket | void>;
	/**
	 * With `onAction`, accepted actions are queued and sent one at a time. When
	 * true, they stay queued (`pending`) and are sent in order once it is false.
	 * Without `onAction` the hook is local: every accepted action is final.
	 */
	offline?: boolean;
	/** Defaults to `crypto.randomUUID`, with a weaker fallback when unavailable. */
	createActionId?: () => string;
}

export interface BracketController {
	bracket: Bracket;
	dispatch: (action: Action) => DispatchResult;
	/** Dry run: reports what `dispatch` would return without changing anything. */
	canApply: (action: Action) => ActionResult;
	pending: boolean;
	error: BracketError | ServerError | null;
	clearError: () => void;
}

interface QueueItem {
	action: Action;
	actionId: string;
	optimistic: Bracket;
}

interface Engine {
	sync: (params: UseBracketParams) => void;
	setMounted: (mounted: boolean) => void;
	dispatch: (action: Action) => DispatchResult;
	canApply: (action: Action) => ActionResult;
}

type HookError = BracketError | ServerError;

function toServerError(reason: unknown): HookError {
	if (
		typeof reason === "object" &&
		reason !== null &&
		typeof (reason as { code?: unknown }).code === "string" &&
		typeof (reason as { message?: unknown }).message === "string"
	) {
		return reason as HookError;
	}
	return {
		code: "SERVER_ERROR",
		message: reason instanceof Error ? reason.message : String(reason),
		cause: reason,
	};
}

function isBracket(value: unknown): value is Bracket {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as Partial<Record<keyof Bracket, unknown>>;
	return (
		typeof candidate.id === "string" &&
		Array.isArray(candidate.rounds) &&
		Array.isArray(candidate.entries)
	);
}

/** Last-resort ids (no `crypto`) are unique enough for tracing, not for security. */
export function defaultActionId(): string {
	const c = globalThis.crypto as Crypto | undefined;
	if (typeof c?.randomUUID === "function") return c.randomUUID();
	if (typeof c?.getRandomValues === "function") {
		const bytes = c.getRandomValues(new Uint8Array(16));
		return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
	}
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function createEngine(
	initialParams: UseBracketParams,
	setLocal: (bracket: Bracket) => void,
	setPending: (pending: boolean) => void,
	setError: (error: HookError | null) => void,
): Engine {
	let latest = initialParams;
	let mounted = true;
	let lastProp = initialParams.bracket;
	let head = initialParams.bracket ?? initialParams.defaultBracket;
	let confirmed = head;
	let inFlight = false;
	const queue: QueueItem[] = [];

	const isControlled = () => latest.bracket !== undefined;
	const current = (): Bracket => {
		if (!head) throw new Error("useBracket: no bracket available");
		return head;
	};

	function publishError(error: HookError | null) {
		if (mounted) setError(error);
	}

	function publishPending() {
		if (mounted) setPending(queue.length > 0);
	}

	function setHead(next: Bracket) {
		head = next;
		if (!isControlled() && mounted) setLocal(next);
	}

	function emit(
		next: Bracket,
		cause: BracketChangeCause,
		onThrow: (reason: unknown) => void = (reason) =>
			publishError({
				code: "CALLBACK_FAILED",
				message: "onChange threw",
				cause: reason,
			}),
	) {
		try {
			latest.onChange?.(next, cause);
		} catch (reason) {
			onThrow(reason);
		}
	}

	function replayQueue(base: Bracket): Bracket {
		let acc = base;
		for (let i = 0; i < queue.length;) {
			const item = queue[i] as QueueItem;
			const result = applyAction(acc, item.action, latest.options);
			const locked = inFlight && i === 0;
			if (result.ok) {
				if (!locked) item.optimistic = result.bracket;
				acc = result.bracket;
				i++;
			} else if (locked) {
				publishError(result.error);
				i++;
			} else {
				queue.splice(i, 1);
				publishError(result.error);
			}
		}
		setHead(acc);
		return acc;
	}

	function succeed(item: QueueItem, response: unknown) {
		inFlight = false;
		if (response !== undefined && !isBracket(response)) {
			fail({
				code: "INVALID_SERVER_RESPONSE",
				message: "onAction resolved with a value that is not a bracket",
				cause: response,
			});
			return;
		}
		queue.shift();
		if (response === undefined) {
			confirmed = item.optimistic;
		} else {
			confirmed = response;
			emit(replayQueue(response), { type: "server" });
		}
		publishPending();
		pump();
	}

	function fail(error: HookError) {
		inFlight = false;
		queue.length = 0;
		if (confirmed) setHead(confirmed);
		publishError(error);
		publishPending();
		if (confirmed) {
			emit(confirmed, { type: "rollback", error }, (reason) =>
				publishError({ ...error, cause: reason } as HookError),
			);
		}
	}

	function pump() {
		const { onAction } = latest;
		const item = queue[0];
		if (inFlight || !item || !onAction || latest.offline) return;
		inFlight = true;
		const sent = new Promise<Bracket | void>((resolve) => {
			resolve(onAction(item.action, item.actionId, item.optimistic));
		});
		sent.then(
			(response) => succeed(item, response),
			(reason: unknown) => {
				fail(toServerError(reason));
			},
		);
	}

	return {
		sync: (params) => {
			latest = params;
			if (params.bracket !== undefined && params.bracket !== lastProp) {
				lastProp = params.bracket;
				if (params.bracket !== head) {
					confirmed = params.bracket;
					if (queue.length === 0) {
						head = params.bracket;
					} else {
						const replayed = replayQueue(params.bracket);
						if (replayed !== params.bracket) {
							emit(replayed, { type: "server" });
						}
					}
				}
			}
			pump();
		},
		setMounted: (value) => {
			mounted = value;
		},
		canApply: (action) => applyAction(current(), action, latest.options),
		dispatch: (action) => {
			const before = current();
			const result = applyAction(before, action, latest.options);
			if (!result.ok) {
				publishError(result.error);
				return result;
			}
			if (result.bracket === before) return result;

			const queued = latest.onAction !== undefined;
			let actionId = "";
			if (queued) {
				try {
					actionId = (latest.createActionId ?? defaultActionId)();
				} catch (reason) {
					const error: ServerError = {
						code: "ACTION_ID_FAILED",
						message: "createActionId threw",
						cause: reason,
					};
					publishError(error);
					return { ok: false, error };
				}
			}

			setHead(result.bracket);
			if (queued) {
				queue.push({ action, actionId, optimistic: result.bracket });
				publishPending();
			} else {
				confirmed = result.bracket;
			}
			emit(result.bracket, { type: "action", action });
			pump();
			return result;
		},
	};
}

/**
 * Applies bracket actions with optimistic updates and an ordered send queue.
 * Without `onAction` the hook is local: accepted actions are final, nothing is
 * queued and `pending` stays false. With `offline`, actions stay queued until
 * it turns false. After unmount the queue keeps sending so no action is lost; only hook state
 * stops updating, while `onChange` still fires.
 */
export function useBracket(params: UseBracketParams): BracketController {
	const { bracket: controlled, defaultBracket } = params;
	if ((controlled === undefined) === (defaultBracket === undefined)) {
		throw new Error(
			"useBracket: provide exactly one of `bracket` (controlled) or `defaultBracket` (uncontrolled)",
		);
	}

	const [local, setLocal] = useState(defaultBracket);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<HookError | null>(null);
	const [engine] = useState(() =>
		createEngine(params, setLocal, setPending, setError),
	);
	const [clearError] = useState(() => () => setError(null));

	useLayoutEffect(() => {
		engine.sync(params);
	});
	useEffect(() => {
		engine.setMounted(true);
		return () => engine.setMounted(false);
	}, [engine]);

	const bracket = controlled ?? local;
	if (!bracket) throw new Error("useBracket: no bracket available");

	return useMemo(
		() => ({
			bracket,
			dispatch: engine.dispatch,
			canApply: engine.canApply,
			pending,
			error,
			clearError,
		}),
		[bracket, engine, pending, error, clearError],
	);
}
