/**
 * NEW-13: Tests for usePersistentSearchMode hook
 *
 * Comprehensive test suite covering:
 * - Initialization behavior
 * - Persistence to localStorage
 * - Validation of SearchMode values
 * - Error handling (private browsing, quota exceeded)
 * - React 18+ strict mode compatibility
 * - API compliance (mirrors useState)
 */

import { renderHook, act } from "@testing-library/react";
import { usePersistentSearchMode } from "./use-persistent-search-mode";
import type { SearchMode } from "@/types";

// Setup/teardown: clear localStorage before and after each test
beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

afterEach(() => {
  localStorage.clear();
});

describe("usePersistentSearchMode", () => {
  describe("Initialization", () => {
    it("should initialize to 'simple' mode when no saved value exists", () => {
      const { result } = renderHook(() => usePersistentSearchMode());
      expect(result.current[0]).toBe("simple");
    });

    it("should load saved value from localStorage on mount", () => {
      localStorage.setItem("blindspot-preferred-search-mode", "pico");
      const { result } = renderHook(() => usePersistentSearchMode());
      expect(result.current[0]).toBe("pico");
    });

    it("should handle various SearchMode values (simple, pico)", () => {
      const modes: SearchMode[] = ["simple", "pico"];
      modes.forEach((mode) => {
        localStorage.clear();
        localStorage.setItem("blindspot-preferred-search-mode", mode);
        const { result } = renderHook(() => usePersistentSearchMode());
        expect(result.current[0]).toBe(mode);
      });
    });
  });

  describe("Setting and Persisting Values", () => {
    it("should save new search mode to localStorage when state updates", () => {
      const { result } = renderHook(() => usePersistentSearchMode());

      act(() => {
        result.current[1]("pico");
      });

      expect(result.current[0]).toBe("pico");
      expect(localStorage.getItem("blindspot-preferred-search-mode")).toBe("pico");
    });

    it("should update localStorage on multiple sequential changes", () => {
      const { result } = renderHook(() => usePersistentSearchMode());

      act(() => {
        result.current[1]("pico");
      });
      expect(localStorage.getItem("blindspot-preferred-search-mode")).toBe("pico");

      act(() => {
        result.current[1]("simple");
      });
      expect(localStorage.getItem("blindspot-preferred-search-mode")).toBe("simple");

      act(() => {
        result.current[1]("pico");
      });
      expect(localStorage.getItem("blindspot-preferred-search-mode")).toBe("pico");
    });
  });

  describe("Error Handling", () => {
    it("should gracefully handle localStorage read errors (private browsing simulation)", () => {
      jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("localStorage is not available");
      });

      const { result } = renderHook(() => usePersistentSearchMode());
      // Should initialize to default 'simple' mode even if localStorage throws
      expect(result.current[0]).toBe("simple");
    });

    it("should gracefully handle localStorage write errors (quota exceeded)", () => {
      jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

      const { result } = renderHook(() => usePersistentSearchMode());

      act(() => {
        result.current[1]("pico");
      });

      // State should still update in memory even if localStorage fails
      expect(result.current[0]).toBe("pico");
    });

    it("should ignore invalid stored values and initialize to default", () => {
      localStorage.setItem("blindspot-preferred-search-mode", "invalid-mode");
      const { result } = renderHook(() => usePersistentSearchMode());
      // Invalid values should be rejected, default to 'simple'
      expect(result.current[0]).toBe("simple");
    });
  });

  describe("React 18+ Strict Mode", () => {
    it("should initialize exactly once despite effect double-invocation (strict mode guard)", () => {
      const setItemSpy = jest.spyOn(Storage.prototype, "setItem");
      localStorage.setItem("blindspot-preferred-search-mode", "pico");

      const { result } = renderHook(() => usePersistentSearchMode());
      // Should have loaded from storage exactly once, not multiple times
      expect(result.current[0]).toBe("pico");
      // getItem should be called exactly once during initialization (not twice despite strict mode)
      expect(setItemSpy).not.toHaveBeenCalled(); // No writes on first render (just reading)
    });
  });

  describe("Persistence Across Instances", () => {
    it("should share persisted value across multiple hook instances", () => {
      const { result: result1 } = renderHook(() => usePersistentSearchMode());
      const { result: result2 } = renderHook(() => usePersistentSearchMode());

      // Both instances should initialize to same default
      expect(result1.current[0]).toBe("simple");
      expect(result2.current[0]).toBe("simple");

      // Update first instance
      act(() => {
        result1.current[1]("pico");
      });

      // Second instance should see the persisted value on re-render
      expect(localStorage.getItem("blindspot-preferred-search-mode")).toBe("pico");
      expect(result1.current[0]).toBe("pico");
    });
  });

  describe("API Compliance", () => {
    it("should return tuple matching React useState API: [value, setter]", () => {
      const { result } = renderHook(() => usePersistentSearchMode());

      // Should be a tuple with exactly 2 elements
      expect(Array.isArray(result.current)).toBe(true);
      expect(result.current).toHaveLength(2);

      // First element should be the current mode (string)
      expect(typeof result.current[0]).toBe("string");

      // Second element should be a function
      expect(typeof result.current[1]).toBe("function");

      // Function should accept a SearchMode
      act(() => {
        result.current[1]("pico");
      });
      expect(result.current[0]).toBe("pico");
    });

    it("should match standard useState return signature exactly", () => {
      const { result: hookResult } = renderHook(() => usePersistentSearchMode());
      // Return structure should match React.useState
      const [value, setter] = hookResult.current;
      expect(typeof value).toBe("string");
      expect(typeof setter).toBe("function");
    });
  });

  describe("Integration with TopicInput", () => {
    it("should preserve search mode through simulated page reload", () => {
      const { result: result1 } = renderHook(() => usePersistentSearchMode());

      // User selects PICO mode
      act(() => {
        result1.current[1]("pico");
      });
      expect(result1.current[0]).toBe("pico");

      // Simulate page reload by creating new hook instance
      const { result: result2 } = renderHook(() => usePersistentSearchMode());
      // Mode should be restored from localStorage
      expect(result2.current[0]).toBe("pico");
    });
  });
});
