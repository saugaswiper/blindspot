# Handoff: Deduplication Count Transparency
**Date:** 2026-03-30
**Session tool:** Automated daily-improver agent
**Written by:** Blindspot daily-improver agent

---

## What Was Built

Implemented **Deduplication Count Transparency** — improvement NEW-4 from `spec/008-market-research-update.md` and the #2 recommended feature from `spec/016-handoff.md`.

The search pipeline has always deduplicated systematic reviews across PubMed, OpenAlex, Europe PMC, and Semantic Scholar by title, DOI, and PMID — but the number of duplicates removed was never counted, stored, or shown. Users viewing the PRISMA flow diagram had no way to see how many cross-database overlaps existed, making the diagram non-compliant with the PRISMA 2020 standard's "Records removed before screening: Duplicate records removed" box.

Blindspot now:
- **Counts** the true number of cross-database duplicates removed during every search (before the 50-record display cap, so the count reflects real overlap)
- **Stores** this count in a new `deduplication_count` column in `search_results`
- **Displays** it in the PRISMA Flow tab as a proper "Duplicates removed" side box with a "Records identified" total above it
- **Includes** it in the printable PDF report

---

## Why This Feature

**PRISMA 2020 compliance**: The PRISMA 2020 standard explicitly requires a "Duplicate records removed" box in the identification-to-screening transition. Without a deduplication count, researchers cannot use Blindspot's PRISMA diagram in their actual review protocols without manually looking up cross-database overlap.

**Trust signal**: Showing "47 records identified → 5 duplicates removed → 42 screened" is more credible than just "42 screened". It demonstrates that Blindspot is doing real deduplication work, not just reporting one database's results.

**Unblocks true PRISMA accuracy**: The market research update (`spec/008-market-research-update.md`) explicitly flagged dedup transparency as a prerequisite for proper PRISMA 2020 compliance. It is now fully addressed.

**Zero repeated cost**: The count is computed once during the search pipeline. No additional API calls, no Gemini usage, no extra DB queries on page load.

**Backward compatible**: All pre-migration rows have `deduplication_count = NULL`. The UI detects NULL and falls back gracefully to the previous "After deduplication" single-box layout — no broken diagrams for old results.

---

## Files Created / Modified

```
supabase/migrations/007_deduplication_count.sql   — NEW: ALTER TABLE adds deduplication_count integer column

app/api/search/route.ts                           — MODIFIED:
                                                      1. dedupeReviews() now returns DedupeResult
                                                         { reviews, totalIdentified, deduplicationCount }
                                                         instead of ExistingReview[]
                                                      2. Call site destructures the new shape
                                                      3. Passes deduplication_count to saveSearchResult

lib/cache.ts                                      — MODIFIED (5 changes):
                                                      1. CachedSearchResult gets deduplication_count field
                                                      2. getCachedResult SELECT includes deduplication_count
                                                      3. getCachedResult return maps the new field
                                                      4. saveSearchResult data param includes deduplication_count
                                                      5. INSERT now tries with deduplication_count first;
                                                         fallback chain extended to handle 42703 gracefully

lib/prisma-diagram.ts                             — MODIFIED:
                                                      1. PrismaData interface gets deduplicationCount field
                                                      2. computePrismaData accepts optional deduplicationCount param
                                                      3. Return value includes deduplicationCount

lib/prisma-diagram.test.ts                        — MODIFIED: 6 new test cases for deduplicationCount

app/results/[id]/page.tsx                         — MODIFIED:
                                                      1. SELECT includes deduplication_count
                                                      2. Passes deduplicationCount prop to ResultsDashboard

components/ResultsDashboard.tsx                   — MODIFIED (5 changes):
                                                      1. Props interface gets deduplicationCount field
                                                      2. Function destructures deduplicationCount = null
                                                      3. PrismaFlowTab call passes deduplicationCount
                                                      4. PrismaFlowTab accepts + computes hasDedupData / totalIdentified
                                                      5. PrintableReport call passes deduplicationCount

components/PrintableReport.tsx                    — MODIFIED:
                                                      1. Props interface gets deduplicationCount field
                                                      2. Function destructures deduplicationCount = null
                                                      3. computePrismaData call passes deduplicationCount
                                                      4. Adds "Records identified" box and "Duplicates removed" note

app/globals.css                                   — MODIFIED: Added .prisma-box-excluded (red/pink style
                                                      for the "Duplicates removed" side box)
```

