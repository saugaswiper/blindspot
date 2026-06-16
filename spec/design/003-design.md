# 003 — Screening workbench deep-dive

> Designer → Dev handoff. Covers `components/ScreeningPanel.tsx` (the AI-assisted,
> human-in-the-loop title/abstract screening surface — the flagship of the
> [[Mission & Vision|review-automation aim]]).
> Source of truth: `Architecture/Design Language.md`, `Features/Screening.md`, `app/globals.css`.
> Date: 2026-06-16.

## Verification basis (read this first)
The screening UI is **not reachable anonymously**: result rows are RLS-private (the page
404s without auth), the panel is `isOwner`-gated (`ScreeningPanel.tsx:1018`), and there are
**zero saved `screening_result` rows** in the DB (confirmed via query), so the results-table
state can't render without seeding data + owner auth. Per role boundaries I won't fabricate
DB data. Therefore this critique is grounded in:
1. A **complete read** of `ScreeningPanel.tsx` (all 1,232 lines) + `screening-utils`/types, and
2. The **dark-mode button + focus-ring patterns already verified live** in the auth pass ([002](002-design.md)).

**Follow-up needed (DEV/TESTER):** seed one owned `search_results` row with a realistic
`screening_result` (mixed include/exclude/uncertain, some `low` confidence, a `retraction`,
some `human_decision`s, 300+ decisions) so the table can get a live light/dark + 375px
pixel-pass. Findings below that need that pass are tagged **[live-pending]**.

## What's already strong (keep)
- **Token discipline** — unlike the rest of the app, this component routes status through
  `--success/--danger/--warning` (+ `-bg`) and `--accent`/`--surface` throughout. It's the
  reference for how the dense surfaces should look.
- Decision badges pair **color + icon** (✓/✕/?) — not color-only. Good for color-blind users.
- The **chunked running state** has a real data-driven progress bar + indeterminate fetch
  sweep + honest copy. Keep as-is.
- Audit-trail surfacing (RIS/CSV exports, "AI said:" + "✓ Human" badges, criteria recall,
  the RAISE disclaimer footer) is exactly right for a methodology tool. Keep.

---

## Findings & design changes

### Token / theming recurrences (fixes already defined in 002 — just apply here)

#### S1 · Brand-surface buttons invisible in dark mode  *(audit F2/F7)*
- **Where:** "Resume screening" (`:1113`), "Approve & Screen" / "Restart from scratch"
  (`:1125`) — `background: var(--brand-surface)` + literal `color: "#f4f1ea"`, no border.
- **Fix:** add `border: 1px solid var(--brand-border)` and replace `"#f4f1ea"` with
  `var(--on-brand)` (tokens introduced in [002](002-design.md)).

#### S2 · `ring-offset` white halo on active pills/buttons in dark  *(audit A3)*
- **Where:** active filter pill (`:362` `ring-2 ring-offset-1 ring-current`) and active
  verdict button (`:570` same). Tailwind's `--tw-ring-offset-color` defaults to `#fff`,
  so the offset is a white halo on the dark card.
- **Fix:** set `[--tw-ring-offset-color:var(--surface-2)]` on these (the card they sit on),
  or drop `ring-offset-1` and let `ring-current` read directly. (`ring-current` itself is
  fine — it inherits the verdict color.)

### Stray hardcodes (the only off-token spots in the file)

#### S3 · RetractionBadge bypasses the danger tokens — and is illegible in dark  *(audit F4)*
- **Where:** `:97–99` — `background: "rgba(239,68,68,0.15)"`, `color: "#dc2626"`,
  `border: "rgba(239,68,68,0.3)"`. In dark mode that's a faint translucent-red wash with a
  mid-red `#dc2626` label → low contrast on exactly the badge that flags a **retracted
  study**, which must never be missed.
- **Fix:** use the danger pair like every other badge here:
  `{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger)" }`.
  Keep the ⚠ glyph + the existing `title`. To keep retraction *distinct* from the
  reason-code badge (also danger), give it a heavier weight (e.g. `2px` border or a small
  `--danger` fill chip) rather than a different hue. **[live-pending]** verify legibility.

### Interaction, target size & hierarchy (the workbench substance)

#### S4 · Verdict buttons are too small/faint for a high-repetition triage tool
- **Where:** `:570` — the include/exclude/uncertain controls are `w-6 h-6` (24px) at
  `opacity-50` until hover, `gap-1` (4px) apart.
- **Why:** 24px is the bare WCAG 2.5.8 (AA) *minimum*; this is the single most-repeated
  action in the product (clicked thousands of times, often on a trackpad / on mobile), and
  `opacity-50` hides the affordance until hover (no hover on touch).
- **Fix:** bump to **28–32px**, raise resting opacity to ~**0.7** (full on hover/active),
  and widen spacing to `gap-1.5`/`gap-2`. Keep the icon + `aria-pressed`. **[live-pending]**
  re-check density at 375px.

#### S5 · The verdict is encoded 3× per row — reduce redundancy, clarify the action
- **Where:** each row shows the verdict as (a) the left `borderLeft` color (`:500`),
  (b) the left circular badge (`:507`), **and** (c) the right-side "Include/Exclude/
  Uncertain" label pill (`:637`) — plus a confidence dot and a "✓ Human" badge stacked on
  the right (`:635–648`). The interactive *human-verdict* buttons sit in the middle (`:562`).
