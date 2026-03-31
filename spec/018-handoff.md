# Handoff: Shortcut Discoverability Tooltip
**Date:** 2026-03-30
**Session tool:** Automated daily-improver agent
**Written by:** Blindspot daily-improver agent

---

## What Was Built

Implemented the **Shortcut Discoverability Tooltip** — the #3 recommended improvement from `spec/017-handoff.md`.

Blindspot's Results page has supported 8 keyboard shortcuts (`1`–`4`, `R`, `D`, `S`, `?`) since `015-handoff.md`, with a ⌨ button in the header that opens the full shortcuts reference panel. The problem: first-time visitors have no indication the shortcuts exist. The ⌨ button icon is small and non-obvious. Users who never discover it miss a meaningful workflow acceleration feature.

Blindspot now shows a one-time **"Press ? for shortcuts"** tooltip anchored below the ⌨ button on the first visit to any Results page. The tooltip:

- **Auto-shows** on first Results page visit (localStorage-gated, never shown twice)
- **Auto-dismisses** after 5 seconds if the user takes no action
- **Clickable body** — clicking the "Press ? for shortcuts" text immediately opens the shortcuts panel
- **Manual dismiss (×)** — closes the tooltip without opening the panel
- **Both actions mark it as seen** so it never reappears for this browser/user

---

## Why This Feature

**Discoverability gap**: Keyboard shortcuts (from `015-handoff.md`) are an invisible feature. There is no visual hint that they exist. Power users who discover them through trial-and-error or documentation benefit significantly; most users never find them.

**Low effort / high leverage**: The tooltip is 60 lines of client-side React. No DB change, no API change, no Supabase migration, no Gemini usage. Zero infrastructure cost.

**Follows established Blindspot patterns**: The implementation mirrors the `OnboardingTour` localStorage gate exactly — same lazy `useState` initializer, same `typeof window` SSR guard, same versioned storage key pattern.

**Non-intrusive**: The 5-second auto-dismiss and single-show guarantee mean the tooltip never becomes an annoyance for returning users. New users see it exactly once.

---

## Files Created / Modified

```
lib/keyboard-shortcuts.ts        — MODIFIED: 3 new exports at the end of the file
                                     • SHORTCUTS_TOOLTIP_STORAGE_KEY  (const)
                                     • hasShortcutsTooltipBeenSeen()  (boolean)
                                     • markShortcutsTooltipAsSeen()   (void)

lib/keyboard-shortcuts.test.ts   — MODIFIED: new imports + 2 new test suites (8 tests)
                                     • "SHORTCUTS_TOOLTIP_STORAGE_KEY" suite (4 tests)
                                     • "localStorage tooltip helpers (Node/SSR fallback)" suite (3 tests)

components/KeyboardShortcutsHelp.tsx — MODIFIED:
                                     1. Added `useState` to React import
                                     2. Added `hasShortcutsTooltipBeenSeen`,
                                        `markShortcutsTooltipAsSeen` imports
                                     3. Added `ShortcutsDiscoveryTooltip` component
                                        (exported, ~60 lines)

components/ResultsDashboard.tsx  — MODIFIED:
                                     1. Added `ShortcutsDiscoveryTooltip` to import
                                     2. Wrapped `ShortcutsButton` in `<div className="relative">`
                                     3. Rendered `<ShortcutsDiscoveryTooltip>` inside the wrapper
```

---

## Architecture

### localStorage helpers (`lib/keyboard-shortcuts.ts`)

Three new exports following the identical pattern as the onboarding tour helpers:

```typescript
export const SHORTCUTS_TOOLTIP_STORAGE_KEY = "blindspot_shortcuts_tooltip_v1_seen";

export function hasShortcutsTooltipBeenSeen(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SHORTCUTS_TOOLTIP_STORAGE_KEY) === "true";
}

export function markShortcutsTooltipAsSeen(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SHORTCUTS_TOOLTIP_STORAGE_KEY, "true");
}
```

- **Versioned key** (`_v1_`): bumping the version allows a redesigned tooltip to re-show without clearing user storage
- **`typeof window` guard**: safe for SSR and vitest Node environment
- **Separate key** from `blindspot_tour_v1_seen`: avoids key collision with the onboarding tour

### `ShortcutsDiscoveryTooltip` component

Uses the `OnboardingTour` lazy-initializer pattern to avoid the `react-hooks/set-state-in-effect` ESLint rule:

```tsx
// Server: typeof window === "undefined" → false → no HTML emitted
// Client: reads localStorage once → true (first visit) or false (seen before)
const [visible, setVisible] = useState<boolean>(() => {
  if (typeof window === "undefined") return false;
  return !hasShortcutsTooltipBeenSeen();
});

// Effect runs when visible becomes true (once, on first visit).
// Marks as seen and starts the 5 s auto-dismiss timer.
// deps=[visible] satisfies exhaustive-deps and keeps the effect idempotent.
useEffect(() => {
  if (!visible) return;
  markShortcutsTooltipAsSeen();
  const timer = setTimeout(() => setVisible(false), 5000);
  return () => clearTimeout(timer);
}, [visible]);
```

