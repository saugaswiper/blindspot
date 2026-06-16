# 005 — Status components deep-dive

> Designer → Dev handoff. Covers the three components flagged in audit **F4** for broken
> dark-mode parity: `components/InsufficientEvidencePanel.tsx`,
> `components/FieldExplorer.tsx`, `components/PrismaFlowDiagram.tsx`.
> Source of truth: `Architecture/Design Language.md`, `app/globals.css`.
> Date: 2026-06-16.

## Verification basis
- `FieldExplorer` is reachable live (home page "Explore a research field" card) — its dark
  Explore button was **inspected live** (`background rgb(196,154,46)` + `color rgb(255,255,255)`).
- `InsufficientEvidencePanel` (renders only on an Insufficient result) and
  `PrismaFlowDiagram` (PRISMA tab) need an owned/seeded result — **[live-pending]** — so
  those are code-grounded (full reads + the audit hardcode scan).

## The shared problem
All three reach outside the token system for status color, and unlike the screening panel
(which uses `--success/--danger/--warning`), they use **raw hexes / Tailwind palette values
with no dark variant**. In dark mode this produces pale pastel chips and — worst case — a
**light-pink header band welded onto a dark surface**. The system already has the right
tokens; these components just predate the discipline.

---

## InsufficientEvidencePanel — the worst F4 offender

### IE1 · Light-only red header band (no dark variant at all)
- **Where:** the header band `:193` (`background:#fef2f2`, `borderBottom:#fecaca`), the icon
  `:197` (`#fee2e2`/`#991b1b`), heading `:203` (`#7f1d1d`), body `:206` (`#991b1b`),
  footnote `:209` (`#b91c1c`). All theme-independent.
- **Effect:** in dark mode a bright pink band sits on top of the dark `--surface` body — a
  hard break in the editorial dark theme on a high-stakes "this review isn't feasible" panel.
- **Fix:** use the danger pair (which has real dark values — `--danger` `#e09181` /
  `--danger-bg` `#33201c` in dark):
  band `background:var(--danger-bg)`, `borderBottom:1px solid var(--danger)`; icon
  `background:var(--danger)`, `color:var(--on-brand)` (or `--danger-bg`); heading/body
  `color:var(--danger)`; footnote `color:var(--danger)` at `opacity:0.85`.

### IE2 · `FEASIBILITY_BADGE` map is light-only hardcodes  *(:19–36)*
- High `#d1fae5`/`#065f46`, Moderate `#fef3c7`/`#92400e`, Low `#ffedd5`/`#9a3412`,
  Insufficient `#fee2e2`/`#991b1b` — no dark variants.
- **Fix:** map ordinally to semantic tokens (same rule as dashboard D1): High→`--success`,
  Moderate→`--warning`, Low→`--warning` (outline variant), Insufficient→`--danger`, each as
  `{background:var(--*-bg), color:var(--*), border:1px solid var(--*)}`.

### IE3 · "Search" button brand-surface invisibility  *(:260 — audit F2/F7)*
- `background:var(--brand-surface)` + literal `#f4f1ea`. Add `border:1px solid
  var(--brand-border)`, swap to `var(--on-brand)`.

---

## FieldExplorer — contrast bugs beyond F4 (verified)

### FE1 · "Explore" button: white text on accent gold fails AA  *(:228 — verified live)*
- **Verified:** `#c49a2e` bg + `#fff` text ≈ **2.6:1** in dark (≈3.8:1 light) — fails AA
  (needs 4.5:1 for this 14px text) in **both** themes, worse in dark.
- **Fix:** put **dark text on the gold**, not white. Introduce **`--on-accent`** = the brand
  navy (`#1c2b3a`) — `#1c2b3a` on `#a67c2e` ≈ 6.1:1 (light), on `#c49a2e` ≈ 4.9:1 (dark) —
  both pass. Apply wherever a button uses `--accent` as fill (DEV: grep `var(--accent)` +
  `#fff`/`text-white`; at least this button + check `OnboardingTour`).

### FE2 · "Search this topic" button misuses `--brand` as a background  *(:84)*
- `background:var(--brand)` + `#fff`. But `--brand` is **light blue `#8fb8d8` in dark mode**
  (the design language defines `--brand` as a *text* color on dark, `--brand-surface` as the
  *background*). So in dark this is a pale-blue button with white text → low contrast and
  off-spec.
