import { cleanup, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BracketProvider } from "../BracketProvider";
import { useBracketContext, useEntry, useHeat, useRound } from "../context";
import type { BracketController } from "../useBracket";
import { makeBracket } from "./helpers";

afterEach(cleanup);

function controller(): BracketController {
	return {
		bracket: makeBracket(),
		dispatch: vi.fn(),
		canApply: vi.fn(),
		pending: false,
		error: null,
		clearError: vi.fn(),
	};
}

function wrapperFor(value: BracketController) {
	return ({ children }: { children: ReactNode }) => (
		<BracketProvider value={value}>{children}</BracketProvider>
	);
}

describe("BracketProvider", () => {
	it("provides the controller to descendants", () => {
		const value = controller();
		const { result } = renderHook(() => useBracketContext(), {
			wrapper: wrapperFor(value),
		});
		expect(result.current).toBe(value);
	});

	it("renders its children", () => {
		render(
			<BracketProvider value={controller()}>
				<span>child</span>
			</BracketProvider>,
		);
		expect(screen.getByText("child")).toBeTruthy();
	});

	it("throws outside a provider", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		expect(() => renderHook(() => useBracketContext())).toThrow(
			/BracketProvider/,
		);
	});
});

describe("selectors", () => {
	const value = controller();
	const wrapper = wrapperFor(value);

	it("useRound finds a round by id", () => {
		const { result } = renderHook(() => useRound("round1"), { wrapper });
		expect(result.current).toBe(value.bracket.rounds[0]);
		const missing = renderHook(() => useRound("nope"), { wrapper });
		expect(missing.result.current).toBeUndefined();
	});

	it("useHeat finds a heat with its round", () => {
		const { result } = renderHook(() => useHeat("heat1"), { wrapper });
		expect(result.current?.heat).toBe(value.bracket.rounds[0]?.heats[0]);
		expect(result.current?.round).toBe(value.bracket.rounds[0]);
		const missing = renderHook(() => useHeat("nope"), { wrapper });
		expect(missing.result.current).toBeUndefined();
	});

	it("useEntry finds an entry by rider id", () => {
		const { result } = renderHook(() => useEntry("r1"), { wrapper });
		expect(result.current).toBe(value.bracket.entries[0]);
		const missing = renderHook(() => useEntry("nope"), { wrapper });
		expect(missing.result.current).toBeUndefined();
	});

	it("selectors throw outside a provider", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		expect(() => renderHook(() => useRound("round1"))).toThrow(
			/BracketProvider/,
		);
	});
});

describe("useHeat memoization", () => {
	it("returns the same object while round and heat keep their references", () => {
		const value = controller();
		const { result, rerender } = renderHook(() => useHeat("heat1"), {
			wrapper: wrapperFor(value),
		});
		const first = result.current;
		rerender();
		expect(result.current).toBe(first);
	});
});
