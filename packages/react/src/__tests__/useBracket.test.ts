import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Action, Bracket } from "@heatboard/core";
import { useBracket, type UseBracketParams } from "../useBracket";
import { deferred, flush, makeBracket, type Deferred } from "./helpers";

afterEach(cleanup);

const rename = (name: string): Action => ({ type: "renameBracket", name });
const unknownRound: Action = {
	type: "renameRound",
	roundId: "nope",
	name: "x",
};

function render(params: UseBracketParams) {
	return renderHook((p: UseBracketParams) => useBracket(p), {
		initialProps: params,
	});
}

describe("parameters", () => {
	it("throws when neither bracket nor defaultBracket is given", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		expect(() => render({})).toThrow(/exactly one/);
	});

	it("throws when both are given", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		expect(() =>
			render({ bracket: makeBracket(), defaultBracket: makeBracket() }),
		).toThrow(/exactly one/);
	});
});

describe("dispatch", () => {
	it("applies a valid action and calls onChange", () => {
		const onChange = vi.fn();
		const { result } = render({ defaultBracket: makeBracket(), onChange });
		let outcome;
		act(() => {
			outcome = result.current.dispatch(rename("Final"));
		});
		expect(outcome).toMatchObject({ ok: true });
		expect(result.current.bracket.name).toBe("Final");
		expect(onChange).toHaveBeenCalledWith(result.current.bracket, {
			type: "action",
			action: rename("Final"),
		});
		expect(result.current.error).toBeNull();
	});

	it("rejects an invalid action without side effects", () => {
		const onChange = vi.fn();
		const onAction = vi.fn();
		const initial = makeBracket();
		const { result } = render({ defaultBracket: initial, onChange, onAction });
		let outcome;
		act(() => {
			outcome = result.current.dispatch(unknownRound);
		});
		expect(outcome).toMatchObject({ ok: false });
		expect(result.current.bracket).toBe(initial);
		expect(result.current.error).toMatchObject({ code: "UNKNOWN_ROUND" });
		expect(onChange).not.toHaveBeenCalled();
		expect(onAction).not.toHaveBeenCalled();
		expect(result.current.pending).toBe(false);
		act(() => result.current.clearError());
		expect(result.current.error).toBeNull();
	});

	it("returns ok without calling anything on a no-op", () => {
		const onChange = vi.fn();
		const onAction = vi.fn();
		const initial = makeBracket("Open");
		const { result } = render({ defaultBracket: initial, onChange, onAction });
		let outcome;
		act(() => {
			outcome = result.current.dispatch(rename("Open"));
		});
		expect(outcome).toMatchObject({ ok: true });
		expect(result.current.bracket).toBe(initial);
		expect(onChange).not.toHaveBeenCalled();
		expect(onAction).not.toHaveBeenCalled();
		expect(result.current.pending).toBe(false);
	});

	it("keeps a stable identity across renders", () => {
		const { result, rerender } = render({ defaultBracket: makeBracket() });
		const { dispatch, canApply, clearError } = result.current;
		act(() => {
			result.current.dispatch(rename("Final"));
		});
		rerender({ defaultBracket: makeBracket() });
		expect(result.current.dispatch).toBe(dispatch);
		expect(result.current.canApply).toBe(canApply);
		expect(result.current.clearError).toBe(clearError);
	});
});

describe("canApply", () => {
	it("reports the outcome without changing anything", () => {
		const onChange = vi.fn();
		const onAction = vi.fn();
		const initial = makeBracket();
		const { result } = render({ defaultBracket: initial, onChange, onAction });
		expect(result.current.canApply(rename("Final"))).toMatchObject({
			ok: true,
		});
		expect(result.current.canApply(unknownRound)).toMatchObject({ ok: false });
		expect(result.current.bracket).toBe(initial);
		expect(result.current.error).toBeNull();
		expect(onChange).not.toHaveBeenCalled();
		expect(onAction).not.toHaveBeenCalled();
	});
});

