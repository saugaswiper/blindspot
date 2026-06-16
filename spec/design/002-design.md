# 002 — Auth pages deep-dive (login + signup)

> Designer → Dev handoff. First implementable section pass from the audit ([001](001-design.md)).
> Covers `app/login/page.tsx` and `app/signup/page.tsx` (near-identical; apply to both).
> This pass also **introduces and validates three new tokens** (`--ring`, `--brand-border`,
> `--on-brand`) on a small surface before they roll out app-wide.
> Source of truth: `Architecture/Design Language.md`, `app/globals.css`.
> Date: 2026-06-16 · Verified live: light + dark, 1280px + 375px, focus states inspected.

> **Numbering note:** the 001 roadmap pencilled Auth as "004"; doing it first, so it's the
> next sequential spec (002). Topic→number mapping is flexible — see updated roadmap in 001.

---

## Why this screen first
Self-contained, reachable without auth, fully in the design lane, and it exercises every
new token once so they're proven before the dense surfaces (results/screening) adopt them.

## Current state (verified)
A centered `max-w-md` card on `--background`; serif "Blindspot" wordmark + muted subtitle;
`--surface` card with a segmented mode toggle (login only: Password / Magic Link), labelled
inputs, a primary submit button, and a footer cross-link. Responsive and keyboard-focusable.
Good bones. The problems are all color-token / theming / chrome, not layout.

---

## Findings & design changes

