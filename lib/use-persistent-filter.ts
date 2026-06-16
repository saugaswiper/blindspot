/**
 * NEW-11: Source Filter Persistence Hook
 *
 * Persists the active source filter selection in localStorage so that when
 * users switch tabs and return to the Reviews tab, their filter choice is restored.
 *
 * This improves UX by preventing the filter from resetting on tab switches.
 *
 * @param resultId - The search result ID (for localStorage key uniqueness)
 * @returns [activeSource, setActiveSource] - filtered source state
 */

import { useState, useEffect, useRef } from "react";

export function usePersistentSourceFilter(resultId: string): [string | null, (source: string | null) => void] {
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const isInitializedRef = useRef(false);

  // Load from localStorage on mount.
  // We use a ref to ensure we only load once, preventing double-initialization
  // in React 18+ strict mode. This is the recommended pattern for hydrating
  // from external storage like localStorage. The setState in the effect is intentional.
  useEffect(() => {
    if (isInitializedRef.current || typeof window === "undefined") return;

    try {
      const storageKey = `blindspot-reviews-filter-${resultId}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setActiveSource(saved === "null" ? null : saved);
      }
    } catch (e) {
      // localStorage might be blocked in private mode, etc.
      console.debug("Failed to load filter from localStorage:", e);
    }

    isInitializedRef.current = true;
  }, [resultId]);

  // Save to localStorage when activeSource changes
  useEffect(() => {
    if (!isInitializedRef.current || typeof window === "undefined") return;

    try {
      const storageKey = `blindspot-reviews-filter-${resultId}`;
      if (activeSource === null) {
        localStorage.setItem(storageKey, "null");
      } else {
        localStorage.setItem(storageKey, activeSource);
      }
    } catch (e) {
      console.debug("Failed to save filter to localStorage:", e);
    }
  }, [activeSource, resultId]);

  return [activeSource, setActiveSource];
}
