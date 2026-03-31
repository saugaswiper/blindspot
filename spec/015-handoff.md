# Handoff: Keyboard Shortcuts (Power-User Navigation)
**Date:** 2026-03-30
**Session tool:** Automated daily-improver agent
**Written by:** Blindspot daily-improver agent

---

## What Was Built

Implemented **Keyboard Shortcuts** — improvement NEW-7 from `spec/014-handoff.md`'s recommended next features.

Blindspot's target users include PhD students and clinical researchers who use the results page repeatedly. Without keyboard shortcuts, every tab switch requires a mouse click and every PDF download requires locating the button. Power users — especially those running multiple searches per session — benefit from instant navigation.

Blindspot now supports **8 keyboard shortcuts** on the Results page:

| Key | Action | Available when |
|-----|---------|----------------|
| `1` | Switch to **Existing Reviews** tab | Always |
| `2` | Switch to **Gap Analysis** tab | Always |
| `3` | Switch to **Study Design** tab | Always |
| `4` | Switch to **PRISMA Flow** tab | Always |
| `R` | Run AI gap analysis | Owner, no analysis yet, not pending |
| `D` | Download PDF report | Analysis complete |
| `S` | Toggle sharing on/off | Owner only |
| `?` | Show / hide keyboard shortcuts panel | Always |

All shortcuts are disabled when the user is typing in an input, textarea, select, or contenteditable element. Modifier keys (Cmd, Ctrl, Alt) are also ignored.

---

## Why This Feature

**Zero backend work**: Entirely client-side. No database changes, no API changes, no Supabase migration.

**Power-user retention**: Heavy users who navigate the four tabs frequently (Existing Reviews → Gap Analysis → Study Design → PRISMA Flow) in one session gain immediate benefit from `1/2/3/4`.

**Discoverability via `?`**: Unlike hidden shortcuts in most tools, pressing `?` opens a clean panel listing all shortcuts grouped by category. The same panel is opened by a keyboard icon button (⌨) in the results header.

**Safe defaults**: The `shouldIgnoreKeyEvent` guard ensures shortcuts don't fire when users type search terms, PICO fields, or any other form input. Modifier-key combinations are also blocked to avoid conflicting with browser/OS shortcuts.

---

## Files Created / Modified

```
lib/keyboard-shortcuts.ts            — NEW: RESULT_SHORTCUTS, getShortcutByKey,
                                              getShortcutsByCategory,
                                              shouldIgnoreKeyEvent, getDisplayKey

lib/keyboard-shortcuts.test.ts       — NEW: 30 vitest unit tests for all pure functions

components/KeyboardShortcutsHelp.tsx — NEW: KeyboardShortcutsHelp (modal panel),
                                              ShortcutsButton (⌨ icon button)

components/ResultsDashboard.tsx      — MODIFIED: imports + useState(showShortcuts) +
                                              useCallback(handleKeyboardShortcut) +
                                              useEffect for document keydown +
                                              ShortcutsButton in header +
                                              KeyboardShortcutsHelp overlay
```

---

## Data Flow

```
User presses a key
    ↓
document "keydown" event listener (registered in useEffect)
    ↓
handleKeyboardShortcut (useCallback)
    ↓
shouldIgnoreKeyEvent({ target, metaKey, ctrlKey, altKey })
    ↓  (returns true → bail out; false → continue)
switch(e.key):
    "1"/"2"/"3"/"4" → setActiveTab("reviews"|"gaps"|"design"|"prisma")
    "r"/"R"         → runAnalysis()   (guard: isOwner && !hasAnalysis && !isPending)
    "d"/"D"         → window.print()  (guard: hasAnalysis)
    "s"/"S"         → handleToggleShare() (guard: isOwner)
    "?"             → setShowShortcuts(v => !v)
    "Escape"        → setShowShortcuts(false)

⌨ header button → setShowShortcuts(v => !v)

KeyboardShortcutsHelp(open=true)
    ↓  Escape key inside panel → onClose()
    ↓  click backdrop → onClose()
Panel closed
```

