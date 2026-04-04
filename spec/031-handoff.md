# Handoff 031 — UI-1: Per-Database Study Count Breakdown

**Date:** 2026-04-04
**Automation:** Blindspot daily-improver agent

---

## What Was Built

**UI-1 — Per-Database Study Count Breakdown**: An expandable inline detail under the "Primary studies" metric that reveals how many primary studies (systematic reviews excluded) were found in each individual academic database:

```
87     ↑ Growing
primary studies
Sources ↓          ← click to expand

→ (expanded)

PubMed: 67 · OpenAlex: 81 · Europe PMC: 43
Primary studies only (systematic reviews excluded). Counts may overlap
across sources before deduplication.
Hide ↑
```

---

## Why This Feature

From `spec/026-market-research.md`:

> "A 2025 study (Journal of Clinical Epidemiology) found OpenAlex had 98.6% recall vs PubMed's 93.0% for systematic review benchmarks — but OpenAlex's recall dropped from 96% to 94% in March 2025 due to closed access abstract removal. Researchers need to know which databases contributed to have confidence in the count."

The blended `primary_study_count` Blindspot shows is computed with a smart weighting algorithm (if OpenAlex exceeds 5× the clinical sources, a weighted blend is used instead of the raw max). Without per-source transparency, researchers can't understand why they see "87 studies" — and if they run the same query on PubMed manually and get "67", they may distrust the result.

Per-source counts:
- Complete the transparency picture alongside the deduplication count (handoff 012)
- Help researchers understand which databases are contributing heavily to their topic
- Are especially valuable when databases diverge significantly (e.g. OpenAlex is 5× PubMed — the blending logic kicks in but was previously invisible)

---

## Technical Architecture

### Per-source counts were already computed — just not stored

In `app/api/search/route.ts`, the `Promise.allSettled` batch already computes:
- `pubmedCountVal` — from `PubMed.countPrimaryStudies(query)` (with `NOT systematic[sb]` filter)
- `openalexCountVal` — from `OpenAlex.countPrimaryStudies(query)` (with `type:article` filter)
- `europepmcCountVal` — from `EuropePMC.countPrimaryStudies(query)` (with `PUB_TYPE` exclusion)

These were used to compute `primaryStudyCount` (the blended value) then discarded. This feature stores them.

### Zero new API calls

No new external requests are made. The per-source counts are already fetched in the existing `Promise.allSettled` batch — zero latency impact.

---

## Files Created & Modified

### 1. `supabase/migrations/012_per_source_counts.sql` (new)

```sql
ALTER TABLE search_results
  ADD COLUMN IF NOT EXISTS pubmed_count    integer,
  ADD COLUMN IF NOT EXISTS openalex_count  integer,
  ADD COLUMN IF NOT EXISTS europepmc_count integer;
```

Three nullable integer columns — pre-v031 rows silently return null; the UI hides the "Sources" toggle when all three are null.

### 2. `types/index.ts` (+9 lines)

Added `pubmed_count`, `openalex_count`, `europepmc_count` (all `number | null`) to `SearchResult`:

```typescript
/** UI-1: Individual source counts (primary studies only, reviews excluded). */
pubmed_count: number | null;
openalex_count: number | null;
europepmc_count: number | null;
```

### 3. `lib/cache.ts` (+45 lines)

- `CachedSearchResult` interface: Added `pubmed_count`, `openalex_count`, `europepmc_count`
- `getCachedResult`: Added the three columns to the Supabase SELECT query and return value
- `saveSearchResult`:
  - Extended the `data` parameter type with the three new fields
  - Primary INSERT now includes all three columns
  - New fallback layer: if migration 012 isn't applied yet, retries without the three per-source columns (then falls through to the existing fallback chain for migration 011, 007, etc.)
- `saveGuestSearchResult`: Same additions with the same fallback structure

**Fallback chain order (newest → oldest):**
1. All columns including `pubmed_count`, `openalex_count`, `europepmc_count` (migration 012)
2. Without per-source counts (migration 011)
3. Without `recent_primary_study_count` (migration 007–010)
4. Without `deduplication_count` (migration 004–006)
5. Without `prospero_registrations_count` (migration 004)
6. Without `clinical_trials_count` (oldest schema)

### 4. `app/api/search/route.ts` (+3 lines)

Added `pubmed_count`, `openalex_count`, `europepmc_count` to `searchData` — picking up the already-computed `pubmedCountVal`, `openalexCountVal`, `europepmcCountVal` variables that existed but were previously discarded after the blending calculation.

### 5. `app/results/[id]/page.tsx` (+6 lines)

- Added `pubmed_count`, `openalex_count`, `europepmc_count` to the Supabase SELECT query
- Passes `pubmedCount`, `openalexCount`, `europepmcCount` props to `ResultsDashboard`

### 6. `components/ResultsDashboard.tsx` (+80 lines)

#### A. `SourceBreakdown` component (new, 55 lines)

A small expandable section rendered below the primary studies metric. Design decisions:

