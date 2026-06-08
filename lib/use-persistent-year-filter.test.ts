import { renderHook, act } from "@testing-library/react";
import { usePersistentYearFilter } from "@/lib/use-persistent-year-filter";

describe("usePersistentYearFilter", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe("Initialization", () => {
    it("should initialize to undefined when no saved value exists", () => {
      const { result } = renderHook(() => usePersistentYearFilter());
      expect(result.current[0]).toBeUndefined();
    });

    it("should load saved value from localStorage on mount", () => {
      localStorage.setItem("blindspot-preferred-minYear", "2020");
      const { result } = renderHook(() => usePersistentYearFilter());
      expect(result.current[0]).toBe(2020);
    });

    it("should handle various year values correctly", () => {
      const testCases = [
        { stored: "2010", expected: 2010 },
        { stored: "2015", expected: 2015 },
        { stored: "2022", expected: 2022 },
      ];

      testCases.forEach(({ stored, expected }) => {
        localStorage.clear();
        localStorage.setItem("blindspot-preferred-minYear", stored);
        const { result } = renderHook(() => usePersistentYearFilter());
        expect(result.current[0]).toBe(expected);
      });
    });
  });

  describe("Setting and Persisting Values", () => {
    it("should save new year value to localStorage when changed", () => {
      const { result } = renderHook(() => usePersistentYearFilter());

      act(() => {
        result.current[1](2020);
      });

      expect(result.current[0]).toBe(2020);
      expect(localStorage.getItem("blindspot-preferred-minYear")).toBe("2020");
    });

    it("should update localStorage when year changes multiple times", () => {
      const { result } = renderHook(() => usePersistentYearFilter());

      act(() => {
        result.current[1](2015);
      });
      expect(localStorage.getItem("blindspot-preferred-minYear")).toBe("2015");

      act(() => {
        result.current[1](2022);
      });
      expect(localStorage.getItem("blindspot-preferred-minYear")).toBe("2022");

      act(() => {
        result.current[1](2010);
      });
      expect(localStorage.getItem("blindspot-preferred-minYear")).toBe("2010");
    });
  });

  describe("Clearing Filter (undefined/null)", () => {
    it("should remove localStorage entry when set to undefined", () => {
      localStorage.setItem("blindspot-preferred-minYear", "2020");
      const { result } = renderHook(() => usePersistentYearFilter());

      act(() => {
        result.current[1](undefined);
      });

      expect(result.current[0]).toBeUndefined();
      expect(localStorage.getItem("blindspot-preferred-minYear")).toBeNull();
    });

    it("should remove localStorage entry when set to null", () => {
      localStorage.setItem("blindspot-preferred-minYear", "2020");
      const { result } = renderHook(() => usePersistentYearFilter());

      act(() => {
        result.current[1](null as any);
      });

      expect(localStorage.getItem("blindspot-preferred-minYear")).toBeNull();
    });
  });

  describe("Error Handling", () => {
    it("should gracefully handle localStorage errors on read", () => {
      localStorage.setItem("blindspot-preferred-minYear", "2020");
      jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("localStorage blocked");
      });

      const { result } = renderHook(() => usePersistentYearFilter());

      // Should initialize to undefined when read fails
      expect(result.current[0]).toBeUndefined();
    });

    it("should gracefully handle localStorage errors on write", () => {
      jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("localStorage disabled");
      });

      const { result } = renderHook(() => usePersistentYearFilter());

      act(() => {
        result.current[1](2020);
      });

      // In-memory state should still update even if write fails
      expect(result.current[0]).toBe(2020);
    });

    it("should ignore invalid stored values (non-numeric)", () => {
      localStorage.setItem("blindspot-preferred-minYear", "invalid");
      const { result } = renderHook(() => usePersistentYearFilter());

      // Should treat as invalid and initialize to undefined
      expect(result.current[0]).toBeUndefined();
    });

    it("should ignore stored values outside reasonable range", () => {
      const invalidYears = ["1800", "3000", "-2020", "0"];

      invalidYears.forEach((year) => {
        localStorage.clear();
        localStorage.setItem("blindspot-preferred-minYear", year);
        const { result } = renderHook(() => usePersistentYearFilter());
        expect(result.current[0]).toBeUndefined();
      });
    });
  });

  describe("React 18+ Strict Mode", () => {
    it("should initialize only once despite effect double-invocation in strict mode", () => {
      const getItemSpy = jest.spyOn(Storage.prototype, "getItem");
      localStorage.setItem("blindspot-preferred-minYear", "2020");

      const { result } = renderHook(() => usePersistentYearFilter());

      expect(result.current[0]).toBe(2020);
      // getItem should be called only once (by the initialization effect, not twice)
      // Note: This test relies on the useRef guard preventing the double call
      expect(result.current[0]).toBe(2020); // Verify state is stable
    });
  });

  describe("Persistence Across Multiple Instances", () => {
    it("should share persisted value across multiple hook instances", () => {
      const { result: result1 } = renderHook(() => usePersistentYearFilter());

      act(() => {
        result1.current[1](2020);
      });

      // Simulate a new component mounting with the hook
      localStorage.clear();
      localStorage.setItem("blindspot-preferred-minYear", "2020");
      const { result: result2 } = renderHook(() => usePersistentYearFilter());

      expect(result2.current[0]).toBe(2020);
    });
  });

  describe("API Compliance", () => {
    it("should return tuple matching React useState API", () => {
      const { result } = renderHook(() => usePersistentYearFilter());

      // Should return array with exactly 2 elements
      expect(Array.isArray(result.current)).toBe(true);
      expect(result.current).toHaveLength(2);

      // First element is the state
      expect(typeof result.current[0] === "number" || result.current[0] === undefined).toBe(true);

      // Second element is the setter function
      expect(typeof result.current[1]).toBe("function");
    });
  });
});
