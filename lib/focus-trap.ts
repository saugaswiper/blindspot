/**
 * focus-trap.ts
 *
 * Utilities for trapping keyboard focus inside modal dialogs.
 *
 * WCAG 2.1 Success Criterion 2.4.3 (Focus Order, Level AA) requires that
 * when a modal dialog is open, keyboard focus must stay within the dialog
 * until the dialog is closed. Without trapping, pressing Tab moves focus
 * to elements hidden behind the overlay, which is disorienting and breaks
 * the expected modal interaction model.
 *
 * This module exports:
 *   - FOCUSABLE_SELECTOR   — CSS selector matching natively-focusable elements
 *   - getNextFocusIndex    — pure cycling helper (unit-testable, no DOM)
 *   - useFocusTrap         — React hook that traps focus inside a container ref
 */

import { useEffect, type RefObject } from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * CSS selector that matches all natively keyboard-focusable elements.
 *
 * Excludes:
 * - disabled form elements (`:not([disabled])`)
 * - elements explicitly removed from the tab order (`[tabindex='-1']` is
 *   excluded because the selector only matches `[tabindex]` without that value)
 *
 * Note: `details > summary` is included because clicking a <summary> opens
 * its parent <details>, and it is keyboard-navigable.
 */
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "details > summary",
].join(", ");

// ---------------------------------------------------------------------------
// Pure helpers (no DOM — safe to unit-test in Node/vitest)
// ---------------------------------------------------------------------------

/**
 * Return the index of the next element to focus given wrap-around cycling.
 *
 * This is extracted as a pure function so it can be unit-tested without a DOM.
 *
 * @param currentIndex - Index of the currently focused element (0-based).
 *   Pass -1 when no element in the list is currently focused.
 * @param total - Total number of focusable elements in the container.
 * @param forward - `true` for Tab (forward), `false` for Shift+Tab (backward).
 * @returns The index to move focus to (always in [0, total-1]).
 */
export function getNextFocusIndex(
  currentIndex: number,
  total: number,
  forward: boolean
): number {
  if (total === 0) return 0;

  if (currentIndex === -1) {
    // Focus is outside the trap: jump to first (forward) or last (backward)
    return forward ? 0 : total - 1;
  }

  if (forward) {
    return (currentIndex + 1) % total;
  }
  return (currentIndex - 1 + total) % total;
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

/**
 * React hook: traps keyboard Tab / Shift+Tab focus within `containerRef`
 * while `enabled` is true.
 *
 * How it works:
 * - Listens for `keydown` on `document` in the **capturing phase** so it
 *   intercepts the event before other listeners.
 * - When Tab or Shift+Tab is pressed while the trap is active, it:
 *     1. Queries all focusable descendants of the container.
 *     2. Finds the currently focused element's index in that list.
 *     3. Cycles to the next/previous index (wrapping around at the ends).
 *     4. Calls `preventDefault()` and moves focus.
 * - When `enabled` becomes false the listener is automatically removed.
 *
 * Invisible elements (zero width/height with no client rects) are excluded
 * from the focusable list so that hidden navigation items or off-screen
 * elements are skipped.
 *
 * Usage:
 * ```tsx
 * const dialogRef = useRef<HTMLDivElement>(null);
 * useFocusTrap(dialogRef, isOpen);
 *
 * return isOpen ? <div ref={dialogRef} role="dialog" aria-modal="true"> ... </div> : null;
 * ```
 *
 * @param containerRef - Ref pointing to the modal container element.
 * @param enabled      - Whether the trap is active (typically: whether the modal is open).
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean
): void {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;

      const container = containerRef.current;
      if (!container) return;

      // Collect all currently-visible focusable descendants
      const all = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      );
      const focusable = all.filter((el) => {
        // Exclude elements that are not visible / rendered
        return el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;
      });

      if (focusable.length === 0) return;

      const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const nextIndex = getNextFocusIndex(activeIndex, focusable.length, !e.shiftKey);

      e.preventDefault();
      focusable[nextIndex]?.focus();
    }

    // Use the capturing phase so we intercept Tab before the browser's
    // default focus-advance behaviour and before any other handlers.
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, containerRef]);
}