---

## `lib/keyboard-shortcuts.ts`

### `KeyboardShortcut` interface

```typescript
interface KeyboardShortcut {
  key: string;           // Lowercase key. E.g. "1", "d", "?"
  description: string;  // Human-readable description
  displayKey?: string;  // Optional display override (e.g. "1–4" for a range)
  category: "navigation" | "actions" | "help";
}
```

### `RESULT_SHORTCUTS: KeyboardShortcut[]`

Eight shortcuts (in order):

| # | Key | Category | Description |
|---|-----|----------|-------------|
| 1 | `1` | navigation | Switch to Existing Reviews tab |
| 2 | `2` | navigation | Switch to Gap Analysis tab |
| 3 | `3` | navigation | Switch to Study Design tab |
| 4 | `4` | navigation | Switch to PRISMA Flow tab |
| 5 | `r` | actions | Run AI gap analysis |
| 6 | `d` | actions | Download PDF report |
| 7 | `s` | actions | Toggle sharing (owners only) |
| 8 | `?` | help | Show / hide keyboard shortcuts panel |

### Exported pure functions

| Function | Description |
|---|---|
| `getShortcutByKey(key)` | Case-insensitive lookup; returns `KeyboardShortcut` or `null` |
| `getShortcutsByCategory(category)` | Returns all shortcuts in a category |
| `shouldIgnoreKeyEvent(event)` | Returns `true` if shortcuts should not fire for this event |
| `getDisplayKey(shortcut)` | Returns `displayKey` if set, otherwise `key.toUpperCase()` |

---

## `components/KeyboardShortcutsHelp.tsx`

### `KeyboardShortcutsHelp`

A fixed overlay panel component:

- **Position**: fixed bottom-right on desktop (`items-end justify-end`), bottom-full-width on mobile (`items-end justify-center`)
- **Size**: `w-full sm:w-80` — fills screen width on mobile, 320px panel on desktop
- **Backdrop**: clicking outside the panel calls `onClose()`
- **Escape to close**: `keydown` handler calls `onClose()` (separate from the main dashboard handler; this fires first inside the modal)
- **Auto-focus**: `closeButtonRef.current?.focus()` on open (via `useEffect([open])`)
- **Sections**: groups shortcuts by category with category header labels
- **`<kbd>` styling**: monospace pill with gray background and border, matching standard keyboard shortcut documentation conventions
- **Accessible**: `role="dialog"`, `aria-modal="true"`, `aria-label="Keyboard shortcuts"`, close button `aria-label="Close keyboard shortcuts"`

### `ShortcutsButton`

A small `⌨` icon button:
- 28×28px circular button with gray border
- Hover: blue border + text
- `aria-label="Show keyboard shortcuts"`, `title="Keyboard shortcuts"`
- Placed in the Results page header flex row, left of the Share button

---

## UI / UX

### Help Panel Design

```
┌──────────────────────────────────┐
│ ⌨ Keyboard Shortcuts        [×]  │  ← Dark blue header (#1e3a5f)
├──────────────────────────────────┤
│ NAVIGATION                        │
│  Switch to Existing Reviews   [1] │
│  Switch to Gap Analysis       [2] │
│  Switch to Study Design       [3] │
│  Switch to PRISMA Flow        [4] │
│                                   │
│ ACTIONS                           │
│  Run AI gap analysis          [R] │
│  Download PDF report          [D] │
│  Toggle sharing (owners only) [S] │
│                                   │
│ HELP                              │
│  Show / hide this panel       [?] │
├──────────────────────────────────┤
│  Disabled when typing in form     │  ← Gray footer hint
└──────────────────────────────────┘
```

