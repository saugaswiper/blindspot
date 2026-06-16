# Handoff 092 — Implement design 002 (auth pages) + 003 S3 (retraction badge)

**Date**: 2026-06-16
**Previous handoff**: spec/091-handoff.md
**Implements**: `spec/design/002-design.md` (auth pages, full) and `spec/design/003-design.md` finding **S3** (retraction badge legibility)

---

## 1. Summary
Implemented the designer's auth-page pass and the one trivial high-value screening fix.
Introduced the three shared tokens 002 defines (`--ring`, `--brand-border`, `--on-brand`),
proven first on the small auth surface before the dense surfaces adopt them. Closes the
three dark-only WCAG regressions on login/signup (invisible brand button, off-palette focus
ring, white ring-offset halo) and the illegible dark-mode retraction badge.

**Status**: ✅ tsc clean · ✅ eslint clean (changed files) · ✅ verified live in preview
(light + dark). Not committed.

## 2. New tokens (FLAG FOR LIBRARIAN → `Architecture/Design Language.md`)
Added to all three blocks in `app/globals.css` (`:root`, `html.dark`, `prefers-color-scheme`):

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--ring` | `#a67c2e` (= `--accent`) | `#c49a2e` (= `--accent`) | focus indicator; replaces `ring-[#4a90d9]` |
| `--brand-border` | `#1c2b3a` (= `--brand-surface`) | `#62748c` | 1px edge on brand-surface controls so they're visible in dark (WCAG 1.4.11) |
| `--on-brand` | `#f4f1ea` | `#f4f1ea` | text/icon on `--brand-surface`; replaces `#fff`/`text-white` |

Used via inline `style` (`var(--brand-border)`, `var(--on-brand)`) and Tailwind arbitrary
values (`ring-[color:var(--ring)]`, `[--tw-ring-offset-color:var(--surface)]`); no `@theme`
entries needed.

## 3. Files touched
| File | Change |
|---|---|
| `app/globals.css` | +3 tokens × 3 theme blocks |
| `app/login/page.tsx` | A1 button border, A2 ring→`--ring`, A3 offset color, A4 danger error + `role="alert"`, A5 wordmark→`Link` + `ThemeToggle`, A6 `--on-brand`, A7 dropped dead `focus:border-transparent`, A8 magic-link success affirmation + exit + `role="status"` |
| `app/signup/page.tsx` | same A1–A8 (no mode toggle); success state mirrors login |
| `components/ScreeningPanel.tsx` | S3 `RetractionBadge` → danger tokens, 2px border to stay distinct from reason-code badge |

No routes, env vars, or DB schema.

## 4. User-facing behavior
- Login/signup: brand button + active toggle now have a visible edge in dark; focus rings
  are warm gold and offset reads as a clean gap (no white halo); errors use the danger
  palette and are announced; success states show a `--success` check + a way back;
  wordmark links home; theme toggle available on the auth screens.
- Screening: retracted/withdrawn badge is legible in dark mode.

## 5. Verification
- `npx tsc --noEmit` clean; `npx eslint` clean on changed `.tsx`.
- Preview (Next dev, :3000): `/login` rendered light + dark, no console errors. Submit
  button computed `bg #1c2b3a / color #f4f1ea / border = --brand-border` (light edge in dark).
- Not pixel-verified: signup success state and the screening retraction badge live
  (screening needs a seeded owned `screening_result` row — same blocker noted in 003).

## 6. Wiki updates (librarian)
- `Architecture/Design Language.md` — add `--ring`, `--brand-border`, `--on-brand` to the
  token table (values above).
- `spec/design/002` is now implemented; 003 S3 done (S1/S2/S4 still open).

## 7. Not addressed
- 003 S1/S2 (screening brand buttons / ring-offset) and S4 (verdict button target size) —
  bigger, deferred.
- 002 A9 (password show/hide) — flagged optional by the designer; skipped.
