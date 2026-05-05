# Handoff 056 — NEW-8 Living SR Detection + ACC-15 Source Agreement + ACC-13 Insufficient/Low Borderline + cache.ts wiring fix

**Date**: 2026-05-04
**Previous handoff**: spec/055-handoff.md
**Status**: Implemented and verified (TypeScript clean, ESLint 0 new errors/warnings on changed files)

---

## 1. Summary

Three improvements from `spec/054-market-research.md` (all carry-forward from handoff 055's "Next Steps") plus a quiet fix to a wiring bug introduced in handoff 055:

| ID | Item | Priority | Files changed |
|---|---|---|---|
| NEW-8 | Living systematic review detection + dashboard banner | Medium | `lib/pubmed.ts`, `app/api/search/route.ts`, `lib/cache.ts`, `app/results/[id]/page.tsx`, `components/ResultsDashboard.tsx`, `supabase/migrations/018_living_review_count.sql` (new), `lib/living-reviews.test.ts` (new) |
| ACC-15 | Cross-source confidence indicator (CV-based) | Medium | `lib/source-agreement.ts` (new), `lib/source-agreement.test.ts` (new), `components/ResultsDashboard.tsx` |
| ACC-13 (extended) | Borderline note for Insufficient/Low boundary (count = 2) | Low | `lib/study-design.ts`, `lib/study-design.test.ts` |
| Bugfix | `inplasy_count` was never written to `search_results` (column added in 055 but cache.ts INSERT never updated) | — | `lib/cache.ts` |

---

## 2. NEW-8 — Living Systematic Review Detection

### What it does
Living systematic reviews (LSRs) are continuously updated reviews that incorporate new evidence as it emerges (Cochrane, BMJ, and Campbell all run formal LSR programs). A researcher who identifies a "gap" may not realise an LSR already covers that gap with rolling updates. This feature surfaces the count of LSRs on the topic so they can check before investing in their own review.

### Implementation

**`lib/pubmed.ts`** — added `countLivingReviews(query)` which builds:
```
(<reviewQuery>) AND systematic[sb] AND ("living systematic review"[tiab] OR "living review"[tiab])
```
Critical query-construction details (covered by `lib/living-reviews.test.ts`):
- `[tiab]` is applied to BOTH phrase variants (otherwise the first phrase becomes an unfielded text query)
- `systematic[sb]` is preserved so MEDLINE-classified reviews aren't lost when "living" appears only in body text
- `(reviewQuery)` is wrapped in parens for safe AND-composition with complex boolean queries

**`app/api/search/route.ts`** — new entry in the `Promise.allSettled` batch for `PubMed.countLivingReviews(reviewQuery)`. Failure is logged but never blocks the response (matches all other source patterns).

**`supabase/migrations/018_living_review_count.sql`** — adds `living_review_count integer` column.

**`lib/cache.ts`** — added `living_review_count?: number | null` to both the `saveSearchResult` and `saveGuestSearchResult` data interfaces and to the primary INSERT statements. Added a new fallback tier (strips both migration-017 and migration-018 columns first, then descends to migration-016 fallback) so the route remains robust if production schemas lag.

**`app/results/[id]/page.tsx`** — selects `living_review_count` from the row and passes it as a `livingReviewCount` prop.

**`components/ResultsDashboard.tsx`** — when `livingReviewCount > 0`, renders an informational banner immediately above the cache-freshness indicator with:
- The count and a brief explanation of what living reviews are
- A direct link to the equivalent PubMed search so users can review the LSRs themselves
- Banner styling uses neutral surface colours (not warning colours) — this is information, not a feasibility blocker

**`lib/living-reviews.test.ts`** — 6 unit tests covering query-construction edge cases.

---

## 3. ACC-15 — Cross-Source Confidence Score (Triangulation Quality Indicator)

### What it does
Blindspot now queries up to 4 sources for primary study counts (PubMed, OpenAlex, Europe PMC, Scopus). When all sources return similar counts, the measurement is reliable. When PubMed says 5 and OpenAlex says 500, the query is probably over-broad. The new "Source agreement" badge surfaces this via the **coefficient of variation** (CV = std_dev / mean):

| CV range | Level | Badge |
|---|---|---|
| < 0.30 | `agree` | ✓ Sources agree (emerald) |
| 0.30 ≤ CV < 0.80 | `vary` | ~ Sources vary (amber) |
| ≥ 0.80 | `disagree` | ⚠ Sources disagree (orange) |

CV is dimensionless (normalised by the mean), so a niche topic with 30 studies isn't penalised relative to a broad topic with 3,000.

### Implementation

**`lib/source-agreement.ts`** (new) — three pure helpers:
- `computeCv(counts)` — population standard deviation / mean; returns NaN when n<2 or mean=0
- `classifyCv(cv)` — bucket into `agree | vary | disagree`
- `computeSourceAgreement({ pubmed, openalex, europepmc, scopus })` — full pipeline; returns `null` when fewer than 2 sources contributed (no meaningful agreement to report)

The thresholds (0.30 and 0.80) are exported as named constants for testability.

**`lib/source-agreement.test.ts`** (new) — 18 unit tests covering CV math (population std-dev, NaN handling, all-equal=0, zero-mean=NaN), threshold boundaries, and the full pipeline.

**`components/ResultsDashboard.tsx`** — `SourceBreakdown` now computes the agreement and renders the badge inside the expanded breakdown view (only shows when the user expands "Sources ↓"). The badge palette matches the rest of the design system (emerald / amber / orange) and uses the existing CSS variables for dark-mode parity.

### Why the badge appears in the expanded breakdown rather than always-visible
Source agreement is only meaningful in the context of seeing the per-source counts. Showing it always-visible would create a "what are these sources?" question without immediately providing the answer. Putting it in the expanded breakdown means: when the user is already looking at the per-source numbers, the agreement summary is right there to help them interpret the spread.

---

## 4. ACC-13 — Borderline Note Extended to Insufficient/Low Boundary

### What it does
Handoff 055 added borderline notes for the Low/Moderate (count 5–7) and Moderate/High (count 9–12) boundaries. The Insufficient/Low boundary (3 studies) was missed — a researcher with exactly 2 studies got the bare "primary research needed" message with no hint that one extra study would push them into scoping-review territory.

### Implementation

`lib/study-design.ts` — when `score === "Insufficient"` and `count === 2`, the rationale is appended with:

> *"Note: with 2 primary studies, this topic is one study short of the Low/Insufficient boundary (3 studies). Searching grey literature, conference abstracts, or slightly broadening the population/intervention scope may surface enough additional studies for a scoping review."*

Counts of 0 and 1 don't get the note (too far from the boundary; the standard message is appropriate).

`lib/study-design.test.ts` — 4 new tests covering the new note (present at count=2, absent at counts 0 and 1) plus regression tests for the existing 5/10 boundaries.

---

## 5. Bugfix — `inplasy_count` was never being written

While wiring `living_review_count` through `lib/cache.ts`, I noticed that `inplasy_count` (added in handoff 055) had the same wiring gap: the column was created (migration 017), the search route built it into `searchData`, but `lib/cache.ts`'s `saveSearchResult` / `saveGuestSearchResult` didn't include it in the INSERT statement. TypeScript silently dropped the excess property because `searchData` is a local variable (not an inline literal).

This was a **silent data-loss bug**: every search since handoff 055 stored `inplasy_count = NULL` in the database, which means the dashboard's INPLASY badge has been hidden for all results since 055.

### Fix
- Added `inplasy_count?: number | null` to both data interfaces
- Added `inplasy_count: data.inplasy_count ?? null` to the primary INSERT in both functions
- Added a new fallback tier that strips migration-017 + migration-018 columns first, before descending to the migration-016 fallback

### Why nullable in the type signature
Pre-055 callers (cron-search, anything that doesn't set inplasy_count) continue to work unchanged. The `?? null` coercion ensures the column always gets an explicit NULL rather than a missing property when the caller omits it.

---

## 6. Verification

```
npx tsc --noEmit                                                → clean (0 errors)
npx eslint <changed files>                                      → 0 new errors, 0 new warnings
                                                                  (2 pre-existing warnings in
                                                                   ResultsDashboard.tsx remain — same
                                                                   ones noted in handoff 055)
node /tmp/verify.mjs (manual logic check)                        → all assertions pass
npx vitest run                                                   → blocked by known rollup ARM64
                                                                   binary mismatch (pre-existing,
                                                                   per handoff 055 §7)
npm run build                                                    → same known blocker
```

The pure-logic functions added in this session were also verified independently in a Node script that re-implements them and asserts the expected outputs:
- `computeCv([100,100,100,100])` → 0 ✓
- `computeCv([95,100,105])` → 0.0408 ✓
- `computeCv([5,500])` → 0.9802 ✓
- `computeCv([0,100])` → 1.0 ✓
- `computeCv([0,0,0])` → NaN ✓
- `computeCv([42])` → NaN ✓
- `classifyCv(0/0.30/0.50/0.80/NaN)` → agree/vary/vary/disagree/vary ✓
- Living-review query has `[tiab]` count = 2 ✓
- Living-review query starts with `(<reviewQuery>)` ✓

---

## 7. Migrations to apply to production

In addition to migration 017 (carried forward from handoff 055):

```sql
-- migration 018 — NEW-8 living review count
ALTER TABLE search_results
  ADD COLUMN IF NOT EXISTS living_review_count integer;
```

The cache.ts fallback chain handles missing columns gracefully (the column defaults to NULL), so deployment can proceed before the migration is applied — it just means the LSR banner won't appear until the migration runs.

---

## 8. Next Steps (carry-forward)

1. **Apply migrations 017 + 018** to production Supabase (handoff 055's note still stands).
2. **Set `OPENALEX_API_KEY` in Vercel** (handoff 055 §8 #2).
3. **ACC-12 — Gap Analysis Freshness Indicator** — add `gap_analysis_generated_at` column + "Refresh analysis" button for results older than 6 months. Still recommended; not done in this session.
4. **ACC-14 — MeSH Vocabulary Check on AI-Suggested Titles** — flag non-standard terminology with `⚠ Non-standard term` badge using `esearch(db=mesh)`.
5. **NEW-9 — Evidence Gap Map (matrix tab)** — pure client-side rendering from already-loaded data; medium effort, high impact for institutional users.
6. **NEW-10 — PRISMA-AI checklist in `buildProtocolPrompt()`** — static text addition to prepare for the PRISMA-AI extension.
7. **EuropePMC field-restriction** — still deferred; investigate title/abstract-only query rewriting to reduce the broad-coverage skew that often dominates source disagreement (now visible in ACC-15).
8. **Backfill bug investigation** — the inplasy_count silent-NULL bug means handoff-055 to handoff-056 results have NULL inplasy_count even where the API returned data. Consider whether to re-run those searches or flag them in the UI.
