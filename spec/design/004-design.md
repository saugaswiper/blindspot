# 004 — Results dashboard deep-dive

> Designer → Dev handoff. Covers `components/ResultsDashboard.tsx` (~3,500 lines) — the
> header (query, feasibility, source breakdown, trend) + the five tabs
> (Reviews / Gaps / Design / Map / PRISMA) and their shared badge/chip system.
> Source of truth: `Architecture/Design Language.md`, `app/globals.css`.
> Date: 2026-06-16.

## Verification basis
Result rows are RLS-private (the page 404s anonymously) and I won't mutate the DB to expose
one, so this is **code-grounded** (targeted reads of the color constants, tab nav, header,
and the audit's full hardcode scan) + the dark-mode button/ring patterns verified live in
[002](002-design.md). Items needing the running screen are tagged **[live-pending]** — a
DEV/TESTER can unblock by making one seeded result `is_public` (or I can walk it once
authenticated as an owner).

## The core finding (read this first)
The dashboard hand-rolls an **entire off-token rainbow palette** — emerald, amber, orange,
red, blue, purple, violet, teal, indigo, cyan, pink, green, stone, slate, gray — each with
bespoke `dark:` variants, spread across **nine constant maps**:

| Constant | Line | Role | Kind |
|----------|------|------|------|
| `FEASIBILITY_STYLES` | 46 | High/Moderate/Low/Insufficient | **ordinal** |
| `IMPORTANCE_STYLES` | 69 | high/medium/low | **ordinal** |
| `getAnalysisConfidence` | 85 | 4 confidence tiers | **ordinal** |
| `STUDY_TREND_CONFIG` | 133 | growing/stable/declining | **ordinal** |
| `EGM_CELL_STYLES` | 2157 | high/moderate/low/none heatmap | **ordinal** |
| `RELATED_FEASIBILITY_BADGE` | 1556 | high/moderate/low | **ordinal** |
| `SOURCE_STYLES` | 118 | 6 databases | **categorical** |
| `GAP_TYPE_COLORS` | 1538 | 6 gap dimensions | **categorical** |
| `DIMENSION_CHIP_COLORS` | 2055 | 6 gap dimensions (active/inactive) | **categorical** |

Plus scattered one-offs: the "Key gaps" amber block (1324–1331), "Analyzing…" gray text
(1370), `text-red-600` errors (1396, 2008-area), and the EGM empty-cell tints.

**Why this is the headline:** it's the densest instance of audit **F1**, it's a maintenance
liability (every new state = another hand-tuned dark variant), several pairs are
**contrast-unverified** in dark (e.g. `text-emerald-300` on `emerald-900/30`), and the
saturated rainbow **fights the calm editorial palette** that makes `/about` and the hero
feel credible. A research tool reads as more trustworthy when color is restrained and
*meaningful*.

The fix splits cleanly by **ordinal vs categorical**, because that determines whether
existing tokens suffice or new ones are needed.

---

## D1 · Ordinal/semantic scales → existing semantic tokens  *(no new tokens)*
Every **ordinal** map above encodes good→bad or strong→weak. Map them onto the semantic
pairs the system already ships (and which [003](003-design.md)'s screening panel already
uses correctly):

| Tier | Token |
|------|-------|
| High / good / growing / high-confidence | `--success` + `--success-bg` |
| Moderate / medium / stable | `--warning` + `--warning-bg` |
| Low | `--warning` (or a muted step) |
| Insufficient / none / declining / very-low | `--danger` + `--danger-bg` (or `--muted` where "absent" reads better than "bad") |

- Applies to `FEASIBILITY_STYLES`, `IMPORTANCE_STYLES`, `getAnalysisConfidence`,
  `STUDY_TREND_CONFIG`, `EGM_CELL_STYLES`, `RELATED_FEASIBILITY_BADGE`.
- Replace the Tailwind class strings with inline token styles (the pattern used throughout
  ScreeningPanel: `{ color: "var(--danger)", background: "var(--danger-bg)", border: "1px
  solid var(--danger)" }`).
- **Design nuance:** the 4-step feasibility/confidence scales collapse onto 3 semantic hues.
  Distinguish the two middle steps by **weight/fill**, not a 4th hue (e.g. Low =
  `--warning` outline only; Moderate = `--warning` filled). Keeps it legible and on-palette.
- This single move fixes F1 *and* guarantees dark parity for all ordinal badges. **[live-pending]**
  contrast spot-check after.

## D2 · Categorical scales → design-system decision (new tokens or go neutral)
`SOURCE_STYLES`, `GAP_TYPE_COLORS`, `DIMENSION_CHIP_COLORS` use hue to tell apart **nominal**
categories (6 sources, 6 gap dimensions). The token system has **no categorical palette**,
which is *why* these reached for raw Tailwind. Two viable directions:

- **Option A (recommended) — drop decorative hue, keep it editorial.**
  Sources don't need color to be distinguished (the label "PubMed"/"OpenAlex" already does
  that) — render them as **neutral chips** (`--surface-2` bg, `--border`, `--muted`/
  `--foreground` text), matching the restrained `/about` table. For gap dimensions, keep a
  single **`--accent`** treatment for the *active/selected* filter and neutral for the rest;
  differentiation comes from the label + position, not six hues. This best fits the calm,
  credible aesthetic and needs **no new tokens**.