- **Fix:** use `background:var(--brand-surface)`, `color:var(--on-brand)`, `border:1px solid
  var(--brand-border)` — the standard primary-button recipe.

### FE3 · `FeasibilityDot` ordinal colors are raw Tailwind  *(:12–16)*
- `#22c55e`/`#f59e0b`/`#ef4444`/`#6b7280` via a nice `color-mix` bg/border technique.
- **Fix:** keep the `color-mix` approach, swap the source to tokens: High→`var(--success)`,
  Moderate→`var(--warning)`, Low→`var(--danger)`, Insufficient→`var(--muted)`. (Aligns with
  the dashboard ordinal rule and inherits dark values for free.)

### FE4 · Error text `#ef4444`  *(:236)* → `var(--danger)`.

---

## PrismaFlowDiagram — dual system (CSS classes OK, inline styles not)

The flow-diagram **boxes** use `.prisma-*` classes in `globals.css` that *do* have `.dark`
overrides — acceptable (secondary cleanup below). The problem is the **inline-styled**
summary/legend/banner elements, which have **no dark handling**:

### PR1 · Screening summary tiles  *(:449–461)*
- Included `rgba(16,185,129,0.08)`/`#059669`, Uncertain `rgba(245,158,11,0.08)`/`#d97706`,
  Excluded `rgba(239,68,68,0.08)`/`#dc2626` — fixed, no dark variant.
- **Fix:** `--success/-bg`, `--warning/-bg`, `--danger/-bg`. (Mirrors the screening panel's
  own counts, which already use these — consistency win across the PRISMA + Screening views.)

### PR2 · Inline category tints & banners
- Process/source tints `:276–293` (`rgba(99,102,241,…)`, `rgba(34,197,94,…)`), the
  included/excluded chips `:361–362`, and the red/amber warning banners `:478–480`,
  `:523–548` all use raw rgba + hexes (`#065f46`, `#7f1d1d`, `#b91c1c`, `#92400e`) with no
  dark path.
- **Fix:** route through semantic tokens; warnings → `--warning`/`--warning-bg`, errors/
  excluded → `--danger`/`--danger-bg`, included → `--success`/`--success-bg`.

### PR3 · Text-on-brand opacities  *(:636–648)*
- `rgba(244,241,234,0.55–0.7)` for text on brand-surface → `var(--on-brand)` at matching
  `opacity` (consume the 002 token).

### PR4 · Legacy navy fallback `#1e3a5f`  *(:39, :44, :277, :293, :335…)*
- `var(--brand, #1e3a5f)` etc. — harmless as a fallback, but it's the legacy navy ≠ canonical
  `--brand`. Drop the literal fallbacks (the tokens always exist).

### PR5 (secondary) · Tokenize the `.prisma-*` palette in `globals.css`
- The diagram boxes use literal `#93c5fd`/`#eff6ff`/`#16a34a`/`#f87171` (+ `.dark`
  overrides). They adapt, so lower priority — but folding them onto the semantic + a future
  categorical palette would finish the job. Defer unless doing a full globals.css pass.

---

## Accessibility checklist (gate)
- [ ] No light-only status surfaces remain — every status block has a real dark value (IE1/IE2/PR1/PR2).
- [ ] `--accent` buttons use dark text (`--on-accent`), ≥4.5:1 both themes (FE1).
- [ ] No `--brand` used as a background fill anywhere (FE2).
- [ ] Brand-surface buttons have a dark boundary (IE3/FE2 via `--brand-border`).
- [ ] Ordinal status contrast re-checked in dark after token swap **[live-pending]** for IE/PR.

## Tokens
- Consumes the 002 set (`--brand-border`, `--on-brand`) + existing semantic tokens.
- **Proposes one new token:** **`--on-accent`** = `#1c2b3a` (both themes; dark navy text for
  use on `--accent` gold fills). Flag for the Librarian → `Design Language.md`. This pairs
  with `--on-brand` to complete the "text-on-colored-fill" set.

## Note for the categorical decision (links to 004 D2)
`PrismaFlowDiagram`'s process/source tints (PR2) and `.prisma-*` box hues (PR5) are
*categorical*, so they hit the same open question as dashboard D2 (go neutral vs add
`--cat-*`). Resolve D2 first; PR2/PR5 should follow whatever's chosen there.