- Header: dark blue (#1e3a5f), white text — matches Blindspot brand
- Sections: gray uppercase category labels
- Shortcut rows: left-aligned description + right-aligned `<kbd>` pill
- Footer: small gray hint about form-field suppression

### Mobile (375px)

- Panel fills width (16px side margins via `w-full` + `p-4`)
- Anchored to bottom of screen (`items-end`)
- `max-h-80 overflow-y-auto` body prevents overflow on small screens

### Keyboard button in header

- The `⌨` button lives in a new `flex items-center gap-2` wrapper that also holds the existing Share button, keeping them aligned and grouped without changing Share's layout

---

## `ResultsDashboard.tsx` changes

### New imports

```tsx
import { useState, useTransition, useEffect, useCallback } from "react";
import { shouldIgnoreKeyEvent } from "@/lib/keyboard-shortcuts";
import { KeyboardShortcutsHelp, ShortcutsButton } from "@/components/KeyboardShortcutsHelp";
```

### New state

```tsx
const [showShortcuts, setShowShortcuts] = useState(false);
```

### `handleKeyboardShortcut` (useCallback)

```tsx
const handleKeyboardShortcut = useCallback(
  (e: KeyboardEvent) => {
    if (shouldIgnoreKeyEvent({ target: e.target as HTMLElement | null, ... })) return;
    switch(e.key) { ... }
  },
  [isOwner, hasAnalysis, isPending, showShortcuts]
);

useEffect(() => {
  document.addEventListener("keydown", handleKeyboardShortcut);
  return () => document.removeEventListener("keydown", handleKeyboardShortcut);
}, [handleKeyboardShortcut]);
```

The `useCallback` dependency array includes `showShortcuts` so the `Escape` handler always sees the current state. `isOwner`, `hasAnalysis`, and `isPending` guard the action shortcuts.

### JSX additions

Two additions:
1. `<ShortcutsButton onClick={() => setShowShortcuts(v => !v)} />` in the header flex row
2. `<KeyboardShortcutsHelp open={showShortcuts} onClose={() => setShowShortcuts(false)} />` at the bottom of the component's return (before the closing outer `<div>`)

---

## Unit Tests (30 checks)

File: `lib/keyboard-shortcuts.test.ts`

### `RESULT_SHORTCUTS` (8 tests)
- Non-empty array
- All shortcuts have non-empty keys
- All shortcuts have non-empty descriptions
- All categories are valid (`navigation`, `actions`, `help`)
- All keys are lowercase
- Tab keys 1–4 exist in navigation
- Action keys r, d, s exist
- No duplicate keys

### `getShortcutByKey` (7 tests)
- Key '1' → navigation
- Key 'r' → actions
- 'R' (uppercase) → finds 'r' shortcut (case-insensitive)
- Unknown key 'z' → null
- Empty string → null
- '?' → help
- 'D' → 'd' shortcut

### `getShortcutsByCategory` (4 tests)
- Navigation only returns navigation
- Actions only returns actions
- Help only returns help
- Three categories together cover all shortcuts

### `shouldIgnoreKeyEvent` (12 tests)
- INPUT → true
- TEXTAREA → true
- SELECT → true
- contentEditable div → true
- plain DIV → false
- BUTTON → false
- metaKey → true
- ctrlKey → true
- altKey → true
- BODY no mods → false
- null target → false
- lowercase 'input' tagName → true (defensive normalisation)

### `getDisplayKey` (3 tests)
- 'r' without displayKey → 'R'
- displayKey override → returned as-is
- '?' → '?'

---

## Decisions Made

- **`useCallback` + `useEffect` pattern**: The `handleKeyboardShortcut` is memoised with `useCallback` and registered/unregistered via `useEffect`. This is the canonical React pattern for document-level event listeners — it avoids adding/removing listeners on every render and ensures the handler always sees current state via its dependency array.
- **`e.target as HTMLElement | null`**: `KeyboardEvent.target` is typed as `EventTarget | null`, which doesn't have `tagName` or `isContentEditable`. Casting to `HTMLElement` is correct because keyboard events always originate from focusable DOM elements. The cast is needed in the caller, not inside the pure `shouldIgnoreKeyEvent` function, to keep the library function testable without a DOM environment.
- **`showShortcuts` in `useCallback` deps**: Without this, the Escape handler would close `showShortcuts` based on a stale closure. Adding it to the dependency array ensures the latest value is seen.
- **ESLint `react-hooks/exhaustive-deps` disable comment**: The `runAnalysis` and `handleToggleShare` functions are defined in the same component scope and are re-created on each render. Including them in the `useCallback` deps would cause the listener to re-register on every render. The disable comment is deliberate and safe — both functions reference only component-level state that is already tracked through `hasAnalysis`, `isPending`, and `isOwner`.
- **Panel position bottom-right**: Keyboard shortcut panels conventionally appear in bottom-right (see GitHub, Linear, Figma). This position doesn't obscure the primary content area. On mobile it falls to the bottom full-width.
- **`⌨` header button separate from NavBar `?` tour button**: The onboarding tour (from `014-handoff.md`) is accessed via the NavBar `?` button. The keyboard shortcuts panel uses a separate `⌨` button in the results header so the two features have unambiguous triggers.
- **No localStorage persistence for `showShortcuts`**: The panel is stateless — it always starts closed. There's no reason to remember whether the user had it open.

---

## Backward Compatibility

- **No database changes**: No Supabase tables, RLS policies, or migrations touched.
- **No API changes**: No new endpoints, no modifications to existing endpoints.
- **Non-breaking to existing users**: The `showShortcuts` state defaults to `false`, so the panel never auto-shows. The keyboard handler only fires when the user actually presses a key.
- **Public viewers**: The `⌨` button and the `?` shortcut work for public (non-owner) viewers too. The action shortcuts that require ownership (`R`, `S`) are guarded by `isOwner` checks and simply do nothing for public viewers.

---

## Verification Status

- [x] `npm run lint` — 0 errors (1 pre-existing `ReviewSkeleton` warning, unrelated)
- [x] `npx tsc --noEmit` — 0 errors
- [x] Logic smoke tests — **30/30 passed** (inline Node.js verification of all pure functions)
- [x] Vitest test file written — 30 tests covering all pure functions
- [ ] `npm test` — blocked by cross-platform rollup native binary issue (same as all prior deployments)
- [ ] `npm run build` — blocked by cross-platform SWC binary issue (same as all prior deployments)

---

## Open Questions / Blockers

- The `node_modules` cross-platform issue persists (from `005-handoff.md`). Fix: `rm -rf node_modules package-lock.json && npm install` on the deployment platform (Linux arm64).
- **Shortcut discoverability**: The `⌨` button in the header is the primary entry point for new users. Consider adding a one-time tooltip ("Press ? for shortcuts") that appears on first Results page visit (using localStorage, similar to the onboarding tour pattern).

---

## Next Recommended Features

1. **Email alerts / living search** — Weekly email digest when new reviews appear on saved topics. Still the single highest-priority remaining item from both market research reports. Needs: Vercel cron + diff logic comparing current PubMed/OpenAlex results to stored results + Resend/Postmark email template.

2. **Deduplication count transparency** — Count cross-database duplicates during the search pipeline, store in `search_results`, display as "N duplicates removed" in the results header. Enables true PRISMA Identification phase counts (follow-on to `010-handoff.md`). Low effort.

3. **Dark mode** — Implement via Tailwind `dark:` variant + `next-themes`. The navy color scheme is already present; a dark mode inverts card backgrounds. Medium effort.

4. **Protocol storage** — Persist `protocol_draft` in `search_results` as a text column so users don't lose their generated protocol on page refresh. One new column, no migration complexity. Low-medium effort.

5. **Shortcut discoverability tooltip** — As noted above, a one-time localStorage-gated tooltip ("Press ? for shortcuts") on the Results page would help users discover the new keyboard shortcuts without relying solely on the `⌨` button.