describe("controlled mode", () => {
	it("calls onChange and follows the bracket prop", () => {
		const onChange = vi.fn();
		const initial = makeBracket();
		const { result, rerender } = render({ bracket: initial, onChange });
		act(() => {
			result.current.dispatch(rename("Final"));
		});
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(result.current.bracket).toBe(initial);
		const next = onChange.mock.calls[0]?.[0] as Bracket;
		rerender({ bracket: next, onChange });
		expect(result.current.bracket).toBe(next);
		expect(result.current.bracket.name).toBe("Final");
	});

	it("dispatches against the latest prop", () => {
		const onChange = vi.fn();
		const { result, rerender } = render({
			bracket: makeBracket("A"),
			onChange,
		});
		const replaced = makeBracket("B");
		rerender({ bracket: replaced, onChange });
		act(() => {
			result.current.dispatch(rename("C"));
		});
		const next = onChange.mock.calls[0]?.[0] as Bracket;
		expect(next.name).toBe("C");
		expect(next.id).toBe(replaced.id);
		expect(result.current.canApply(rename("B"))).toEqual({
			ok: true,
			bracket: replaced,
		});
	});

	it("sends to onAction and exposes pending", async () => {
		const sent = deferred<void>();
		const onAction = vi.fn(() => sent.promise);
		const { result } = render({ bracket: makeBracket(), onAction });
		act(() => {
			result.current.dispatch(rename("Final"));
		});
		expect(onAction).toHaveBeenCalledTimes(1);
		expect(result.current.pending).toBe(true);
		await flush(() => sent.resolve());
		expect(result.current.pending).toBe(false);
	});

	it("sets error on rejection and rolls back through onChange", async () => {
		const sent = deferred<void>();
		const initial = makeBracket();
		const onChange = vi.fn();
		const { result } = render({
			bracket: initial,
			onChange,
			onAction: () => sent.promise,
		});
		act(() => {
			result.current.dispatch(rename("Final"));
		});
		await flush(() => sent.reject(new Error("boom")));
		expect(result.current.error).toMatchObject({
			code: "SERVER_ERROR",
			message: "boom",
		});
		expect(result.current.pending).toBe(false);
		expect(onChange).toHaveBeenLastCalledWith(initial, {
			type: "rollback",
			error: expect.objectContaining({ code: "SERVER_ERROR" }) as unknown,
		});
	});
});

