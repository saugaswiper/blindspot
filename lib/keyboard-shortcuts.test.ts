/**
 * keyboard-shortcuts.test.ts
 *
 * Unit tests for the keyboard-shortcuts utility.
 * Pure-function tests — no DOM, no React, no network dependencies.
 */

import { describe, it, expect } from "vitest";
import {
  RESULT_SHORTCUTS,
  SHORTCUTS_TOOLTIP_STORAGE_KEY,
  getShortcutByKey,
  getShortcutsByCategory,
  shouldIgnoreKeyEvent,
  getDisplayKey,
  hasShortcutsTooltipBeenSeen,
  markShortcutsTooltipAsSeen,
} from "./keyboard-shortcuts";
import type { KeyboardShortcut } from "./keyboard-shortcuts";

/* ------------------------------------------------------------------ */
/* RESULT_SHORTCUTS                                                    */
/* ------------------------------------------------------------------ */

describe("RESULT_SHORTCUTS", () => {
  it("is a non-empty array", () => {
    expect(RESULT_SHORTCUTS.length).toBeGreaterThan(0);
  });

  it("every shortcut has a non-empty key", () => {
    for (const s of RESULT_SHORTCUTS) {
      expect(s.key.length).toBeGreaterThan(0);
    }
  });

  it("every shortcut has a non-empty description", () => {
    for (const s of RESULT_SHORTCUTS) {
      expect(s.description.length).toBeGreaterThan(0);
    }
  });

  it("every shortcut has a valid category", () => {
    const valid = new Set<KeyboardShortcut["category"]>(["navigation", "actions", "help"]);
    for (const s of RESULT_SHORTCUTS) {
      expect(valid.has(s.category)).toBe(true);
    }
  });

  it("all shortcut keys are lowercase", () => {
    for (const s of RESULT_SHORTCUTS) {
      expect(s.key).toBe(s.key.toLowerCase());
    }
  });

  it("tab shortcuts 1–4 exist for navigation", () => {
    const navKeys = RESULT_SHORTCUTS.filter((s) => s.category === "navigation").map((s) => s.key);
    expect(navKeys).toContain("1");
    expect(navKeys).toContain("2");
    expect(navKeys).toContain("3");
    expect(navKeys).toContain("4");
  });

  it("action shortcuts r, d, s exist", () => {
    const actionKeys = RESULT_SHORTCUTS.filter((s) => s.category === "actions").map((s) => s.key);
    expect(actionKeys).toContain("r");
    expect(actionKeys).toContain("d");
    expect(actionKeys).toContain("s");
  });

  it("help shortcut ? exists", () => {
    const helpKeys = RESULT_SHORTCUTS.filter((s) => s.category === "help").map((s) => s.key);
    expect(helpKeys).toContain("?");
  });

  it("no duplicate keys", () => {
    const keys = RESULT_SHORTCUTS.map((s) => s.key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });
});

/* ------------------------------------------------------------------ */
/* getShortcutByKey                                                    */
/* ------------------------------------------------------------------ */

describe("getShortcutByKey", () => {
  it("returns correct shortcut for key '1'", () => {
    const s = getShortcutByKey("1");
    expect(s).not.toBeNull();
    expect(s!.key).toBe("1");
    expect(s!.category).toBe("navigation");
  });

  it("returns correct shortcut for key 'r'", () => {
    const s = getShortcutByKey("r");
    expect(s).not.toBeNull();
    expect(s!.key).toBe("r");
  });

  it("is case-insensitive — 'R' finds the 'r' shortcut", () => {
    const s = getShortcutByKey("R");
    expect(s).not.toBeNull();
    expect(s!.key).toBe("r");
  });

  it("returns null for unknown key", () => {
    expect(getShortcutByKey("z")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(getShortcutByKey("")).toBeNull();
  });

  it("returns correct shortcut for '?'", () => {
    const s = getShortcutByKey("?");
    expect(s).not.toBeNull();
    expect(s!.category).toBe("help");
  });

  it("returns correct shortcut for 'D' (uppercase)", () => {
    const s = getShortcutByKey("D");
    expect(s).not.toBeNull();
    expect(s!.key).toBe("d");
  });
});

/* ------------------------------------------------------------------ */
/* getShortcutsByCategory                                              */
/* ------------------------------------------------------------------ */

describe("getShortcutsByCategory", () => {
  it("returns only navigation shortcuts", () => {
    const navShortcuts = getShortcutsByCategory("navigation");
    expect(navShortcuts.length).toBeGreaterThan(0);
    for (const s of navShortcuts) {
      expect(s.category).toBe("navigation");
    }
  });

  it("returns only action shortcuts", () => {
    const actionShortcuts = getShortcutsByCategory("actions");
    expect(actionShortcuts.length).toBeGreaterThan(0);
    for (const s of actionShortcuts) {
      expect(s.category).toBe("actions");
    }
  });

  it("returns only help shortcuts", () => {
    const helpShortcuts = getShortcutsByCategory("help");
    expect(helpShortcuts.length).toBeGreaterThan(0);
    for (const s of helpShortcuts) {
      expect(s.category).toBe("help");
    }
  });

  it("navigation + actions + help covers all shortcuts", () => {
    const nav = getShortcutsByCategory("navigation");
    const act = getShortcutsByCategory("actions");
    const hlp = getShortcutsByCategory("help");
    expect(nav.length + act.length + hlp.length).toBe(RESULT_SHORTCUTS.length);
  });
});

/* ------------------------------------------------------------------ */
/* shouldIgnoreKeyEvent                                                */
/* ------------------------------------------------------------------ */

describe("shouldIgnoreKeyEvent", () => {
  function makeEvent(
    tagName: string,
    mods: { metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean } = {},
    isContentEditable = false
  ) {
    return {
      target: { tagName, isContentEditable },
      metaKey: mods.metaKey ?? false,
      ctrlKey: mods.ctrlKey ?? false,
      altKey: mods.altKey ?? false,
    };
  }

  it("returns true for INPUT element", () => {
    expect(shouldIgnoreKeyEvent(makeEvent("INPUT"))).toBe(true);
  });

  it("returns true for TEXTAREA element", () => {
    expect(shouldIgnoreKeyEvent(makeEvent("TEXTAREA"))).toBe(true);
  });

  it("returns true for SELECT element", () => {
    expect(shouldIgnoreKeyEvent(makeEvent("SELECT"))).toBe(true);
  });

  it("returns true for contentEditable element", () => {
    expect(shouldIgnoreKeyEvent(makeEvent("DIV", {}, true))).toBe(true);
  });

  it("returns false for DIV element (not contentEditable)", () => {
    expect(shouldIgnoreKeyEvent(makeEvent("DIV"))).toBe(false);
  });

  it("returns false for BUTTON element", () => {
    expect(shouldIgnoreKeyEvent(makeEvent("BUTTON"))).toBe(false);
  });

  it("returns true when metaKey is held", () => {
    expect(shouldIgnoreKeyEvent(makeEvent("BODY", { metaKey: true }))).toBe(true);
  });

  it("returns true when ctrlKey is held", () => {
    expect(shouldIgnoreKeyEvent(makeEvent("BODY", { ctrlKey: true }))).toBe(true);
  });

  it("returns true when altKey is held", () => {
    expect(shouldIgnoreKeyEvent(makeEvent("BODY", { altKey: true }))).toBe(true);
  });

  it("returns false when no modifier and target is BODY", () => {
    expect(shouldIgnoreKeyEvent(makeEvent("BODY"))).toBe(false);
  });

  it("returns false when target is null", () => {
    expect(
      shouldIgnoreKeyEvent({ target: null, metaKey: false, ctrlKey: false, altKey: false })
    ).toBe(false);
  });

  it("is case-insensitive for tagName (lowercase 'input')", () => {
    // Browsers always return uppercase tagName, but we normalise defensively
    expect(shouldIgnoreKeyEvent(makeEvent("input"))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* getDisplayKey                                                       */
/* ------------------------------------------------------------------ */

describe("getDisplayKey", () => {
  it("returns uppercase key when displayKey is not set", () => {
    const s: KeyboardShortcut = { key: "r", description: "Run", category: "actions" };
    expect(getDisplayKey(s)).toBe("R");
  });

  it("returns displayKey when it is explicitly set", () => {
    const s: KeyboardShortcut = {
      key: "1",
      description: "Tab 1",
      displayKey: "1–4",
      category: "navigation",
    };
    expect(getDisplayKey(s)).toBe("1–4");
  });

  it("returns uppercase for '?' key", () => {
    const s: KeyboardShortcut = { key: "?", description: "Help", category: "help" };
    // "?".toUpperCase() === "?" — verifying it doesn't break
    expect(getDisplayKey(s)).toBe("?");
  });
});

/* ------------------------------------------------------------------ */
/* SHORTCUTS_TOOLTIP_STORAGE_KEY                                        */
/* ------------------------------------------------------------------ */

describe("SHORTCUTS_TOOLTIP_STORAGE_KEY", () => {
  it("is a non-empty string", () => {
    expect(typeof SHORTCUTS_TOOLTIP_STORAGE_KEY).toBe("string");
    expect(SHORTCUTS_TOOLTIP_STORAGE_KEY.trim().length).toBeGreaterThan(0);
  });

  it("contains a version suffix so future redesigns can show again", () => {
    expect(SHORTCUTS_TOOLTIP_STORAGE_KEY).toMatch(/v\d/);
  });

  it("starts with the blindspot namespace prefix", () => {
    expect(SHORTCUTS_TOOLTIP_STORAGE_KEY.startsWith("blindspot_")).toBe(true);
  });

  it("differs from the tour storage key to avoid collisions", () => {
    // Ensure these two keys are distinct
    expect(SHORTCUTS_TOOLTIP_STORAGE_KEY).not.toBe("blindspot_tour_v1_seen");
  });
});

/* ------------------------------------------------------------------ */
/* hasShortcutsTooltipBeenSeen / markShortcutsTooltipAsSeen           */
/* (Node/SSR fallback behaviour — no browser window available)        */
/* ------------------------------------------------------------------ */

describe("localStorage tooltip helpers (Node/SSR fallback behaviour)", () => {
  it("hasShortcutsTooltipBeenSeen returns false in SSR/Node context (no window)", () => {
    // In the Node test environment window is undefined, so this always returns false
    expect(hasShortcutsTooltipBeenSeen()).toBe(false);
  });

  it("markShortcutsTooltipAsSeen does not throw in SSR/Node context", () => {
    expect(() => markShortcutsTooltipAsSeen()).not.toThrow();
  });

  it("hasShortcutsTooltipBeenSeen still returns false after markShortcutsTooltipAsSeen in SSR context", () => {
    // markShortcutsTooltipAsSeen no-ops when window is undefined, so seen stays false
    markShortcutsTooltipAsSeen();
    expect(hasShortcutsTooltipBeenSeen()).toBe(false);
  });
});
