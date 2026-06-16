# 001 — Full-app design audit (sweep)

> Designer → Dev handoff. First pass: a **prioritized findings list** across the app.
> Subsequent specs (`002+`) take one section at a time for deep design + handoff.
> Scope of this doc: identify, ground in evidence, recommend direction + tokens.
> Source of truth: `Architecture/Design Language.md`, `app/globals.css`.
> Date: 2026-06-16 · Themes tested: light + dark · Breakpoints: 375px + 1280px.

## Method
Ran the app (Next dev server) and critiqued the **real rendered UI** with the preview
tools, plus a full-codebase scan for hardcoded colors (the system's #1 rule is "tokens
only, both themes"). Screens reached live: `/` (home), `/about`, `/login`. The
`/results/[id]` dashboard and the screening panel render only from a live Supabase
result row (normally reached via the home-page search), which is currently
**unreachable because the home page crashes** — see F0. Those two surfaces are
therefore deferred to their own passes (002 = results dashboard, 003 = screening
workbench) where they'll get a live, data-driven walkthrough.

## What's already good (keep)
- **`/about` is the aesthetic high-water mark** — warm editorial paper aesthetic, serif
  display heading + eyebrow, fully tokenized table, clean in light **and** dark, scales
  well to 375px. Treat it as the reference for the rest of the app.
- `--muted` body/secondary text passes WCAG AA on `--background` in both themes
  (≈5.4:1 dark, ≈5.1:1 light) and is borderline-pass on `--surface-2` (≈4.8:1 light).
- NavBar, theme toggle, and the data table degrade correctly to mobile.

---

## Priority 0 — Blocker (DEV bug)

### F0 · The home page crashes (whole hero down) — ✅ RESOLVED 2026-06-16
- **Status:** Fixed. `FaviconChip` now uses a plain `<img>` instead of `next/image`,
  removing the unconfigured-host crash. Home page verified rendering in light + dark
  with all source chips present (Scopus correctly falls back to text via the existing
  `naturalWidth` guard). The only residual is an expected `@next/next/no-img-element`
  lint warning, which is acceptable for 14px third-party favicons.
- The original report is retained below for the record. Live walkthroughs of the
  results dashboard (002) and screening workbench (003) are now **unblocked**.
- **Where:** `app/page.tsx` → `components/HeroSourceLogos.tsx:82`.
- **Evidence:** Runtime error "Invalid src prop … hostname `www.google.com` is not
  configured under images" → page falls through to "Application error: a client-side
  exception has occurred." The hero never renders. Affects production, not just dev.
- **Cause:** `FaviconChip` uses `next/image` with a `https://www.google.com/s2/favicons`
  src, but `next.config.ts` defines no `images.remotePatterns`/`domains`.
- **Owner:** DEV (code bug, outside design lane) — spawned as a background task.
- **Design impact:** blocks the landing-page critique and the entire search→results→
  screening flow. Everything downstream of the search box is currently unauditable live.

---

## Priority 1 — Systemic / accessibility gates

### F1 · Two parallel color systems (token system bypassed app-wide)
- **Where:** ~120 hardcoded color occurrences across `components/*` and `app/*`
  (scan: `grep -rnE '#[0-9a-fA-F]{3,8}|rgba?\(' components app`). Worst offenders:
  `ResultsDashboard.tsx`, `PrismaFlowDiagram.tsx`, `InsufficientEvidencePanel.tsx`,
  `FieldExplorer.tsx`, the auth pages.
- **Two off-token families running alongside the canonical tokens:**
  1. **Legacy brand navy `#1e3a5f`** (and focus blue `#4a90d9`) instead of
     `--brand` (`#1c2b3a` / `#8fb8d8`). Note the legacy navy `#1e3a5f` ≠ the canonical
     `--brand` `#1c2b3a` — two slightly different navies ship today.
  2. **Tailwind palette dark overrides** — `dark:text-blue-300`, `dark:bg-blue-700`,
     `dark:border-blue-400`, `dark:hover:bg-blue-900/20`, etc. These hand-roll a
     dark theme per-component instead of letting the tokens flip.
- **Why it matters:** the design language guarantees dark-mode parity *only if* every
  surface uses the variables. Each hardcoded pair is a place parity can (and does, see
  F4) silently break, and the palette drifts (cool Tailwind blue vs. the warm
  navy/gold editorial system).
- **Direction:** replace `#1e3a5f`/`#4a90d9`/`blue-*` usages with `--brand` /
  `--accent` / the new `--ring` (F3). This is large; sequence it per-section as each
  screen gets its deep-dive pass rather than one mega-refactor.

### F2 · Primary CTA is near-invisible in dark mode (non-text contrast fail)
- **Where:** every primary button — `--brand-surface` bg + white/`#f4f1ea` text.
  Seen on `/login` ("Sign in"); same pattern in `ResultsDashboard.tsx:1363`,
  `ScreeningPanel.tsx:1092/1104`, `InsufficientEvidencePanel.tsx:260`, `TopicInput.tsx`.
- **Evidence:** `--brand-surface` (`#1c2b3a`) on dark `--surface` (`#1a1820`) ≈ **1.2:1**;
  on dark `--background` (`#0f0d14`) ≈ **1.3:1**. The button only reads because of its
  white label — as a shape it nearly disappears. Fails WCAG 1.4.11 (3:1 for UI
  component boundaries). Light mode is fine (navy on cream/white = high contrast).
- **Direction (pick one, finalize in the owning section pass):**
  - **(a) Add a hairline boundary in dark mode** — a dedicated `--brand-border` token
    chosen to hit ≥3:1 against `--background` (candidate ≈ `#4a5a6e`; exact value TBD
    in the focused pass), applied as a 1px border on brand-surface buttons in dark.
  - **(b) Lighten the dark button fill** toward ≈`#33485e`+ so the fill itself reaches
    3:1 (changes the navy character more; verify white-text AA is retained).
  - Recommend **(a)** — preserves the navy identity, smallest blast radius.

### F3 · Focus ring is hardcoded and off-palette (no token)
- **Where:** `focus:ring-[#4a90d9]` repeated ~20× (auth pages, `OnboardingTour`,
  `KeyboardShortcutsHelp`, `ResultsDashboard`, `PICOForm`).
- **Evidence:** the ring is *visible* (≈5.8:1 on dark bg, clears the 3:1 focus-indicator
  bar), so this is **consistency + theming**, not a hard a11y fail — but it's a generic
  cool blue that clashes with the warm navy/gold system and is duplicated as a literal.
- **Direction:** introduce a **`--ring`** token (light + dark), verify ≥3:1 against both
  `--background` and `--surface`, and replace every `ring-[#4a90d9]`. Likely derive from
  `--accent` (gold) or `--brand` so focus reads as part of the brand.

### F4 · Status surfaces have no dark-mode variant (parity break)
- **Where:** `InsufficientEvidencePanel.tsx` (`#fef2f2`/`#fee2e2`/`#991b1b`/`#7f1d1d`
  inline, theme-independent), `PrismaFlowDiagram.tsx` summary boxes
  (`lines 449–461`: `#059669`/`#d97706`/`#dc2626` + `rgba(...)` fills, no dark path —
  note the *screen* PRISMA diagram has `.dark` overrides in `globals.css`, but these
  inline summary tiles do not), `FieldExplorer.tsx:13–16` feasibility colors
  (`#22c55e`/`#f59e0b`/`#ef4444`/`#6b7280`).
- **Why it matters:** the system already ships semantic pairs
  (`--success`/`--success-bg`, `--danger`/`--danger-bg`, `--warning`/`--warning-bg`)
  designed to flip with the theme. These components ignore them, so in dark mode you get
  light-red/green tiles punched into a near-black page (jarring; inconsistent with
  Screening verdict styling which *does* use the tokens), and the saturated Tailwind
  greens/ambers don't match the warm editorial status palette.
- **Direction:** map all status fills/borders/text to the `--success/-bg`, `--danger/-bg`,
  `--warning/-bg` tokens. Reconcile `FieldExplorer`'s 4-level feasibility scale to the
  3 semantic tokens + `--muted` (Insufficient).

---

## Priority 2 — Polish / smaller scope

### F5 · Auth pages drop the global chrome
- **Where:** `/login`, `/signup`. No `NavBar` (no theme toggle, no nav back), and the
  "Blindspot" wordmark is plain text, **not a link home**. A user who lands on
  `/login` directly has no obvious way back to the marketing/app surface or to switch
  theme. Minor but cheap to fix in the auth pass.

### F6 · Mobile data table requires horizontal scroll
- **Where:** `/about` §1 Data Sources at 375px shows 2 of 3 columns; the COVERAGE
  column is off-screen behind a horizontal scroll. This matches the documented
  "tables scroll-wrap on small screens" behaviour, so it's **acceptable as-is** — note
  only: a stacked card layout per source would read better on phones. Low priority.

### F7 · `--on-brand` text color is an undeclared constant
- **Where:** text on `--brand-surface` is written as literal `#f4f1ea` / `#fff` in
  ~10 places (`page.tsx`, `NavBar.tsx:71`, `ResultsDashboard.tsx`, `ScreeningPanel.tsx`,
  `InsufficientEvidencePanel.tsx`, `FieldExplorer.tsx`). It works (brand-surface is
  always dark navy), but it's an implicit token. Promote to **`--on-brand`** so the
  "text that sits on navy" decision lives in one place.

---

## Proposed new tokens (flagged for the Librarian → `Design Language.md`)
These are introduced by P1 fixes and should be documented with light + dark values:

| Token | Purpose | Notes |
|-------|---------|-------|
| `--ring` | Focus-indicator color (F3) | Replace all `ring-[#4a90d9]`; ≥3:1 vs `--background` and `--surface` in both themes |
| `--brand-border` | Dark-mode boundary for brand-surface buttons (F2, option a) | Dark-only; ≈3:1 vs `--background`; exact value set in the owning pass |
| `--on-brand` | Text color on `--brand-surface` (F7) | Replaces literal `#f4f1ea`/`#fff`; one value, both themes |

> Per the role split, the **Dev** implements; the **Librarian** records any accepted new
> token in `Architecture/Design Language.md`. This doc only *proposes* them.

---

## Section-by-section roadmap (specs numbered in creation order)
1. ✅ **002 — Auth (login/signup)** (`app/login`, `app/signup`): DONE. Self-contained,
   reachable; lands F2 (button), F3 (ring), F5 (chrome), F7, and **introduces the three
   new tokens** (`--ring`, `--brand-border`, `--on-brand`) on a small surface first.
2. ✅ **003 — Screening workbench** (`ScreeningPanel.tsx`): DONE (code-grounded; live
   pixel-walk pending seeded owned data — panel is `isOwner`-gated + no saved results in
   DB). Findings: verdict target size/hierarchy, color-only confidence, retraction-badge
   tokenization, ring-offset halo, brand-surface buttons.
3. ✅ **004 — Results dashboard** (`ResultsDashboard.tsx`): DONE (code-grounded; live
   tab sweep [live-pending] — rows are RLS-private). Core finding: 9 off-token rainbow
   constant maps → split ordinal (→ existing semantic tokens) vs categorical (design-
   system decision: go neutral [rec] or add `--cat-1..6`). Plus brand-surface buttons.
4. ✅ **005 — Status components** (`InsufficientEvidencePanel`, `PrismaFlowDiagram`,
   `FieldExplorer`): DONE. Lands F4 (light-only status surfaces → semantic tokens) + two
   verified contrast bugs in FieldExplorer (white-on-accent AA fail → new `--on-accent`;
   `--brand` misused as a button bg). FieldExplorer verified live; IE/PRISMA [live-pending].
5. ✅ **006 — Landing page** (`app/page.tsx`, `TopicInput`, `HeroSourceLogos`,
   `OnboardingTour`): DONE. Verified live. Hero "always-navy island" literals → `--on-brand`;
   TopicInput primary button (F2) + errors + missing focus rings (F3); folds in the
   FieldExplorer button bugs. No new tokens.

**Program complete** — all 6 specs written. See 006 for the consolidated new-token table
and recommended DEV implementation order.

> The three new tokens from 002 are reused by 003–006 — landing them in the auth pass
> first is intentional so the dense surfaces can just consume them.