- **Option B — define a real categorical palette.**
  If product genuinely wants the 6 gap dimensions color-coded (e.g. the Evidence Gap Map
  legend leans on it), introduce a tokenized **`--cat-1 … --cat-6`** set (light + dark,
  each ≥3:1 against `--surface` and AA for text), chosen to harmonize with navy/gold rather
  than a Tailwind rainbow. Then `GAP_TYPE_COLORS`/`DIMENSION_CHIP_COLORS` reference those
  tokens and stay consistent everywhere a dimension appears.

> **Recommendation:** Option A for `SOURCE_STYLES` regardless; for gap dimensions, A unless
> the EGM's usability testing shows the color-coding earns its keep — then B. This is a
> product/design call; flagging both with a default rather than deciding silently.

## D3 · Brand-surface buttons invisible in dark mode  *(audit F2/F7 — apply 002 tokens)*
- **Where:** "Re-run search" (1299), "Run AI Gap Analysis" (1347), "Sign up free to run AI
  analysis" (1363) — `background: var(--brand-surface)` + literal `color: "#f4f1ea"`, no
  border. Same ~1.2:1 dark invisibility proven in auth.
- **Fix:** add `border: 1px solid var(--brand-border)` and swap `"#f4f1ea"` → `var(--on-brand)`.

## D4 · Scattered one-off non-token colors
- "Key gaps identified" block (1324–1331): `amber-50/100 … dark:amber-900` → `--warning` +
  `--warning-bg` (it's a callout, semantic-warning reads right).
- "Analyzing with AI…" meta (1370) `text-gray-500 dark:text-gray-400` → `var(--muted)`.
- Errors `text-red-600` (1396 and the analysis-error spots) → `var(--danger)`; for the
  prominent ones use the `--danger`/`--danger-bg` block + `role="alert"` (per auth A4).
- EGM empty cells (`emerald-50/50 … dark:emerald-950/20`, etc., 2158–2161): fold into the
  D1 ordinal mapping using `-bg` tokens at reduced opacity for "empty".

## D5 · What's already right (keep)
- **Tab navigation** (1402–1416) is fully tokenized — `--foreground`/`--muted` labels with a
  `2px solid var(--accent)` active underline. This is the model; leave it. It also scrolls
  horizontally on mobile (`overflow-x-auto`) — good.
- Header layout, the AI-analysis progress bar (`--accent` on `--surface-2`), and the card
  chrome (`--surface`/`--border`) are correct.

---

## Accessibility checklist (gate)
- [ ] All ordinal badges meet AA text contrast in **both** themes after D1 **[live-pending]**.
- [ ] Categorical chips don't rely on color alone — labels always present (true today; keep).
- [ ] Brand-surface buttons have a ≥3:1 dark boundary (D3).
- [ ] Errors announced where prominent (D4).
- [ ] EGM heatmap cells distinguishable without color (add the count/tier text — verify).

## Responsive / dark-mode
- Most fixes are token swaps that flip automatically. Dark-only wins: D3 buttons + any
  ordinal pair currently failing contrast. **[live-pending]** full 375px sweep of the five
  tabs once a result is viewable.

## Tokens
- D1, D3, D4: **no new tokens** (consume `--success/--warning/--danger` + the three from
  002).
- D2 Option B *only*: propose **`--cat-1 … --cat-6`** (categorical palette, light+dark,
  contrast-checked) — flag for the Librarian if the team chooses B. Recommendation is
  Option A (no new tokens).

## Sequencing note for DEV
This is the largest single cleanup in the app. Suggested order so it's reviewable:
1. D3 (buttons — tiny, shared with 002). 2. D1 ordinal maps (mechanical, high-confidence).
3. D4 one-offs. 4. D2 last (needs the product decision). Each is independently shippable.
