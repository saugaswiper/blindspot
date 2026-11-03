# Handoff 131 — Brief 014: scoped, discoverable keyboard speed mode (ScreeningPanel)

## Addresses
`spec/briefs/014.md` (design 003 §S6, keyboard-opaque rows). Priority order this run: no open fix-brief; brief 013 already shipped (HO129); brief 014 is the lowest-numbered open `Track: design` brief. All 5 scope items implemented; ACs below are `claimed` until the tester verifies.

## Changes
- `lib/screening-speed-mode.ts` (new, pure): `parseSpeedModeKey`, `isKeyInScope`, `toggleVerdict`, `announceVerdict`. Extracted so scoping and announcement rules are unit-testable (vitest runs in `node`; no jsdom / testing-library in the repo).
- `lib/screening-speed-mode.test.ts` (new): 6 tests (key mapping, scope rule, toggle, announcement text).
- `components/ScreeningPanel.tsx`:
  1. **Scoped keys.** The window handler acts only if the target is inside the results region (`regionRef.contains`) or is `document.body` while a row is active. Otherwise it returns without `preventDefault`, so page scrolling works. INPUT/TEXTAREA/SELECT/contenteditable and meta/ctrl/alt guards kept.
  2. **Keyboard-reachable rows.** Results container is `role="list"`, rows `role="listitem"` with roving `tabIndex` (active row, else row 0 = 0; others -1). Focusing a row (Tab/click) makes it active. `Escape` clears the active row and focuses the sort select (toolbar). No focus trap (Shift+Tab leaves normally).
  3. **Affordance.** Outline is `var(--ring)`; `aria-current="true"` on the active row only. Hint shows `Row N of M` while active, else "Press j to start".
  4. **Announcements.** One `sr-only` `role="status"` `aria-live="polite"` region; `recordVerdict()` (shared by keys and verdict buttons) sets one message per action, e.g. "Row 12 of 3,042: Include recorded" / "…human decision cleared".
  5. **No auto-recording.** Row activation never calls `onOverride`; `activeIdx` still starts at -1 (no auto-activation on mount). Only y/n/u or a verdict button call it.
- Not changed: key meanings, verdict badges, confidence bar, Human/retraction badges, `globals.css`, tokens.

## Gates
- `npm run lint`: 0 errors (3 pre-existing warnings).
- `npm test`: 1046 pass, 12 fail (the same 12 pre-existing failures), 18 skipped.
- `npx tsc --noEmit`: clean. `npm run build`: succeeds.

## AC status (all `claimed`)
- AC1 scope rule: unit-tested via `isKeyInScope`; the component's `preventDefault` is only reached after that check. No DOM-level test (no jsdom).
- AC2/AC5/AC6/AC8: **not DOM-tested** (no component test harness); verified by code reading only. Needs a tester pass or adding jsdom + testing-library.
- AC3: outline is `var(--ring)` 2px; contrast ratios not computed this run; `--ring` is `#a67c2e` (light) / `#c49a2e` (dark). Verdict buttons unchanged at `w-7 h-7` (28 px).
- AC4: message text unit-tested; single-message-per-action by construction.
- AC7: `[live-pending]` — no seeded 3,000-decision result, no screenshots.
- AC9: tsc and lint clean on the touched files.

## Deferred / risks
- Component-level tests (AC2, 5, 6, 8) and the pixel pass.
- Row-focus follow: when focus is on a row and j/k moves the active index, focus is moved to the new row only if focus is already on a `listitem`.
- Multiple mounted panels: scoping is by the panel's own `regionRef`, so a second panel no longer responds to keys focused in the first; the body-with-active-row case is still per-panel.

## Stale wiki pages
Roadmap & Status and the Screening workbench feature page (speed-mode behavior, scoping, announcements); Design Language / design 003 §S6 tracking (keyboard-opaque rows addressed, claimed).

## Operator review fix (2026-11-03)
With focus on `document.body` and no active row, every key was out of scope, so the "Press j to start" hint did nothing. A bare `j` from the body now activates row 1 **without** `preventDefault` (letters do not scroll), so AC1 still holds. Arrows from the body remain unscoped.