---

## Data Flow

```
User searches a topic
    ↓
POST /api/search
    ↓
dedupeReviews(pubmedReviews, openalexReviews, europepmcReviews, semanticScholarReviews)
    ↓
Returns { reviews, totalIdentified, deduplicationCount }
  where deduplicationCount = totalIdentified - unique.length  ← measured before 50-cap
    ↓
saveSearchResult({ ..., deduplication_count: deduplicationCount })
    ↓
INSERT INTO search_results (... deduplication_count = N)

─── On page load ─────────────────────────────────────────────────────────────
SELECT deduplication_count FROM search_results WHERE id = ?
    ↓
ResultsDashboard(deduplicationCount = N | null)
    ↓
PrismaFlowTab(deduplicationCount = N | null)
    ↓
  if deduplicationCount !== null:
      hasDedupData = true
      totalIdentified = reviewsRetrieved + deduplicationCount
      Shows: "Records identified: n = X"  (above arrow)
             "After deduplication: n = Y"  (main screening box)
             "Duplicates removed: n = Z"   (red side box)
  else:
      hasDedupData = false
      Shows: single "After deduplication" box (pre-016 layout)
```

---

## UI Changes: PRISMA Flow Tab

### Before (all results, including new ones before 007 migration):
```
IDENTIFICATION
  [PubMed] [OpenAlex] [Europe PMC] [Semantic Scholar]
  ↓
SCREENING
  [After deduplication / Records screened: n = 42]
  ↓
INCLUDED
  [Systematic reviews retrieved: n = 42]
```

### After (new results after 007 migration applied):
```
IDENTIFICATION
  [PubMed] [OpenAlex] [Europe PMC] [Semantic Scholar]
  [Records identified: n = 47]     ← NEW: total before dedup
  ↓
SCREENING
  [After deduplication: n = 42]    [Duplicates removed: n = 5]  ← NEW side box
  ↓
INCLUDED
  [Systematic reviews retrieved: n = 42]
```

The side box uses a red/pink `prisma-box-excluded` style (matching PRISMA 2020 convention of red for excluded/removed records).

---

## Database Migration

**File:** `supabase/migrations/007_deduplication_count.sql`

```sql
ALTER TABLE search_results
  ADD COLUMN IF NOT EXISTS deduplication_count integer;
```

- **Nullable**: NULL for all pre-migration rows. The UI treats NULL as "no dedup data" and renders the original layout unchanged.
- **No RLS change needed**: The column inherits existing `search_results` RLS policies.
- **No index needed**: Read once per page load for a single known `id`.
- **Safe additive migration**: `ADD COLUMN IF NOT EXISTS` is idempotent and safe to run on a live database.

**Must be applied** in Supabase Dashboard → SQL Editor before deploying.

---

## `dedupeReviews` — New Return Shape

```typescript
// Before:
function dedupeReviews(...sources: ExistingReview[][]): ExistingReview[]

// After:
interface DedupeResult {
  reviews: ExistingReview[];        // capped at 50 for display
  totalIdentified: number;          // sum of all source lengths (before dedup)
  deduplicationCount: number;       // totalIdentified - unique.length (before cap)
}
function dedupeReviews(...sources: ExistingReview[][]): DedupeResult
```