- **Why:** three static restatements of the AI verdict compete with the one thing the user
  is actually there to do (record their verdict). The right-side cluster is the busiest part
  of the row yet is entirely non-interactive.
- **Fix (hierarchy):** keep **one** AI-verdict indicator (recommend the left border +
  badge), demote the right-side label, and make the **human-verdict button group the clear
  primary affordance** (larger per S4, right-aligned where the eye lands). Target scan path:
  `[AI badge]  Title · meta · flags  →  [your verdict ●●●]`. Confidence moves inline (S9).

#### S6 · The row's click-to-select model is invisible & keyboard-opaque
- **Where:** the row `<div>` has `onClick={() => setActiveIdx(pos)}` (`:496`) but no
  `role`, `tabIndex`, `cursor-pointer`, or hint. The "active row" outline (`:501`) only
  appears *after* a click or `j`/`k`. A user can't tell rows are selectable or that there's
  a speed mode until they discover the keys.
- **Fix:** add `cursor-pointer`, give the active row a persistent affordance, and on table
  mount auto-activate row 0 (so `y/n/u` work immediately). Surface a small "Speed mode"
  label near the toolbar. *Behavioral nuance — flag to dev:* the global `window` keydown
  (`:277`) is fine but if multiple gap cards each mount a panel, several listeners coexist;
  confirm only the focused table responds.

#### S7 · Keyboard speed mode is under-surfaced
- **Where:** the hint (`:417`) is `hidden sm:block` plain text with unstyled `<kbd>`.
- **Fix:** style `<kbd>` as token-based key-caps (`--surface-2` bg, `--border`, `--muted`
  text — mirror `prisma-phase-label` styling), and link the existing
  `KeyboardShortcutsHelp` component so the shortcuts are discoverable in one place.

#### S8 · Confidence is conveyed by color alone
- **Where:** `ConfidenceDot` (`:118`) — green/amber/red dot, `aria-label`+`title` only.
- **Why:** screen-reader & hover users are covered, but sighted color-blind users can't
  distinguish high/medium/low, and there's no visible legend.
- **Fix:** encode confidence with **shape/fill, not hue** — see S9.

#### S9 · Confidence reuses the verdict palette → mixed signal
- **Where:** `CONFIDENCE_CONFIG` (`:112`) maps high/medium/low to
  `--success/--warning/--danger` — the *same* colors as include/exclude/uncertain. A **red**
  low-confidence dot next to a **green ✓ include** badge reads ambiguously (is red the
  decision or the confidence?).
- **Fix:** give confidence a **distinct, non-verdict visual language** — e.g. a 3-segment
  filled/half/empty bar, or a single dot with an opacity/size ramp, in a neutral or
  `--brand` hue. Solves S8 (no longer hue-dependent) and S9 (no palette clash) together.

### States & flow

#### S10 · Idle CTA is visually timid for the flagship feature
- **Where:** `:1024` — the "Screen ~N primary studies" entry uses a low-emphasis
  `surface-2`/`border` chip. As the entry point to the headline review-automation capability
  it reads as tertiary.
- **Fix:** give it modest prominence (e.g. `--accent` border + accent text/icon, or a subtle
  `--accent`-tinted fill) without overpowering the gap card it lives in. Design judgment —
  validate against the gap-card hierarchy in the 004 dashboard pass.

#### S11 · Errors are bare red text; long failures deserve a block + announcement
- **Where:** `:1037`, `:1104`, `:1218` render errors as `color: var(--danger)` text only.
  The resume-failure message (`:839`) is a full sentence with recovery instructions.
- **Fix:** render errors in the `--danger`/`--danger-bg` block style from auth A4 and add
  `role="alert"` so they're announced. Keep the short inline reds for trivial cases if
  preferred, but the run/resume failure should be the block.

#### S12 · Progress is not announced to assistive tech
- **Where:** running state (`:1138`) updates text + bar visually only.
- **Fix:** wrap the progress line in `aria-live="polite"` (and `role="status"`) so SR users
  hear "Screening 600 / 3,330…" milestones. Throttle to avoid chatter (e.g. announce each
  chunk, not each %).

---

## Accessibility checklist (gate)
- [ ] Verdict controls ≥ comfortable target size, affordance visible without hover (S4).
- [ ] Confidence not conveyed by color alone; no clash with verdict palette (S8/S9).
- [ ] Active-row selection discoverable + keyboard model surfaced (S6/S7).
- [ ] Focus/active rings have no white halo in dark (S2).
- [ ] Run/resume errors announced (`role="alert"`); progress announced (`aria-live`) (S11/S12).
- [ ] Retraction badge legible in both themes (S3). **[live-pending]**

## Responsive / dark-mode
- All token fixes flip automatically. The dark-only regressions are S1 (buttons) and S2
  (halo). The dense row (badge + title + flags + verdict group + right cluster) is the main
  375px risk — **[live-pending]** once seed data exists; S5's de-cluttering should help.

## Tokens
No new tokens. This pass **consumes** the three introduced in [002](002-design.md)
(`--ring`, `--brand-border`, `--on-brand`) — which is the point of having landed them in the
auth pass first.

## Out of scope / flag to DEV/TESTER (not design)
- The known prompt-wording inconsistency (`buildCriteriaPrompt`/`buildScreeningPrompt` still
  say "systematic reviews" while default `screen_type` is "primary") — `Features/Screening.md`
  §"Known code inconsistency". Not a UI issue; noting so it isn't lost.
- Seeding an owned result with `screening_result` for the live pixel-pass (above).
