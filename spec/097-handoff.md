# Handoff 097 — Design 006 (landing page) completion

**Date**: 2026-06-16
**Previous handoff**: spec/096-handoff.md
**Implements**: `spec/design/006-design.md` (landing page) — remaining items

---

## 1. Summary
Closed out design 006. Most items (L1 hero literals, L3 HeroSourceLogos chip, L4/L5/L6
TopicInput button/errors/focus-rings, L7 FieldExplorer via 005) were **already implemented by
concurrent instances**. This pass finished the last two: L8 (OnboardingTour focus ring) and the
optional L2 (clarifying comment on the intentional hero gold literal). No new tokens.

**Status**: ✅ tsc · ✅ lint (only the pre-existing accepted `<img>` warning on the F0 favicon
fix) · ✅ build · suite 844 pass / 15 pre-existing fail — no regression. **Not live-verified**
(worktree lacks Supabase env). Not committed.

## 2. Changes
- **`components/OnboardingTour.tsx`** (L8) — last `focus:ring-[#4a90d9]` (replay button, :372)
  → `focus:ring-[color:var(--ring)]`. (Other tour rings/text were already tokenized.)
- **`app/page.tsx`** (L2, optional) — added a comment explaining the hero `#c49a2e` is the
  intentional on-dark gold (always-navy hero island, theme-independent by design); left the
  literal per the spec's "keep with a comment" option. No visual change.

## 3. Already-done (verified this pass, no action needed)
- L1 hero text literals → `--on-brand` (page.tsx): done.
- L3 `HeroSourceLogos` chip `rgba(244,241,234,0.5)` → `--on-brand`@0.5: done.
- L4 `TopicInput` submit → `--brand-surface`/`--on-brand`/`--brand-border` + `--ring` focus: done.
- L5 `TopicInput` errors (`#dc2626`) → `--danger` (3 sites): done.
- L6 `TopicInput` focus-visible `--ring` on mode toggle + year select + submit: done.
- L7 `FieldExplorer` FE1/FE2: done in handoff 095 (design 005).
- L9: no action (correct as-is).

## 4. Files touched
`components/OnboardingTour.tsx`, `app/page.tsx`. No routes/env/DB/new tokens.

## 5. Design program status (librarian)
- **All six design specs (001–006) now implemented in code.** New tokens landed across the
  program: `--ring`, `--brand-border`, `--on-brand` (002), `--on-accent` (005). `--cat-1…6` was
  **not** added — D2 resolved as Option A (neutral), see handoff 096.
- Suggested `Architecture/Design Language` update: record the four new tokens + the D2 Option-A
  decision; mark 006 complete.
- No new wiki/code discrepancies. (Long-standing open: brief's nonexistent `lib/per-source-count.ts`, handoff 084 §8.)

## 6. Verification gap (TESTER/DESIGNER)
Landing renders live once Supabase env is present; the accessibility gates in 002/005/006
(dark-mode button boundaries, `--ring` focus visibility, neutral-chip contrast) are **not**
live-verified in this worktree. One light/dark keyboard pass over `/`, `/login`, the PRISMA tab,
and an Insufficient result would close the remaining `[live-pending]` gates across 002/003/004/005/006.

## 7. Test / lint / build
```
tsc: 0 · ESLint: 0 errors (1 pre-existing accepted img warning) · build: ✓ · suite: 844 pass / 15 pre-existing fail (no regression)
```

**Session completed**: 2026-06-16