Key design decision: `deduplicationCount` is computed from `unique.length` (full deduplicated set) **before** the `.slice(0, 50)` display cap. This means the count accurately reflects true cross-database duplicates, not records removed by the display cap.

---

## Smoke Test Results (27 checks via Node.js)

Pure function tests run directly with `node --experimental-transform-types`:

**`lib/prisma-diagram.ts` (14 checks):**
- deduplicationCount defaults to null ✓
- reviewsRetrieved is 0 for empty reviews ✓
- deduplicationCount = 7 preserved ✓
- deduplicationCount = 0 preserved ✓
- deduplicationCount = null explicitly ✓
- totalIdentified = reviewsRetrieved + deduplicationCount math ✓
- clinicalTrialsCount preserved with dedup ✓
- prosperoCount preserved with dedup ✓
- deduplicationCount preserved alongside other counts ✓
- backward compat: databasesSearched still 4 ✓
- backward compat: deduplicationCount null when omitted ✓
- hasPrismaData returns true with dedup data ✓
- formatCount(null) = N/A ✓
- formatCount(0) = 0 ✓

**`dedupeReviews` logic (13 checks):**
- no duplicates: deduplicationCount = 0 ✓
- no duplicates: totalIdentified = 3 ✓
- no duplicates: reviews.length = 3 ✓
- 1 PMID-duplicate: deduplicationCount = 1 ✓
- 1 PMID-duplicate: totalIdentified = 3 ✓
- 1 PMID-duplicate: reviews.length = 2 ✓
- 1 title-duplicate: deduplicationCount = 1 ✓
- 1 title-duplicate: reviews.length = 2 ✓
- 50-cap: reviews.length capped at 50 ✓
- 50-cap: deduplicationCount = 0 (no cross-source dupes) ✓
- 50-cap: totalIdentified = 60 (before cap) ✓
- empty: deduplicationCount = 0 ✓
- empty: totalIdentified = 0 ✓

**All 27/27 passed.**

---

## Verification Status

- [x] `npm run lint` — 0 errors (1 pre-existing `ReviewSkeleton` warning, unrelated)
- [x] `npx tsc --noEmit` — 0 errors
- [x] Smoke tests — **27/27 passed** (Node.js direct function testing)
- [x] Vitest test file updated — 6 new tests in `lib/prisma-diagram.test.ts`
- [ ] `npm test` — blocked by cross-platform rollup native binary issue (same as all prior deployments)
- [ ] `npm run build` — blocked by cross-platform SWC binary issue (same as all prior deployments)

---

## Open Questions / Blockers

- The `node_modules` cross-platform issue persists. Fix: `rm -rf node_modules package-lock.json && npm install` on the deployment platform (Linux arm64).
- **Supabase migration**: `007_deduplication_count.sql` must be run in the Supabase Dashboard → SQL Editor before deploying. It is a pure additive migration — safe to run on a live database.

---

## Next Recommended Features

1. **Email alerts / living search** — Weekly email digest when new reviews appear on saved topics. This is the highest-retention feature remaining. Needs: Vercel cron + diff logic comparing current PubMed/OpenAlex results to stored results + Resend/Postmark email template. Medium effort.

2. **Dark mode** — Implement via Tailwind `dark:` variant + `next-themes`. The navy color scheme is already present. Requires touching most component files for `dark:` variants. Medium effort.

3. **Shortcut discoverability tooltip** — One-time localStorage-gated tooltip ("Press ? for shortcuts") on the Results page first visit. Very low effort; improves discoverability of keyboard shortcuts from `015-handoff.md`.

4. **Protocol draft versioning** — Allow users to save multiple named protocol drafts per result. Requires a separate `protocol_drafts` junction table. Medium effort; valuable for iterative refinement.

5. **Accessibility audit (WCAG 2.1 AA)** — Run an automated axe-core audit and fix violations. Key areas: color contrast on gray text, focus trapping in modals, ARIA roles on the tab components. Medium effort; required for institutional adoption.
