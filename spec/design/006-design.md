# 006 — Landing page deep-dive

> Designer → Dev handoff. Covers `app/page.tsx`, `components/TopicInput.tsx`,
> `components/HeroSourceLogos.tsx`, and the landing-only chrome (`OnboardingTour`).
> Source of truth: `Architecture/Design Language.md`, `app/globals.css`.
> Date: 2026-06-16 · Verified live: light + dark, 1280px + 375px (home page now renders
> after the F0 fix).

## Verdict
The landing page is the **strongest screen after `/about`** — editorial serif hero, gold
accent on navy, restrained source row, clean "how it works" and two-card search/explore
layout that stacks well at 375px. It's mostly tokenized. The remaining work is (a) the
recurring brand-surface/`--brand` button issues and (b) the hero's hardcoded "always-navy
island" colors. No structural/layout changes needed.

## Concept: the hero is an "always-dark island"
The hero `<section>` uses `background: var(--brand-surface)` (always navy, both themes), so
its foreground colors are intentionally **theme-independent**. That's correct — but they're
written as **literals** instead of tokens. The fix is to consume the on-dark tokens from
002/005 here, not to make them theme-reactive.

---

## Findings & changes

### L1 · Hero text literals → `--on-brand`  *(audit F7)*
- **Where:** section `:16` (`color:#f4f1ea`), headline `:32` (`#f4f1ea`), subhead `:41`
  (`#e8e4dc` @ opacity 0.8), eyebrow `:50` (`rgba(244,241,234,0.35)`).
- **Fix:** all → `var(--on-brand)` at the respective opacities (the off-white is the same
  warm `#f4f1ea` the token defines). Contrast is already fine (off-white on navy ≈12.8:1).

### L2 · Hero accent `#c49a2e` is the on-dark gold  *(:36 — low priority)*
- The em "no one's written yet" hardcodes `#c49a2e`. This is the **dark** `--accent` value,
  chosen because the hero is always navy (the light `--accent` `#a67c2e` would be lower
  contrast on navy). Verified ≈5.5:1 on navy — fine.
- **Fix (optional):** since brand-surface islands always need the *dark-theme* gold, either
  keep the literal with a comment, or — cleaner long-term — let the on-dark accent live in a
  token. Defer unless the team wants a formal "on-brand accent" convention; `--on-brand`
  covers the high-frequency case.

### L3 · `HeroSourceLogos` chip color literal  *(F0/F7 follow-up)*
- **Where:** `HeroSourceLogos.tsx:80,108` — `color:"rgba(244,241,234,0.5)"`.
- **Fix:** `var(--on-brand)` @ `opacity:0.5`. (Pairs with the F0 favicon fix already shipped
  — finish the chip's tokenization in the same touch.)

### L4 · `TopicInput` primary button invisible in dark  *(audit F2/F7 — verified)*
- **Where:** `TopicInput.tsx:300–301` — "Find Research Gaps", `background:var(--brand-surface)`
  + `color:"#f4f1ea"`, no border. **Verified** near-invisible in dark on both desktop and
  375px.
- **Fix:** add `border:1px solid var(--brand-border)`, swap to `var(--on-brand)`. (Note the
  loading state swaps bg to `var(--muted)` — keep, but apply the same border for consistency.)

### L5 · `TopicInput` error color hardcoded  *(:184, :200, :290)*
- `#dc2626` (input underline + two error texts) → `var(--danger)`.

### L6 · Focus indicators missing on the hero's interactive controls  *(audit F3)*
- **Where:** `TopicInput` mode-toggle (`:124`), submit (`:295`), and the year `<select>`
  have **no focus-visible styling** (the text input only changes its underline). Keyboard
  users get no clear focus on the page's primary actions.
- **Fix:** apply the `--ring` focus treatment (from 002) to these buttons/select. This is the
  landing page's most concrete a11y gap.

### L7 · FieldExplorer buttons (cross-ref 005, they render here)
- The "Explore" (white-on-accent, **AA fail**) and "Search this topic" (`--brand` misused as
  a background) bugs from [005](005-design.md) FE1/FE2 are **on this page**. Fixing 005 fixes
  them here; calling out so the landing pass verifies them in context.

### L8 · OnboardingTour modal is off-token  *(landing-only chrome)*
- **Where:** `OnboardingTour.tsx` — text `rgba(255,255,255,0.65)` (`:74,:81,:153…`) and
  `focus:ring-[#4a90d9]` (`:153,:163,:173,:372`). The modal sits on `--brand-surface`.
- **Fix:** text → `var(--on-brand)` at opacity; focus rings → `--ring`. Same recipe as the
  rest of the app.

### L9 · Card shadows are inert in dark (informational, no action)
- The search/explore cards use `boxShadow: rgba(0,0,0,0.08)` (`page.tsx:70,85`) which does
  nothing on the dark page; they rely on `--border` + the `-mt-8` float over the hero. This
  reads fine in both themes (verified) — **no change needed**, noted so it isn't "fixed"
  into a glow.

---

## Accessibility checklist (gate)
- [ ] Hero primary CTA has a ≥3:1 dark boundary (L4).
- [ ] Focus-visible on mode toggle, submit, year select, tour buttons via `--ring` (L6/L8).
- [ ] Errors use `--danger` (L5).
- [ ] FieldExplorer button contrast fixed (L7 → 005).

## Tokens
No new tokens. **Consumes** `--on-brand`, `--brand-border`, `--ring` (002) and `--on-accent`
(005). The optional L2 "on-brand accent" is the only thing that *could* become a token if the
team wants the convention — recommend deferring.

---

# Audit program — wrap-up

All six planned passes are written:

| Spec | Surface | Status |
|------|---------|--------|
| [001](001-design.md) | Full-app audit + roadmap | ✅ |
| [002](002-design.md) | Auth (login/signup) | ✅ — introduces `--ring`, `--brand-border`, `--on-brand` |
| [003](003-design.md) | Screening workbench | ✅ (code-grounded; live pixel-walk [live-pending]) |
| [004](004-design.md) | Results dashboard | ✅ — ordinal→tokens vs categorical decision (D2) |
| [005](005-design.md) | Status components | ✅ — introduces `--on-accent` |
| [006](006-design.md) | Landing page | ✅ |

## Consolidated new tokens for the Librarian → `Design Language.md`
| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--ring` | `#a67c2e` | `#c49a2e` | Focus indicator (replaces all `#4a90d9` rings) |
| `--brand-border` | `#1c2b3a` | `#62748c` | Boundary on brand-surface buttons (dark visibility) |
| `--on-brand` | `#f4f1ea` | `#f4f1ea` | Text/icons on `--brand-surface` |
| `--on-accent` | `#1c2b3a` | `#1c2b3a` | Text on `--accent` gold fills |
| `--cat-1…6` | TBD | TBD | **Only if** 004 D2 chooses Option B (categorical palette) |

## Open decisions for the team (non-blocking)
1. **004 D2** — categorical color: go neutral (recommended) vs add `--cat-1…6`.
2. **002 A2** — `--ring` gold vs a cool focus color (gold recommended).
3. Implementation: per role split, the **main DEV** lands all of the above; the **Librarian**
   records accepted tokens. Recommended DEV order: 002 (tokens + auth) → 005 → 006 → 004 →
   003, since each consumes tokens proven by the earlier ones.
