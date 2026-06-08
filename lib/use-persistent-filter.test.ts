/**
 * Tests for usePersistentSourceFilter hook
 *
 * NEW-11: Tests localStorage persistence of source filter
 */

import { renderHook, act } from "@testing-library/react";
import { usePersistentSourceFilter } from "./use-persistent-filter";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("usePersistentSourceFilter", () => {
  const resultId = "test-result-123";
  const storageKey = `blindspot-reviews-filter-${resultId}`;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("should initialize with null when localStorage is empty", () => {
    const { result } = renderHook(() => usePersistentSourceFilter(resultId));
    expect(result.current[0]).toBeNull();
  });

  it("should load saved source from localStorage on mount", () => {
    localStorage.setItem(storageKey, "PubMed");
    const { result } = renderHook(() => usePersistentSourceFilter(resultId));
    expect(result.current[0]).toBe("PubMed");
  });

  it("should save source to localStorage when set", () => {
    const { result } = renderHook(() => usePersistentSourceFilter(resultId));

    act(() => {
      result.current[1]("Cochrane");
    });

    expect(localStorage.getItem(storageKey)).toBe("Cochrane");
    expect(result.current[0]).toBe("Cochrane");
  });

  it("should handle clearing filter (setting to null)", () => {
    localStorage.setItem(storageKey, "OpenAlex");
    const { result } = renderHook(() => usePersistentSourceFilter(resultId));

    expect(result.current[0]).toBe("OpenAlex");

    act(() => {
      result.current[1](null);
    });

    expect(result.current[0]).toBeNull();
    expect(localStorage.getItem(storageKey)).toBe("null");
  });

  it("should handle switching between filters", () => {
    const { result } = renderHook(() => usePersistentSourceFilter(resultId));

    act(() => {
      result.current[1]("PubMed");
    });
    expect(localStorage.getItem(storageKey)).toBe("PubMed");

    act(() => {
      result.current[1]("Scopus");
    });
    expect(localStorage.getItem(storageKey)).toBe("Scopus");
    expect(result.current[0]).toBe("Scopus");
  });

  it("should use unique storage keys for different result IDs", () => {
    const resultId1 = "result-1";
    const resultId2 = "result-2";

    const { result: result1 } = renderHook(() => usePersistentSourceFilter(resultId1));
    const { result: result2 } = renderHook(() => usePersistentSourceFilter(resultId2));

    act(() => {
      result1.current[1]("PubMed");
    });

    act(() => {
      result2.current[1]("Cochrane");
    });

    expect(localStorage.getItem(`blindspot-reviews-filter-${resultId1}`)).toBe("PubMed");
    expect(localStorage.getItem(`blindspot-reviews-filter-${resultId2}`)).toBe("Cochrane");
  });

  it("should gracefully handle localStorage errors (private mode)", () => {
    const consoleDebugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const setItemSpy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    const { result } = renderHook(() => usePersistentSourceFilter(resultId));

    act(() => {
      result.current[1]("PubMed");
    });

    expect(consoleDebugSpy).toHaveBeenCalled();
    expect(result.current[0]).toBe("PubMed"); // State should still update even if storage fails

    setItemSpy.mockRestore();
    consoleDebugSpy.mockRestore();
  });
});
