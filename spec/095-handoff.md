# Handoff 095 — Design 005 (status components) token migration

**Date**: 2026-06-16
**Previous handoff**: spec/094-handoff.md
**Implements**: `spec/design/005-design.md` (status components dark-mode parity) — IE1–3, FE1–4, PR1/PR3/PR4
**Defers**: PR2, PR5 (categorical box tints — blocked on `spec/design/004-design.md` D2 decision)

---

## 1. Summary
Migrated the three F4 status components off hardcoded hexes/Tailwind palette onto semantic
design tokens, fixing dark-mode parity (light-only red bands, white-on-gold AA failures,
`--brand`-as-background). Adds one new token `--on-accent`. Tokens-only; no layout change.

**Status**: ✅ tsc · ✅ lint (3 components clean) · ✅ build · suite 844 pass / 15 pre-existing fail — no regression. **Live preview unavailable** (worktree dev server lacks Supabase env → middleware crashes all routes; same limitation noted in 003/004/005). Verification is tsc/lint/build + deterministic token swaps. Not committed.

## 2. New token (flag for librarian → Design Language)
| Token | Light | Dark | Use |
|---|---|---|---|
| `--on-accent` | `#1c2b3a` | `#1c2b3a` | Dark navy text on `--accent` gold fills (pairs with `--on-brand`). Added to all 3 blocks in `app/globals.css`. |

## 3. Changes
- **`components/InsufficientEvidencePanel.tsx`** — IE1: header band/icon/heading/body → `--danger`/`--danger-bg`. IE2: `FEASIBILITY_BADGE` map → success/warning/danger + (Insufficient) surface-2/muted. IE3: submit button → `--on-brand` + `--brand-border`.
- **`components/FieldExplorer.tsx`** — FE1: "Explore" button text `#fff`→`--on-accent` (was ~2.6:1 in dark). FE2: "Search this topic" `--brand` bg → brand-surface recipe (`--brand-surface`/`--on-brand`/`--brand-border`). FE3: `FeasibilityDot` ordinal hexes → tokens (keeps color-mix). FE4: error `#ef4444`→`--danger`.
- **`components/PrismaFlowDiagram.tsx`** — PR1: screening summary tiles → success/warning/danger pairs. PR3: text-on-brand `rgba(244,241,234,…)` → `--on-brand` at matching opacity; highlighted FlowBox text → `--on-brand`. PR4: dropped legacy `#1e3a5f`/`#f4f1ea` literal fallbacks. Also fixed Inclusion/Exclusion toggle pills (active state used `--brand` as bg) → brand-surface recipe. (Highlighted FlowBox bg was set to `--brand-surface` by a concurrent instance; I completed its text-color + fallback cleanup.)
- **`app/globals.css`** — added `--on-accent` (`:root`, `html.dark`, `prefers-color-scheme`).

## 4. Files touched
`components/InsufficientEvidencePanel.tsx`, `components/FieldExplorer.tsx`, `components/PrismaFlowDiagram.tsx`, `app/globals.css`. No routes/env/DB.

## 5. Deferred (per spec, blocked)
- **PR2** (PrismaFlowDiagram inline category tints/banners, lines ~361–362, 478–480; `EstimatedBadge` amber) and **PR5** (`.prisma-*` box palette in globals.css) are *categorical* — design 005 says resolve **004 D2** (neutral vs `--cat-*`) first. Left untouched.

## 6. Wiki updates (librarian)
- `Architecture/Design Language` — record new token **`--on-accent`** (#1c2b3a, both themes).
- Mark design 005 IE/FE/PR1/PR3/PR4 implemented; PR2/PR5 pending 004 D2.
- No new wiki/code discrepancies.

## 7. Verification gap (for TESTER/DESIGNER)
Dark-mode contrast of these swaps is **not** live-verified (no runnable app in this env). A live light/dark pass on an Insufficient result (IE), the home Explore card (FE — reachable once env present), and the PRISMA tab (PR) would close the 005 accessibility gate.

## 8. Test / lint / build
```
tsc: 0 · ESLint: 0 (3 components) · build: ✓ · suite: 844 pass / 15 pre-existing fail (no regression)
```

**Session completed**: 2026-06-16