describe("uncontrolled mode with onAction", () => {
	function setup(extra: Partial<UseBracketParams> = {}) {
		const calls: {
			action: Action;
			actionId: string;
			optimistic: Bracket;
			reply: Deferred<Bracket | void>;
		}[] = [];
		const onAction: UseBracketParams["onAction"] = (
			action,
			actionId,
			optimistic,
		) => {
			const reply = deferred<Bracket | void>();
			calls.push({ action, actionId, optimistic, reply });
			return reply.promise;
		};
		const initial = makeBracket();
		const hook = render({ defaultBracket: initial, onAction, ...extra });
		return { ...hook, calls, initial };
	}

	it("updates optimistically, then settles on an empty reply", async () => {
		const { result, calls } = setup();
		act(() => {
			result.current.dispatch(rename("Final"));
		});
		expect(result.current.bracket.name).toBe("Final");
		expect(result.current.pending).toBe(true);
		expect(calls[0]?.optimistic).toBe(result.current.bracket);
		await flush(() => calls[0]?.reply.resolve());
		expect(result.current.bracket.name).toBe("Final");
		expect(result.current.pending).toBe(false);
	});

	it("replaces the state with the server bracket", async () => {
		const { result, calls } = setup();
		act(() => {
			result.current.dispatch(rename("Final"));
		});
		const server = makeBracket("Server");
		await flush(() => calls[0]?.reply.resolve(server));
		expect(result.current.bracket).toBe(server);
		expect(result.current.pending).toBe(false);
	});

	it("replays queued actions on top of the server bracket", async () => {
		const { result, calls } = setup();
		act(() => {
			result.current.dispatch(rename("One"));
			result.current.dispatch({
				type: "renameRound",
				roundId: "round1",
				name: "Renamed",
			});
		});
		const server = makeBracket("Server");
		await flush(() => calls[0]?.reply.resolve(server));
		expect(result.current.bracket.name).toBe("Server");
		expect(result.current.bracket.rounds[0]?.name).toBe("Renamed");
		expect(calls[1]?.optimistic).toBe(result.current.bracket);
		expect(result.current.pending).toBe(true);
	});

	it("drops a queued action that no longer applies after a server reply", async () => {
		const { result, calls } = setup();
		act(() => {
			result.current.dispatch(rename("One"));
			result.current.dispatch({
				type: "renameRound",
				roundId: "round1",
				name: "Renamed",
			});
		});
		const server: Bracket = { ...makeBracket("Server"), rounds: [] };
		await flush(() => calls[0]?.reply.resolve(server));
		expect(result.current.error).toMatchObject({ code: "UNKNOWN_ROUND" });
		expect(result.current.bracket).toEqual(server);
		expect(result.current.pending).toBe(false);
		expect(calls).toHaveLength(1);
	});

	it("returns to the last confirmed state on rejection", async () => {
		const { result, calls, initial } = setup();
		act(() => {
			result.current.dispatch(rename("Final"));
		});
		await flush(() => calls[0]?.reply.reject(new Error("nope")));
		expect(result.current.bracket).toBe(initial);
		expect(result.current.pending).toBe(false);
		expect(result.current.error).toMatchObject({
			code: "SERVER_ERROR",
			message: "nope",
		});
	});

	it("keeps a rejection that already has code and message", async () => {
		const { result, calls } = setup();
		act(() => {
			result.current.dispatch(rename("Final"));
		});
		const rejected = { code: "CONFLICT", message: "stale" };
		await flush(() => calls[0]?.reply.reject(rejected));
		expect(result.current.error).toBe(rejected);
	});

	it("sends queued actions one at a time in dispatch order", async () => {
		const ids = ["id1", "id2", "id3"];
		const { result, calls } = setup({
			createActionId: () => ids.shift() ?? "",
		});
		act(() => {
			result.current.dispatch(rename("A"));
			result.current.dispatch(rename("B"));
			result.current.dispatch(rename("C"));
		});
		expect(result.current.bracket.name).toBe("C");
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({ action: rename("A"), actionId: "id1" });

		await flush(() => calls[0]?.reply.resolve());
		expect(calls).toHaveLength(2);
		expect(calls[1]).toMatchObject({ action: rename("B"), actionId: "id2" });
		expect(result.current.pending).toBe(true);

		await flush(() => calls[1]?.reply.resolve());
		expect(calls).toHaveLength(3);
		expect(calls[2]).toMatchObject({ action: rename("C"), actionId: "id3" });

		await flush(() => calls[2]?.reply.resolve());
		expect(result.current.pending).toBe(false);
	});

	it("never sends the third action when the second is rejected", async () => {
		const { result, calls } = setup();
		act(() => {
			result.current.dispatch(rename("A"));
			result.current.dispatch(rename("B"));
			result.current.dispatch(rename("C"));
		});
		await flush(() => calls[0]?.reply.resolve());
		await flush(() => calls[1]?.reply.reject(new Error("no")));
		expect(calls).toHaveLength(2);
		expect(result.current.bracket.name).toBe("A");
		expect(result.current.pending).toBe(false);
	});

	it("uses crypto.randomUUID by default", () => {
		const { result, calls } = setup();
		act(() => {
			result.current.dispatch(rename("A"));
		});
		expect(calls[0]?.actionId).toMatch(/^[0-9a-f-]{36}$/);
	});

	it("treats a synchronous throw in onAction as a rejection", async () => {
		const initial = makeBracket();
		const { result } = render({
			defaultBracket: initial,
			onAction: () => {
				throw new Error("sync");
			},
		});
		await flush(() => {
			result.current.dispatch(rename("A"));
		});
		expect(result.current.bracket).toBe(initial);
		expect(result.current.pending).toBe(false);
		expect(result.current.error).toMatchObject({ message: "sync" });
	});
});