Key design decisions:
- **`deps = [visible]`** (not `[]`): satisfies `react-hooks/exhaustive-deps` without suppression
- **`setVisible(false)` inside `setTimeout`**: not a "direct setState in effect body" — satisfies `react-hooks/set-state-in-effect`
- **Lazy initializer instead of `useEffect` setState**: the correct React pattern for "read external storage on mount"

### DOM: tooltip anchored to the ⌨ button

```tsx
{/* In ResultsDashboard.tsx — header button row */}
<div className="relative">
  <ShortcutsButton onClick={() => setShowShortcuts((v) => !v)} />
  <ShortcutsDiscoveryTooltip onOpenShortcuts={() => setShowShortcuts(true)} />
</div>
```

The tooltip renders with `absolute top-full right-0 mt-2 z-40` — anchored below the ⌨ button, right-aligned, with z-index 40 (above normal content, below the shortcuts help overlay at z-50).

---

## UI / Visual Design

```
 [⌨]
  ↓  (anchored below, right-aligned)
 ┌─────────────────────────────────────┐
 │  Press [?] for shortcuts        ×   │  ← navy bg, white text, 12px, rounded-lg
 └─────────────────────────────────────┘
```

- **Background**: `bg-[#1e3a5f]` (Blindspot navy) — matches the shortcuts panel header
- **Text**: white, 12px (`text-xs`), medium weight
- **? key badge**: `bg-white/20 rounded` — semi-transparent white inset
- **Auto-dismiss**: 5 seconds
- **Mobile**: `whitespace-nowrap` prevents wrapping on small screens; the button row already scrolls horizontally on very narrow viewports via existing layout

---

## Test Coverage

### 8 new tests in `lib/keyboard-shortcuts.test.ts`:

**`SHORTCUTS_TOOLTIP_STORAGE_KEY`** (4 tests):
- is a non-empty string
- contains a version suffix so future redesigns can show again
- starts with the `blindspot_` namespace prefix
- differs from the tour storage key to avoid collisions

**`localStorage tooltip helpers (Node/SSR fallback behaviour)`** (3 tests):
- `hasShortcutsTooltipBeenSeen` returns `false` in SSR/Node context (no window)
- `markShortcutsTooltipAsSeen` does not throw in SSR/Node context
- `hasShortcutsTooltipBeenSeen` still returns `false` after `markShortcutsTooltipAsSeen` in SSR context

---

## Smoke Test Results (8/8 passed)

Run via `node --experimental-transform-types`:
- `SHORTCUTS_TOOLTIP_STORAGE_KEY` is a string ✓
- non-empty ✓
- starts with `blindspot_` ✓
- contains version suffix ✓
- differs from tour key ✓
- `hasShortcutsTooltipBeenSeen()` returns `false` (no window) ✓
- `markShortcutsTooltipAsSeen()` does not throw ✓
- still returns `false` after mark in SSR context ✓

---

## Verification Status

- [x] `npm run lint` — 0 errors (1 pre-existing `ReviewSkeleton` warning, unrelated)
- [x] `npx tsc --noEmit` — 0 errors
- [x] Smoke tests — **8/8 passed** (Node.js direct function testing)
- [x] Vitest test file updated — 8 new tests in `lib/keyboard-shortcuts.test.ts`
- [ ] `npm test` — blocked by cross-platform rollup native binary issue (same as all prior deployments)
- [ ] `npm run build` — blocked by cross-platform SWC binary issue (same as all prior deployments)

---

## Open Questions / Blockers

- The `node_modules` cross-platform issue persists. Fix: `rm -rf node_modules package-lock.json && npm install` on the deployment platform (Linux arm64).
- **No Supabase migration needed** for this feature.

---

## Next Recommended Features

1. **Email alerts / living search** — Weekly email digest when new reviews appear on saved topics. Highest-retention feature remaining from all market research reports. Needs: Vercel cron + diff logic comparing current PubMed/OpenAlex results to stored results + Resend/Postmark email template. Medium effort.

2. **Dark mode** — Implement via Tailwind v4 `@custom-variant dark` + `next-themes`. The navy color scheme is already present. Requires touching most component files for `dark:` variants. Medium effort.

3. **Protocol draft versioning** — Allow users to save multiple named protocol drafts per result (e.g. "Draft 1", "Draft 2"). Requires a separate `protocol_drafts` junction table. Medium effort; valuable for iterative refinement.

4. **Accessibility audit (WCAG 2.1 AA)** — Run an automated axe-core audit and fix violations. Key areas: color contrast on gray text (`text-gray-400` on white is 2.5:1 — failing 4.5:1 AA), focus trapping in modals, ARIA roles on the tab components. Medium effort; required for institutional adoption.

5. **"Try a related search" banner** — After showing results, surface 3 topic suggestions (already generated by `lib/related-searches.ts`) in a dismissible banner on the Existing Reviews tab. Very low effort; leverages already-built code.