### A1 · Primary button is near-invisible in dark mode  *(audit F2 — the headline fix)*
- **Verified:** submit button computes `background-color: rgb(28,43,58)` (`--brand-surface`)
  with white text. On dark `--surface` (#1a1820) that's ≈**1.2:1**; on `--background`
  (#0f0d14) ≈**1.3:1**. The button only reads via its label — as a shape it disappears.
  Fails WCAG 1.4.11 (3:1 non-text). Light mode (navy on white) is fine.
- **Fix:** give brand-surface buttons a **1px border using the new `--brand-border` token**.
  - Light: `--brand-border` = `--brand-surface` (no visible edge needed; navy-on-cream is
    already ~12:1).
  - Dark: `--brand-border` = **`#62748c`** — chosen to clear 3:1 against *both* `--background`
    (≈4.0:1) and `--surface` (≈3.7:1), so the button has a defined edge on any auth surface.
- **Apply to:** the submit `<button>` and the active segment of the mode toggle (same
  brand-surface fill, same invisibility). Add `border: 1px solid var(--brand-border)` to
  their inline `style`.

### A2 · Focus ring is a hardcoded off-palette blue  *(audit F3 — introduce `--ring`)*
- **Verified:** `focus:ring-[#4a90d9]` appears **8×** across the two files (inputs ×2 each,
  mode toggle, submit, footer link). It's visible but a generic cool blue that clashes with
  the warm navy/gold system.
- **Fix:** introduce **`--ring`** = the accent gold (`--accent`: `#a67c2e` light / `#c49a2e`
  dark). Verified ≥3:1 in all four combos (light: ≈3.4:1 vs bg, ≈3.8:1 vs surface;
  dark: ≈7.3:1 / ≈6.7:1). Replace every `ring-[#4a90d9]` with `ring-[color:var(--ring)]`
  (Tailwind v4 arbitrary value referencing the token).
  - *Alternative if a cooler focus color is preferred:* tokenize a blue as `--ring` instead —
    but use one value driven by the token, not a literal. Gold is my recommendation (palette
    cohesion + it already passes).

### A3 · Focus ring offset paints a WHITE halo in dark mode  *(new — verified)*
- **Verified:** the submit button computes **`--tw-ring-offset-color: #fff`** (Tailwind
  default). With `focus:ring-offset-2`, dark mode draws a 2px white band between the button
  and the ring — a bright halo on a near-black page.
- **Fix:** set the ring-offset color to the page surface so the offset reads as a clean gap
  in both themes. Add `[--tw-ring-offset-color:var(--background)]` (or `var(--surface)` for
  elements sitting on the card) wherever `ring-offset-*` is used, **or** drop `ring-offset-*`
  entirely and rely on the `--ring` ring (now high-contrast). Recommend keeping a 2px offset
  tied to `--surface` for the on-card controls (button, toggle, link) — it reads as
  intentional padding, not a halo.

### A4 · Error message bypasses the status tokens  *(audit F4)*
- **Current:** `text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/20
  dark:border-red-800` — hand-rolled Tailwind reds per theme.
- **Fix:** use the semantic danger pair:
  `style={{ color: "var(--danger)", background: "var(--danger-bg)", border: "1px solid
  var(--danger)" }}` (drop the Tailwind color classes; keep layout classes
  `text-sm rounded px-3 py-2`). Add `role="alert"` so the error is announced (see A8).

### A5 · The page drops global chrome  *(audit F5)*
- **Current:** no NavBar, no theme toggle, and the "Blindspot" wordmark is plain text — a
  user landing on `/login` directly can't get home or switch theme.
- **Fix (lightweight, fits the focused auth layout — do NOT add the full NavBar):**
  1. Make the wordmark a `Link href="/"` (keep the serif `--brand` styling; add the
     `--ring` focus treatment).
  2. Add the existing `ThemeToggle` in the top-right corner of the auth viewport
     (`absolute top-4 right-4`), so theme is switchable here too.

### A6 · `#fff` text on brand-surface is an undeclared constant  *(audit F7 — introduce `--on-brand`)*
- **Current:** active toggle uses `color: "#fff"`; submit relies on `text-white`.
- **Fix:** introduce **`--on-brand`** = `#f4f1ea` (warm off-white; one value, both themes
  since brand-surface is always navy — verified ≈12.8:1 on `#1c2b3a`). Replace `#fff` /
  `text-white` on brand-surface elements with `color: var(--on-brand)`.

### A7 · `focus:border-transparent` is dead (inline border wins)
- **Current:** inputs set `focus:border-transparent` (Tailwind utility) but also
  `border: 1px solid var(--border)` inline — inline specificity wins, so on focus you get
  border **and** ring rather than the intended ring-replaces-border.
- **Fix:** remove `focus:border-transparent` from `inputClass` (it does nothing), and on
  focus switch the inline border to `--ring` for a cleaner single-indicator look — or simply
  keep border + ring (acceptable) and delete the misleading class. Low priority; cosmetic.

### A8 · Success / "check your email" state is flat and dead-ends  *(UX polish)*
- **Current:** magic-link-sent and signup-success render plain centered text with no visual
  affirmation and no next action.
- **Fix:** add a small success affirmation using `--success` (e.g. a check glyph in a
  `--success-bg` circle), and give the user an exit: a "Back to sign in" / "Resend link"
  text button (uses `--ring` focus). Announce the state to AT with `role="status"` /
  `aria-live="polite"`. Keep copy as-is — it's clear (see [ux-copy] below for one tweak).

### A9 · Minor input affordances  *(UX polish, optional)*
- Password field has no show/hide toggle; signup's 8-char rule only surfaces on submit
  (placeholder "Min. 8 characters" is the only hint). Consider a show/hide eye button and an
  inline hint that turns `--success` once ≥8 chars. Optional — flag, don't block.

---

## Microcopy (ux-copy)
- Login subtitle "Sign in to your account" and signup "Create a free account to save your
  searches" are good — keep.
- Magic-link success: change "We sent a sign-in link to {email}" → add a second line
  *"It expires in 1 hour. Didn't get it? Resend."* (pairs with the A8 resend action).
- Error copy comes from Supabase; leave verbatim but render it in the A4 danger style.

## States to implement (both forms)
| State | Treatment |
|-------|-----------|
| Default | brand-surface fill + `--brand-border`, `--on-brand` label |
| Hover | existing `hover:opacity-90` (keep) |
| Focus (keyboard) | `--ring` 2px ring, offset tied to `--surface` (A2/A3) |
| Loading | existing label swap + `disabled:opacity-50` (keep) |
| Error | `--danger`/`--danger-bg` block with `role="alert"` (A4) |
| Success | `--success` affirmation + exit action, `role="status"` (A8) |
| Disabled | existing `disabled:opacity-50 disabled:cursor-not-allowed` (keep) |

## Responsive & dark-mode rules
- Layout already correct at 375px (card shrinks within `px-4`); no change.
- All fixes above are token-based, so both themes flip automatically. The three regressions
  this pass closes are **dark-only** (A1 invisibility, A3 white halo) — verify both themes
  after each change.

## Accessibility checklist (gate)
- [ ] Submit/toggle have a ≥3:1 visible boundary in dark (A1).
- [ ] Focus ring ≥3:1 in both themes, no white halo (A2/A3).
- [ ] Error announced (`role="alert"`); success announced (`role="status"`).
- [ ] Wordmark-as-link and theme toggle are keyboard-reachable with visible `--ring` focus.
- [ ] Inputs keep programmatic label association (already correct via `htmlFor`/`id`).

---

## New tokens introduced here (flag for Librarian → `Design Language.md`)
| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--ring` | `#a67c2e` (= `--accent`) | `#c49a2e` (= `--accent`) | Focus indicator; replaces all `ring-[#4a90d9]` |
| `--brand-border` | `#1c2b3a` (= `--brand-surface`, no visible edge) | `#62748c` | 1px boundary on brand-surface controls so they're visible in dark (WCAG 1.4.11) |
| `--on-brand` | `#f4f1ea` | `#f4f1ea` | Text/icon color on `--brand-surface`; replaces literal `#fff`/`text-white` |

> Dev adds the tokens to `app/globals.css` (`:root`, `html.dark`, and the
> `prefers-color-scheme` block) and maps `--ring`/`--brand-border`/`--on-brand` exactly as
> the existing tokens are mapped. Librarian records them once accepted. These three are
> reused by the later results/screening passes — landing them here first is intentional.
