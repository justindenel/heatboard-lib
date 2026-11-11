import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode, useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Action, Bracket } from "@heatboard/core";
import { useBracket, type UseBracketParams } from "../useBracket";
import { deferred, flush, makeBracket, type Deferred } from "./helpers";

afterEach(cleanup);

const rename = (name: string): Action => ({ type: "renameBracket", name });
const renameRound = (name: string): Action => ({
	type: "renameRound",
	roundId: "round1",
	name,
});

function useHostWithChange(extra: Partial<UseBracketParams> = {}) {
	const [bracket, setBracket] = useState(makeBracket());
	const { onChange, ...rest } = extra;
	return useBracket({
		bracket,
		onChange: (next, cause) => {
			setBracket(next);
			onChange?.(next, cause);
		},
		...rest,
	});
}
function recorder() {
	const calls: {
		action: Action;
		actionId: string;
		optimistic: Bracket;
		reply: Deferred<Bracket | void>;
	}[] = [];
	const onAction: NonNullable<UseBracketParams["onAction"]> = (
		action,
		actionId,
		optimistic,
	) => {
		const reply = deferred<Bracket | void>();
		calls.push({ action, actionId, optimistic, reply });
		return reply.promise;
	};
	return { calls, onAction };
}

describe("controlled optimistic head", () => {
	it("keeps both changes of two dispatches in one handler", () => {
		const { result } = renderHook(() => useHostWithChange());
		act(() => {
			result.current.dispatch(rename("Final"));
			result.current.dispatch(renameRound("Renamed"));
		});
		expect(result.current.bracket.name).toBe("Final");
		expect(result.current.bracket.rounds[0]?.name).toBe("Renamed");
	});

	it("hands the optimistic head to onAction", () => {
		const { calls, onAction } = recorder();
		const { result } = renderHook(() => useHostWithChange({ onAction }));
		act(() => {
			result.current.dispatch(rename("A"));
			result.current.dispatch(rename("B"));
		});
		expect(calls).toHaveLength(1);
		expect(calls[0]?.optimistic.name).toBe("A");
	});
});

describe("controlled server semantics", () => {
	it("reports server brackets and replays the queue", async () => {
		const { calls, onAction } = recorder();
		const onChange = vi.fn();
		const { result } = renderHook(() =>
			useHostWithChange({ onAction, onChange }),
		);
		act(() => {
			result.current.dispatch(rename("One"));
			result.current.dispatch(renameRound("Renamed"));
		});
		const server = makeBracket("Server");
		await flush(() => calls[0]?.reply.resolve(server));
		expect(result.current.bracket.name).toBe("Server");
		expect(result.current.bracket.rounds[0]?.name).toBe("Renamed");
		expect(onChange).toHaveBeenLastCalledWith(result.current.bracket, {
			type: "server",
		});
		expect(calls[1]?.optimistic).toBe(result.current.bracket);
	});

	it("rolls back to the last confirmed bracket after a server reply", async () => {
		const { calls, onAction } = recorder();
		const onChange = vi.fn();
		const { result } = renderHook(() =>
			useHostWithChange({ onAction, onChange }),
		);
		act(() => {
			result.current.dispatch(rename("One"));
			result.current.dispatch(renameRound("Renamed"));
			result.current.dispatch(rename("Three"));
		});
		const server = makeBracket("Server");
		await flush(() => calls[0]?.reply.resolve(server));
		await flush(() => calls[1]?.reply.reject(new Error("no")));
		expect(calls).toHaveLength(2);
		expect(result.current.pending).toBe(false);
		expect(result.current.bracket).toBe(server);
		expect(onChange).toHaveBeenLastCalledWith(server, {
			type: "rollback",
			error: expect.objectContaining({ message: "no" }) as unknown,
		});
	});
});

describe("StrictMode", () => {
	const wrapper = ({ children }: { children: ReactNode }) => (
		<StrictMode>{children}</StrictMode>
	);

	it("sends each uncontrolled action once", async () => {
		const { calls, onAction } = recorder();
		const { result } = renderHook(
			() => useBracket({ defaultBracket: makeBracket(), onAction }),
			{ wrapper },
		);
		act(() => {
			result.current.dispatch(rename("A"));
		});
		expect(calls).toHaveLength(1);
		await flush(() => calls[0]?.reply.resolve());
		expect(result.current.pending).toBe(false);
		expect(result.current.bracket.name).toBe("A");
	});

	it("sends each controlled action once", async () => {
		const { calls, onAction } = recorder();
		const { result } = renderHook(() => useHostWithChange({ onAction }), {
			wrapper,
		});
		act(() => {
			result.current.dispatch(rename("A"));
		});
		expect(calls).toHaveLength(1);
		await flush(() => calls[0]?.reply.resolve());
		expect(result.current.pending).toBe(false);
		expect(result.current.bracket.name).toBe("A");
	});
});

