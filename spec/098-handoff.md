# Handoff 098 — Design 004 (results dashboard) token migration

**Date**: 2026-06-16
**Previous handoff**: spec/097-handoff.md
**Implements**: `spec/design/004-design.md` — D1 (ordinal→tokens), D2 (categorical→Option A neutral), D3 (brand-surface buttons), D4 (named one-offs)

---

## 1. Summary
Migrated `ResultsDashboard.tsx`'s off-token rainbow palette onto the design system. All **nine
constant maps** the audit enumerated are converted; categorical scales resolved as **D2 Option A
(neutral, no new tokens)**, consistent with handoff 096. No new tokens added.

**Status**: ✅ tsc · ✅ lint · ✅ build · suite 844 pass / 15 pre-existing fail — no regression. **Not
live-verified** (worktree lacks Supabase env → dashboard unreachable). Not committed.

## 2. Changes — `components/ResultsDashboard.tsx`
**D1 ordinal → semantic tokens** (4-step scales collapse to 3 hues; Low vs Moderate by fill, not a 4th hue):
- `FEASIBILITY_STYLES`, `IMPORTANCE_STYLES`, `getAnalysisConfidence` (`badgeClass`→`badgeStyle`),
  `STUDY_TREND_CONFIG` (`colorClass`→`color`), `RELATED_FEASIBILITY_BADGE`, `EGM_CELL_STYLES`
  (filled/empty) → `--success`/`--warning`/`--danger`/`--muted` (+`-bg`). All converted from Tailwind
  class strings to `React.CSSProperties`; call sites moved from `className` to `style`.

**D2 categorical → Option A (neutral)**:
- `SOURCE_STYLES` → single `SOURCE_CHIP_STYLE` (neutral); `GAP_TYPE_COLORS` → `GAP_TYPE_CHIP_STYLE`
  (neutral); `DIMENSION_CHIP_COLORS` (per-dimension active/inactive) → shared `DIMENSION_CHIP_ACTIVE`
  (brand-surface recipe) / `DIMENSION_CHIP_INACTIVE` (neutral). Differentiation now from label, not hue.

**D3 brand-surface buttons** → added `border: 1px solid var(--brand-border)` + `--on-brand`:
- "Re-run search", "Run AI Gap Analysis", "Sign up free to run AI analysis", and the active
  source-filter pills (which also misused `--brand` as a background + legacy `#1e3a5f`/`#f4f1ea`
  fallbacks — fixed to the standard recipe). Banner/island buttons (shared-report header) left as-is
  (correct on the always-navy island).

**D4 named one-offs**:
- "Key gaps identified" amber block → `--warning`/`--warning-bg`; "Analyzing with AI…" meta →
  `--muted`; the two `text-red-600` analysis/protocol errors → `--danger`. EGM empty cells folded into
  the `EGM_CELL_STYLES` conversion above.

## 3. Files touched
`components/ResultsDashboard.tsx` only. No routes/env/DB/new tokens.

## 4. Residual (NOT in 004's enumerated findings — flag for designer)
Seven rainbow hardcodes remain in surfaces the 004 audit table did **not** list, so I left them rather
than expand scope unilaterally:
- `SOURCE_AGREEMENT`-style map (`:235/237`, agree/vary/disagree) + its three "agree" badge ternaries
  (`:986/1013/1040`) — ordinal; would map cleanly to success/warning/danger if the designer confirms.
- Living-review badge (`:1924`, emerald) and a study-design recommendation badge (`:2598`, orange).
- Pervasive `text-gray-500/600 dark:text-gray-400` body text throughout — these already have dark
  variants (not broken), and 004 didn't enumerate them; a future "neutral text → `--muted`" sweep could
  finish them. Recommend a small follow-up design note rather than silent conversion.

## 5. Wiki updates (librarian)
- `Architecture/Design Language` — note D2 settled as Option A for the dashboard too (no `--cat-*`).
- Mark 004 D1/D2/D3/D4 implemented; residual items above tracked for a follow-up.
- No new wiki/code discrepancies.

## 6. Verification gap (TESTER/DESIGNER)
Dashboard is unreachable in this worktree (no Supabase env). A live light/dark pass over the header
(feasibility/trend/source chips), Gaps tab (importance, key-gaps, dimension filter), Map tab (EGM
heatmap + legend), and Related Searches would close 004's `[live-pending]` contrast gate.

## 7. Test / lint / build
```
tsc: 0 · ESLint: 0 · build: ✓ · suite: 844 pass / 15 pre-existing fail (no regression)
removed-constant refs: 0 · all 9 enumerated maps converted
```

**Session completed**: 2026-06-16
