import { useState, useEffect, useRef } from "react";

/**
 * Custom React hook for persisting the user's selected minimum publication year
 * across search sessions using browser localStorage.
 *
 * Unlike the per-result source filter, year preference is global — researchers
 * typically prefer a consistent cutoff across multiple searches (e.g., "only
 * papers since 2020"). This hook remembers that preference.
 *
 * @returns [minYear, setMinYear] — tuple matching React's useState API
 *   - minYear: number | undefined (undefined = "All time")
 *   - setMinYear: function to update the year preference
 *
 * Storage:
 * - Key: 'blindspot-preferred-minYear'
 * - Value: plain number string (e.g., "2020") or removed if undefined
 *
 * React 18+ Strict Mode:
 * - useRef guard prevents double-initialization in development
 * - Separate useEffect for save prevents race conditions
 *
 * Error Handling:
 * - Private browsing mode and full storage fall back gracefully
 * - Hook continues working with in-memory state if localStorage unavailable
 */
export function usePersistentYearFilter(): [number | undefined, (year: number | undefined) => void] {
  const [minYear, setMinYear] = useState<number | undefined>(undefined);
  const hasInitializedRef = useRef(false);
  const storageKey = "blindspot-preferred-minYear";

  // Load from localStorage on mount (guarded by ref to prevent double-initialization in strict mode)
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const year = parseInt(saved, 10);
        // Sanity check: year should be positive and reasonable (1900-2999)
        if (!isNaN(year) && year >= 1900 && year <= 2999) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setMinYear(year);
        }
      }
    } catch {
      // Private browsing or localStorage disabled — silently fall back to in-memory state
    }
  }, []);

  // Save to localStorage when state changes
  useEffect(() => {
    try {
      if (minYear === undefined || minYear === null) {
        localStorage.removeItem(storageKey);
      } else {
        localStorage.setItem(storageKey, String(minYear));
      }
    } catch {
      // Silently fail if localStorage unavailable (quota exceeded, private mode, etc.)
    }
  }, [minYear]);

  return [minYear, setMinYear];
}
