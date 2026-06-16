# Handoff 093 — Implement design 003 (screening workbench) findings

**Date**: 2026-06-16
**Previous handoff**: spec/092-handoff.md
**Implements**: `spec/design/003-design.md` — S1, S2, S4, S6 (partial), S7, S8/S9, S11, S12

---

## 1. Summary
Applied the screening-workbench design pass. Consumes the three tokens landed in 092
(`--brand-border`, `--on-brand`, `--ring`/offset). Focus: dark-mode legibility, the
high-repetition verdict controls, accessible confidence encoding, and announced
errors/progress.

**Status**: ✅ tsc clean · ✅ eslint clean. **Not** pixel-verified live — the screening
surface needs a seeded owned `screening_result` row + owner auth (the `[live-pending]`
blocker in 003); type/lint is the gate. Not committed at write time.

## 2. Changes (`components/ScreeningPanel.tsx`)
- **S1** — brand-surface buttons ("Resume screening", "Approve & Screen" / "Restart")
  now use `--on-brand` text + `1px var(--brand-border)` (visible edge in dark).
- **S2** — active filter pill and active verdict button: `[--tw-ring-offset-color]` set to
  their surface (`--surface-2` / `--surface`) — kills the dark white ring-offset halo.
- **S4** — verdict buttons 24px→28px (`w-7 h-7`), resting `opacity-50`→`0.7`, group
  `gap-1`→`gap-1.5`. Higher-affordance primary action, ≥AA target size.
- **S6 (partial)** — row now `cursor-pointer`. *Deferred:* auto-activate row 0 on mount
  (behavioral; left for a focused change) — but a "Speed mode" label now advertises the
  keyboard model (see S7).
- **S7** — keyboard hint: new token-based `Kbd` key-cap component (`--surface-2`/`--border`/
  `--muted`) + an `--accent` "Speed mode" label.
- **S8/S9** — confidence recoded off the verdict palette: `ConfidenceDot`→`ConfidenceBar`,
  a 3-segment **shape** ramp (high=3/med=2/low=1 filled) in neutral `--brand`. No longer
  hue-only (S8) and no longer clashes with include/exclude/uncertain colors (S9).
- **S11** — the three run/criteria/results error messages now render as
  `--danger`/`--danger-bg` blocks with `role="alert"` (announced).
- **S12** — the running/progress container is `role="status" aria-live="polite"` so SR
  users hear screening progress.

No routes, env vars, DB schema. No new tokens (consumes 092's).

## 3. Deferred (intentionally, with reason)
- **S5** (collapse the 3× verdict restatement / row hierarchy) — a structural row redesign;
  higher regression risk and best validated live. Hold for a focused pass.
- **S10** (idle CTA prominence) — designer said validate against the 004 dashboard pass.
- **S6 auto-activate row 0** — behavioral; deferred with S5.

## 4. Verification
- `npx tsc --noEmit` = 0 · `npx eslint components/ScreeningPanel.tsx` = 0.
- Live pixel pass still **blocked** on seed data (003 §"Verification basis"). Recommend
  TESTER/DEV seed one owned `search_results` row with a realistic `screening_result`
  (mixed verdicts, low-confidence, a retraction, some human_decisions, 300+ rows) to close
  S3/S4/S5 `[live-pending]`.

## 5. Wiki updates (librarian)
- `Features/Screening.md` — confidence is now shape-encoded (not the verdict palette);
  verdict controls enlarged; errors/progress announced. Design 003 partially implemented
  (S1/S2/S4/S6p/S7/S8/S9/S11/S12 done; S5/S10 open).