- **Progressive disclosure**: Default state shows only a "Sources ↓" link to avoid cluttering the already information-dense metrics row. Clicking expands to show the full breakdown.
- **Partial-data handling**: If only 1 or 2 sources responded (API failures), only the available counts are shown — no placeholder for missing sources.
- **Zero-count visibility**: A source returning 0 is still shown (it's a meaningful signal).
- **Null guard**: If all three counts are null (pre-v031 result or all APIs failed), the component renders nothing.
- **Accessible**: Uses `aria-label` on the toggle buttons and `aria-label` on the breakdown container.
- **Mobile-friendly**: Uses `flex-wrap` so three source labels wrap cleanly at 375px.

Includes a footnote: _"Primary studies only (systematic reviews excluded). Counts may overlap across sources before deduplication."_ — prevents researchers from adding counts and comparing to the blended total.

#### B. Props interface additions

Added `pubmedCount`, `openalexCount`, `europepmcCount` (all `number | null | undefined`) with default `null`.

#### C. Metrics row: `SourceBreakdown` call

Added `<SourceBreakdown pubmedCount={pubmedCount} openalexCount={openalexCount} europepmcCount={europepmcCount} />` directly below the primary studies value in the metrics row.

### 7. `lib/per-source-count.test.ts` (new, 90 lines)

Two test suites testing the pure logic functions extracted from the `SourceBreakdown` component:

**`hasAnySourceCount` (8 tests):**
- All null → false
- All undefined → false
- Only one source available (each of 3 cases) → true
- All three available → true
- Two available → true
- Zero as a valid count → true

**`buildSourceEntries` (6 tests):**
- All null → empty array
- All three → all three entries in correct order
- Null source skipped
- Undefined source skipped
- Zero-count source included
- Large counts preserved accurately

---

## Data Flow

```
[/api/search POST — existing]
  Promise.allSettled([
    PubMed.countPrimaryStudies(query)    → pubmedCountVal   (already existed)
    OpenAlex.countPrimaryStudies(query)  → openalexCountVal (already existed)
    EuropePMC.countPrimaryStudies(query) → europepmcCountVal (already existed)
    ...
  ])
  → used for blended primaryStudyCount (unchanged)
  → NOW ALSO stored as pubmed_count / openalex_count / europepmc_count

[/results/[id] GET]
  SELECT pubmed_count, openalex_count, europepmc_count FROM search_results
  → passed as props to ResultsDashboard

[ResultsDashboard]
  Metrics row:
    "87 ↑ Growing"
    "Sources ↓"         ← NEW (when at least one count is non-null)
    → (expanded): "PubMed: 67 · OpenAlex: 81 · Europe PMC: 43"
```

---

## User Experience

### Before

Researcher sees "87 primary studies." They can't verify whether this comes mainly from PubMed or OpenAlex or Europe PMC. If they independently search PubMed and get 67, they may distrust the number.

### After

Researcher sees "87 primary studies" with a "Sources ↓" toggle. They click it and see:
- PubMed: 67 · OpenAlex: 81 · Europe PMC: 43
- Plus a note explaining counts overlap across sources (so 67+81+43 ≠ 87 after deduplication)

They now understand: OpenAlex found more than PubMed (a common pattern for non-clinical topics); the blended count is reasonable; and the transparent deduplication story is complete.

---

## Backward Compatibility

- `pubmed_count` / `openalex_count` / `europepmc_count`: All nullable — pre-v031 rows return null
- `SourceBreakdown` component: Renders nothing when all three are null (silent for old results)
- Fallback chain in cache.ts: Degrades gracefully to older schema versions if migration 012 hasn't been applied
- No breaking changes to any existing prop or API shape

---

## Verification

### ESLint (`npx eslint app/ components/ lib/ types/`)
```
✓ 0 errors, 2 pre-existing warnings (HeroSourceLogos.tsx — unrelated to this change)
```

### TypeScript (`npx tsc --noEmit`)
```
✓ 0 errors (exit code 0)
```

### Unit Tests (`lib/per-source-count.test.ts`)
- Note: Full `npm test` blocked by pre-existing rollup binary issue (documented since handoff 026)
- 8 `hasAnySourceCount` tests written ✓
- 6 `buildSourceEntries` tests written ✓

---

## Files Changed Summary

| File | Type | Changes |
|------|------|---------|
| `supabase/migrations/012_per_source_counts.sql` | NEW | Adds `pubmed_count`, `openalex_count`, `europepmc_count` columns |
| `types/index.ts` | MODIFIED | +9 lines: three nullable fields on `SearchResult` |
| `lib/cache.ts` | MODIFIED | +45 lines: new fields in interface, SELECT, and INSERT with fallback chain |
| `app/api/search/route.ts` | MODIFIED | +3 lines: per-source counts added to `searchData` |
| `app/results/[id]/page.tsx` | MODIFIED | +6 lines: SELECT and prop pass-through |
| `components/ResultsDashboard.tsx` | MODIFIED | +80 lines: `SourceBreakdown` component, props, metrics row call |
| `lib/per-source-count.test.ts` | NEW | 14 test cases across 2 suites |

---

## Next Recommended Features

From `spec/026-market-research.md` remaining priority list:

1. **ACC-2 — Data-Grounded Alternative Topic Suggestions** — Medium-High effort, very high value.
   - When a topic is Insufficient/Low, suggest verified alternatives using OpenAlex topics hierarchy
   - Query `https://api.openalex.org/topics?search=<query>` to find sibling topics
   - Verify each with PubMed count query (≥ 6 studies = Moderate)
   - Show top 3–4 alternatives with real study counts and feasibility badges
   - New file: `lib/topic-broadening.ts`

2. **UI-3 — Stale Cache Warning** — Medium effort.
   - Show "Last updated [date]" on results (already have `created_at` in the data)
   - If > 30 days old, show "Refresh" button that re-runs the search
   - With improved per-source count transparency (v031), refreshing old results gives much richer data

3. **ACC-5 — Enhanced "No SR Possible" Terminal State** — Low effort.
   - The `InsufficientEvidencePanel` is already strong, but could surface the per-source breakdown
   - "Blindspot searched PubMed (N), OpenAlex (N), Europe PMC (N) and found N total primary studies."
   - Uses the newly stored per-source counts to make the evidence of absence concrete

---

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
