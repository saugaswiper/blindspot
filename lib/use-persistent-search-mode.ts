/**
 * NEW-13: Persistent Search Mode Preference
 *
 * Researchers often prefer either "Simple" or "PICO" mode consistently across searches.
 * This hook persists the user's mode selection to localStorage so it's restored
 * across sessions and page reloads.
 *
 * Implementation follows the same pattern as usePersistentYearFilter (handoff 074):
 * - Global storage key: `blindspot-preferred-search-mode`
 * - Graceful error handling for private browsing / localStorage unavailable
 * - React 18+ strict mode compatible with useRef guard
 * - Full TypeScript type safety
 */

import { useState, useEffect, useRef } from "react";
import type { SearchMode } from "@/types";

/**
 * Custom hook for persistent search mode preference.
 *
 * @returns tuple: [mode, setMode] — mirrors React useState API
 *         mode: "simple" | "pico" (defaults to "simple")
 *         setMode: function to update the mode preference
 */
export function usePersistentSearchMode(): [SearchMode, (mode: SearchMode) => void] {
  const [mode, setMode] = useState<SearchMode>("simple");
  const hasInitializedRef = useRef(false);
  const storageKey = "blindspot-preferred-search-mode";

  // Load from localStorage on mount (guarded by ref to prevent strict mode double-init)
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && (saved === "simple" || saved === "pico")) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMode(saved as SearchMode);
      }
    } catch {
      // Private browsing or localStorage disabled — silently fall back to in-memory state
    }
  }, []);

  // Save to localStorage when state changes
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, mode);
    } catch {
      // Silently fail if localStorage unavailable (quota exceeded, etc.)
    }
  }, [mode]);

  return [mode, setMode];
}
