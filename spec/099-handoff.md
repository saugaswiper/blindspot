# Handoff 099 — Global pointer cursor on buttons

**Date**: 2026-06-16
**Previous handoff**: spec/098-handoff.md
**Trigger**: User request — buttons should show the hand (pointer) cursor so they read as clickable.

---

## 1. Summary
Tailwind v4's Preflight resets `<button>` to `cursor: default`, so buttons across the app didn't show
the hand cursor on hover. Added a global base rule in `app/globals.css` restoring `cursor: pointer` on
interactive controls, with `cursor: not-allowed` preserved for disabled ones. One change, app-wide.

**Status**: ✅ build compiles. CSS-only (no tsc/test impact). **Not live-verified** (worktree lacks
Supabase env). Not committed.

## 2. Changes — `app/globals.css`
```css
button:not(:disabled):not([aria-disabled="true"]),
[role="button"]:not([aria-disabled="true"]),
label[for],
summary { cursor: pointer; }

button:disabled,
button[aria-disabled="true"],
[role="button"][aria-disabled="true"] { cursor: not-allowed; }
```
- Covers native `<button>`, `[role="button"]`, `<label for>` (clickable form labels), and `<summary>`
  (disclosure toggles).
- `<a href>` links already get the pointer cursor natively — unaffected.
- Inline `cursor` styles (e.g. the EGM disabled cells' `disabled:cursor-default`, the disabled
  "Run AI Gap Analysis" button's inline `cursor: not-allowed`) still win where set — intentional.

## 3. Files touched
`app/globals.css` only. No routes/env/DB/new tokens.

## 4. Behavior
Hovering any button now shows the hand cursor; disabled buttons show not-allowed. No visual/layout
change otherwise.

## 5. Wiki updates (librarian)
- `Architecture/Design Language` — record the interaction convention: interactive controls use
  `cursor: pointer` (global base rule), disabled use `cursor: not-allowed`.

## 6. Verification gap
Cursor behavior is not live-verified here (no runnable app). Trivial to confirm on hover once the app
runs; deterministic CSS.

## 7. Build
```
build: ✓ compiled (CSS-only change; tsc/tests unaffected)
```

**Session completed**: 2026-06-16