describe("unmount", () => {
	it("keeps sending queued actions without touching state", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const { calls, onAction } = recorder();
		const { result, unmount } = renderHook(() =>
			useBracket({ defaultBracket: makeBracket(), onAction }),
		);
		act(() => {
			result.current.dispatch(rename("A"));
			result.current.dispatch(rename("B"));
		});
		unmount();
		await flush(() => calls[0]?.reply.resolve());
		expect(calls).toHaveLength(2);
		await flush(() => calls[1]?.reply.reject(new Error("late")));
		expect(error).not.toHaveBeenCalled();
	});
});

describe("server response validation", () => {
	it("treats a non-bracket reply as a rejection", async () => {
		const { calls, onAction } = recorder();
		const initial = makeBracket();
		const { result } = renderHook(() =>
			useBracket({ defaultBracket: initial, onAction }),
		);
		act(() => {
			result.current.dispatch(rename("A"));
			result.current.dispatch(rename("B"));
		});
		await flush(() => calls[0]?.reply.resolve({ ok: true } as never));
		expect(result.current.error).toMatchObject({
			code: "INVALID_SERVER_RESPONSE",
		});
		expect(result.current.bracket).toBe(initial);
		expect(result.current.pending).toBe(false);
		expect(calls).toHaveLength(1);
	});

	it("rejects a bracket-like object missing arrays", async () => {
		const { calls, onAction } = recorder();
		const { result } = renderHook(() =>
			useBracket({ defaultBracket: makeBracket(), onAction }),
		);
		act(() => {
			result.current.dispatch(rename("A"));
		});
		await flush(() =>
			calls[0]?.reply.resolve({ id: "x", rounds: [] } as never),
		);
		expect(result.current.error).toMatchObject({
			code: "INVALID_SERVER_RESPONSE",
		});
	});
});

describe("rejection after a server reply", () => {
	it("returns to the server bracket, not the initial one", async () => {
		const { calls, onAction } = recorder();
		const { result } = renderHook(() =>
			useBracket({ defaultBracket: makeBracket(), onAction }),
		);
		act(() => {
			result.current.dispatch(rename("A"));
			result.current.dispatch(rename("B"));
		});
		const server = makeBracket("Server");
		await flush(() => calls[0]?.reply.resolve(server));
		await flush(() => calls[1]?.reply.reject(new Error("no")));
		expect(result.current.bracket).toBe(server);
	});
});

describe("offline", () => {
	it("queues without sending, then sends in order once online", async () => {
		const { calls, onAction } = recorder();
		const initialProps: UseBracketParams = {
			defaultBracket: makeBracket(),
			onAction,
			offline: true,
		};
		const { result, rerender } = renderHook(
			(p: UseBracketParams) => useBracket(p),
			{ initialProps },
		);
		act(() => {
			result.current.dispatch(rename("A"));
			result.current.dispatch(rename("B"));
		});
		expect(calls).toHaveLength(0);
		expect(result.current.pending).toBe(true);
		expect(result.current.bracket.name).toBe("B");
		rerender({ ...initialProps, offline: false });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.action).toEqual(rename("A"));
		await flush(() => calls[0]?.reply.resolve());
		expect(calls).toHaveLength(2);
		expect(calls[1]?.action).toEqual(rename("B"));
		await flush(() => calls[1]?.reply.resolve());
		expect(result.current.pending).toBe(false);
	});

	it("rolls back after going online when the server rejects", async () => {
		const { calls, onAction } = recorder();
		const initial = makeBracket();
		const initialProps: UseBracketParams = {
			defaultBracket: initial,
			onAction,
			offline: true,
		};
		const { result, rerender } = renderHook(
			(p: UseBracketParams) => useBracket(p),
			{ initialProps },
		);
		act(() => {
			result.current.dispatch(rename("A"));
		});
		rerender({ ...initialProps, offline: false });
		await flush(() => calls[0]?.reply.reject(new Error("no")));
		expect(result.current.bracket).toBe(initial);
		expect(result.current.pending).toBe(false);
	});
});

describe("local mode", () => {
	it("makes every accepted action final", () => {
		const onChange = vi.fn();
		const { result } = renderHook(() =>
			useBracket({ defaultBracket: makeBracket(), onChange, offline: true }),
		);
		act(() => {
			result.current.dispatch(rename("A"));
			result.current.dispatch(rename("B"));
		});
		expect(result.current.bracket.name).toBe("B");
		expect(result.current.pending).toBe(false);
		expect(onChange).toHaveBeenCalledTimes(2);
	});

	it("uses the current state as the confirmed base for later external changes", () => {
		const onChange = vi.fn();
		const { result, rerender } = renderHook(
			(p: UseBracketParams) => useBracket(p),
			{ initialProps: { bracket: makeBracket(), onChange } },
		);
		act(() => {
			result.current.dispatch(rename("A"));
		});
		const external = makeBracket("External");
		rerender({ bracket: external, onChange });
		expect(result.current.canApply(rename("External"))).toEqual({
			ok: true,
			bracket: external,
		});
	});
});

