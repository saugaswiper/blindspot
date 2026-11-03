/**
 * Pure helpers for the screening workbench keyboard speed mode (brief 014).
 * Kept out of the component so scoping and announcement rules are unit-testable.
 */

export type Verdict = "include" | "exclude" | "uncertain";

export type SpeedModeKey =
  | { kind: "move"; delta: 1 | -1 }
  | { kind: "verdict"; verdict: Verdict }
  | { kind: "reasoning" }
  | { kind: "escape" };

const VERDICT_KEYS: Record<string, Verdict> = { y: "include", n: "exclude", u: "uncertain" };

/** Map a key to a speed-mode action, or null if it is not one of ours. */
export function parseSpeedModeKey(key: string): SpeedModeKey | null {
  if (key === "j" || key === "ArrowDown") return { kind: "move", delta: 1 };
  if (key === "k" || key === "ArrowUp") return { kind: "move", delta: -1 };
  if (key === "r") return { kind: "reasoning" };
  if (key === "Escape") return { kind: "escape" };
  const verdict = VERDICT_KEYS[key];
  return verdict ? { kind: "verdict", verdict } : null;
}

/**
 * Scope rule: keys act only when focus is inside the panel's results region,
 * or on document.body while a row is already active. Anywhere else the page
 * keeps its native behaviour (scrolling) and we must not preventDefault.
 */
export function isKeyInScope(opts: {
  insideRegion: boolean;
  targetIsBody: boolean;
  hasActiveRow: boolean;
}): boolean {
  return opts.insideRegion || (opts.targetIsBody && opts.hasActiveRow);
}

/** Next verdict when a key/button is pressed: pressing the current one clears it. */
export function toggleVerdict(current: Verdict | null | undefined, pressed: Verdict): Verdict | null {
  return current === pressed ? null : pressed;
}

const VERDICT_LABEL: Record<Verdict, string> = {
  include: "Include",
  exclude: "Exclude",
  uncertain: "Uncertain",
};

/** One status message per verdict action, e.g. "Row 12 of 3,042: Include recorded". */
export function announceVerdict(position: number, total: number, verdict: Verdict | null): string {
  const where = `Row ${position.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`;
  return verdict ? `${where}: ${VERDICT_LABEL[verdict]} recorded` : `${where}: human decision cleared`;
}
