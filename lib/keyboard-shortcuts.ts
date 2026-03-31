// ---------------------------------------------------------------------------
// Keyboard shortcuts: pure-function helpers + shortcut definitions
// ---------------------------------------------------------------------------

/**
 * A single keyboard shortcut definition.
 */
export interface KeyboardShortcut {
  /** The key to match (lowercase). E.g. "1", "d", "?". */
  key: string;
  /** Human-readable description of what the shortcut does. */
  description: string;
  /** Optional display label override (e.g. "1–4" for a range). */
  displayKey?: string;
  /** Category for grouping in the help overlay. */
  category: "navigation" | "actions" | "help";
}

/**
 * All shortcuts available on the Results page.
 * This is the canonical source of truth rendered in the help overlay.
 */
export const RESULT_SHORTCUTS: KeyboardShortcut[] = [
  // Navigation
  {
    key: "1",
    description: "Switch to Existing Reviews tab",
    category: "navigation",
  },
  {
    key: "2",
    description: "Switch to Gap Analysis tab",
    category: "navigation",
  },
  {
    key: "3",
    description: "Switch to Study Design tab",
    category: "navigation",
  },
  {
    key: "4",
    description: "Switch to PRISMA Flow tab",
    category: "navigation",
  },
  // Actions
  {
    key: "r",
    description: "Run AI gap analysis",
    category: "actions",
  },
  {
    key: "d",
    description: "Download PDF report",
    category: "actions",
  },
  {
    key: "s",
    description: "Toggle sharing (owners only)",
    category: "actions",
  },
  // Help
  {
    key: "?",
    description: "Show / hide this keyboard shortcuts panel",
    category: "help",
  },
];

/**
 * Returns the `KeyboardShortcut` whose `key` matches the provided value
 * (case-insensitive), or `null` if none is found.
 */
export function getShortcutByKey(key: string): KeyboardShortcut | null {
  const normalized = key.toLowerCase();
  return RESULT_SHORTCUTS.find((s) => s.key === normalized) ?? null;
}

/**
 * Returns all shortcuts in a given category.
 */
export function getShortcutsByCategory(
  category: KeyboardShortcut["category"]
): KeyboardShortcut[] {
  return RESULT_SHORTCUTS.filter((s) => s.category === category);
}

/**
 * Returns `true` if a keyboard event should be ignored because the user
 * appears to be typing in a form field (input, textarea, select, or a
 * contenteditable element).
 *
 * This prevents accidental shortcut triggers while the user fills in a
 * form. Pure function — accepts a minimal duck-type subset so it is easy
 * to unit-test without a real DOM event.
 */
export function shouldIgnoreKeyEvent(event: {
  target: { tagName?: string; isContentEditable?: boolean } | null;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}): boolean {
  if (!event.target) return false;

  // Ignore when a modifier key (Cmd / Ctrl / Alt) is held — those are
  // browser or OS shortcuts and we don't want to interfere.
  if (event.metaKey || event.ctrlKey || event.altKey) return true;

  const tag = (event.target.tagName ?? "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (event.target.isContentEditable) return true;

  return false;
}

/**
 * Returns the display label for a shortcut key.
 * Falls back to the `key` field if `displayKey` is not set.
 */
export function getDisplayKey(shortcut: KeyboardShortcut): string {
  return shortcut.displayKey ?? shortcut.key.toUpperCase();
}

// ---------------------------------------------------------------------------
// Shortcuts discovery tooltip — localStorage persistence
// ---------------------------------------------------------------------------

/**
 * localStorage key used to track whether the one-time shortcuts discovery
 * tooltip has been shown to the current browser.  Versioned so a redesigned
 * tooltip can re-show by bumping the version suffix.
 */
export const SHORTCUTS_TOOLTIP_STORAGE_KEY = "blindspot_shortcuts_tooltip_v1_seen";

/**
 * Returns true if the shortcuts discovery tooltip has already been shown
 * (and dismissed, or auto-expired) in this browser.
 * Must be called client-side — returns false in SSR / Node context.
 */
export function hasShortcutsTooltipBeenSeen(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SHORTCUTS_TOOLTIP_STORAGE_KEY) === "true";
}

/**
 * Persists that the shortcuts tooltip has been seen so it will not
 * auto-show again on subsequent page loads.
 * Must be called client-side — no-ops in SSR / Node context.
 */
export function markShortcutsTooltipAsSeen(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SHORTCUTS_TOOLTIP_STORAGE_KEY, "true");
}