describe("external prop change in controlled mode", () => {
	it("keeps the external update after a later rejection", async () => {
		const { calls, onAction } = recorder();
		const onChange = vi.fn();
		const initialProps: UseBracketParams = {
			bracket: makeBracket(),
			onAction,
			onChange,
		};
		const { result, rerender } = renderHook(
			(p: UseBracketParams) => useBracket(p),
			{ initialProps },
		);
		act(() => {
			result.current.dispatch(rename("Mine"));
		});
		const external = makeBracket("External");
		rerender({ ...initialProps, bracket: external });
		expect(onChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ name: "Mine" }) as unknown,
			{ type: "server" },
		);
		await flush(() => calls[0]?.reply.reject(new Error("no")));
		expect(onChange).toHaveBeenLastCalledWith(external, {
			type: "rollback",
			error: expect.objectContaining({ message: "no" }) as unknown,
		});
	});

	it("drops queued actions that no longer apply", async () => {
		const { calls, onAction } = recorder();
		const onChange = vi.fn();
		const initialProps: UseBracketParams = {
			bracket: makeBracket(),
			onAction,
			onChange,
		};
		const { result, rerender } = renderHook(
			(p: UseBracketParams) => useBracket(p),
			{ initialProps },
		);
		act(() => {
			result.current.dispatch(rename("A"));
			result.current.dispatch(renameRound("R"));
		});
		const external: Bracket = { ...makeBracket("External"), rounds: [] };
		rerender({ ...initialProps, bracket: external });
		expect(result.current.error).toMatchObject({ code: "UNKNOWN_ROUND" });
		await flush(() => calls[0]?.reply.resolve());
		expect(calls).toHaveLength(1);
		expect(result.current.pending).toBe(false);
	});

	it("adopts the prop when the queue is empty", () => {
		const { result, rerender } = renderHook(
			(p: UseBracketParams) => useBracket(p),
			{ initialProps: { bracket: makeBracket() } },
		);
		const external = makeBracket("External");
		rerender({ bracket: external });
		expect(result.current.canApply(rename("External"))).toEqual({
			ok: true,
			bracket: external,
		});
	});
});

describe("actionId", () => {
	it("refuses the dispatch when createActionId throws", () => {
		const { calls, onAction } = recorder();
		const initial = makeBracket();
		const onChange = vi.fn();
		const { result } = renderHook(() =>
			useBracket({
				defaultBracket: initial,
				onAction,
				onChange,
				createActionId: () => {
					throw new Error("id");
				},
			}),
		);
		let outcome;
		act(() => {
			outcome = result.current.dispatch(rename("A"));
		});
		expect(outcome).toMatchObject({
			ok: false,
			error: { code: "ACTION_ID_FAILED" },
		});
		expect(result.current.bracket).toBe(initial);
		expect(result.current.pending).toBe(false);
		expect(result.current.error).toMatchObject({ code: "ACTION_ID_FAILED" });
		expect(calls).toHaveLength(0);
		expect(onChange).not.toHaveBeenCalled();
	});

	it("falls back when crypto.randomUUID is missing", () => {
		const { calls, onAction } = recorder();
		const { result } = renderHook(() =>
			useBracket({ defaultBracket: makeBracket(), onAction }),
		);
		vi.stubGlobal("crypto", {});
		try {
			act(() => {
				result.current.dispatch(rename("A"));
			});
		} finally {
			vi.unstubAllGlobals();
		}
		expect(calls[0]?.actionId).toBeTruthy();
	});
});

describe("onChange failures", () => {
	it("keeps the server error when onChange throws during a rollback", async () => {
		const { calls, onAction } = recorder();
		const boom = new Error("host bug");
		const { result } = renderHook(() =>
			useBracket({
				defaultBracket: makeBracket(),
				onAction,
				onChange: (_next, cause) => {
					if (cause.type === "rollback") throw boom;
				},
			}),
		);
		act(() => {
			result.current.dispatch(rename("A"));
		});
		await flush(() => calls[0]?.reply.reject(new Error("no")));
		expect(result.current.error).toMatchObject({
			code: "SERVER_ERROR",
			message: "no",
			cause: boom,
		});
	});

	it("exposes the exception and keeps the queue", () => {
		const { calls, onAction } = recorder();
		const { result } = renderHook(() =>
			useBracket({
				defaultBracket: makeBracket(),
				onAction,
				onChange: () => {
					throw new Error("host bug");
				},
			}),
		);
		let outcome;
		act(() => {
			outcome = result.current.dispatch(rename("A"));
		});
		expect(outcome).toMatchObject({ ok: true });
		expect(result.current.error).toMatchObject({ code: "CALLBACK_FAILED" });
		expect(result.current.bracket.name).toBe("A");
		expect(calls).toHaveLength(1);
		expect(result.current.pending).toBe(true);
	});
});

describe("controller identity", () => {
	it("is stable while nothing changes", () => {
		const initial = makeBracket();
		const { result, rerender } = renderHook(() =>
			useBracket({ defaultBracket: initial }),
		);
		const first = result.current;
		rerender();
		expect(result.current).toBe(first);
	});
});
