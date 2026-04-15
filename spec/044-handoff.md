# Handoff 044 — Search Telemetry for PRISMA Rate Calibration

**Date:** 2026-04-15
**Automation:** Blindspot daily-improver agent
**Previous handoff:** 043 (Per-gap evidence badge extended to Moderate feasibility)

---

## Summary

Implemented the Supabase telemetry system for PRISMA screening funnel rate validation — the [High] priority item carried forward in the recommended next steps of handoffs 039 through 043.

Every completed search (authenticated and guest) now writes a lightweight row to a new `search_telemetry` table recording the corpus size, tier, and PRISMA estimated included count. This data enables retrospective calibration: the Blindspot team can pull the telemetry, compare estimated vs. actual included counts from subsequently published reviews, and tighten the tier-specific screening rates over time.

Key outcomes:
- New `supabase/migrations/014_search_telemetry.sql` — table + RLS + 3 indexes
- New `lib/search-telemetry.ts` — pure `buildTelemetryPayload` + async `insertSearchTelemetry`
- New `lib/search-telemetry.test.ts` — 24 unit tests covering tier boundaries and payload shape
- `lib/prisma-diagram.ts` — exported `getCorpusTier` + `CorpusTier` type (was private logic)
- `app/api/search/route.ts` — best-effort telemetry insert wired after result save
- The insert is fire-and-forget (`void insertSearchTelemetry(...)`) — a telemetry failure can never surface to the user or fail the search

---

## Problem

The PRISMA screening funnel estimates (handoffs 034–038) compute an `included` count and ±CI for how many studies would likely be included in the researcher's planned systematic review. The confidence interval for large corpora (÷0.5 to ×2) was set conservatively based on manual calibration against ~13 published SRs.

Without telemetry, there is no systematic way to:
1. Know whether the ÷0.5–×2 CI actually captures real included counts in the wild
2. Identify which tier (small/medium/large/XL/XXL) has the most miscalibrated rates
3. Improve the rates without re-running manual ground-truth comparisons

This gap was called out as [High] priority in the recommended next steps of five consecutive handoffs (039–043), yet remained unimplemented due to other incremental UI work taking priority.

---

## What Was Built

### 1. `supabase/migrations/014_search_telemetry.sql` — New table

**Columns:**

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | Primary key |
| `search_result_id` | uuid | FK → search_results(id) ON DELETE CASCADE |
| `after_dedup` | integer | Blended unique primary study count (= primaryStudyCount) |
| `tier` | text | `'small'|'medium'|'large'|'xl'|'xxl'` (CHECK constraint) |
| `included_estimate` | integer | PRISMA point estimate (generic / null study-design rates) |
| `included_low` | integer | CI lower bound |
| `included_high` | integer | CI upper bound |
| `is_guest` | boolean | True for unauthenticated searches |
| `created_at` | timestamptz | Default now() |

**Indexes:**
- `search_result_id` (FK traversal / cascade delete)
- `created_at DESC` (time-series calibration queries)
- `(tier, created_at DESC)` (tier-sliced analysis, e.g. "all XXL rows")

**RLS:**
- Table has RLS enabled
- `authenticated` and `anon` roles have DENY policies (`USING (false)`)
- Service role bypasses RLS automatically (no explicit policy needed)

**Design note — why DENY policies instead of no-access-by-default:**
Supabase's default when RLS is enabled with no matching policy is implicit deny. Explicit DENY policies were added to make the intent auditable and visible in `pg_policies`, so a future schema reviewer can immediately see that regular users were intentionally excluded rather than accidentally forgotten.

### 2. `lib/prisma-diagram.ts` — Exported `getCorpusTier`

Previously the tier logic lived only inside `getScreeningRatios` (unexported). Extracted as:

```typescript
export type CorpusTier = "small" | "medium" | "large" | "xl" | "xxl";

export function getCorpusTier(afterDedup: number): CorpusTier {
  if (afterDedup < 15) return "small";
  if (afterDedup < 60) return "medium";
  if (afterDedup < 500) return "large";
  if (afterDedup < 1500) return "xl";
  return "xxl";
}
```

Exporting this ensures the tier logged in telemetry is computed by the same function used for rate selection — they can never drift apart.

### 3. `lib/search-telemetry.ts` — New module

**`buildTelemetryPayload(searchResultId, primaryStudyCount, isGuest) → TelemetryPayload`**

Pure function. Uses `computePrimaryStudyPrismaData` with null study design to derive the generic-rate PRISMA estimates. Study design is not known at search time (only set when user runs AI analysis); using null study design makes all telemetry rows comparable on the same basis.

**`insertSearchTelemetry(searchResultId, primaryStudyCount, isGuest) → Promise<void>`**

Async. Calls `buildTelemetryPayload`, then inserts via the service-role client. Any error (DB constraint, connectivity, missing env var) is caught and `console.warn`'d — never rethrown. This is the function called from `app/api/search/route.ts`.

### 4. `lib/search-telemetry.test.ts` — 24 unit tests

Tests cover:

**`getCorpusTier` (14 tests):**
- Small tier: 0, 1, 14 studies
- Medium tier: 15, 30, 59 studies
- Large tier: 60, 250, 499 studies
- XL tier: 500, 1000, 1499 studies
- XXL tier: 1500, 5000, 100000 studies
- Full boundary table via `it.each` (10 pairs)

**`buildTelemetryPayload` (10 tests):**
- Correct `search_result_id` passthrough
- `after_dedup` equals `primaryStudyCount`
- `is_guest` propagation for both true and false
- Tier derivation for all 5 tiers
- `included_estimate` is a positive integer
- CI ordering: `included_low ≤ included_estimate ≤ included_high` (5 corpus sizes)
- `included_low ≥ 1` (6 corpus sizes including 0)
- `included_high > included_low` (positive CI width, 5 corpus sizes)
- `tier` matches `getCorpusTier` for all tier boundaries
- `primaryStudyCount = 0` handled without throwing
- Monotonic included estimate increase across small → medium → large

### 5. `app/api/search/route.ts` — Telemetry insert

Added after the `resultId` is obtained (both authenticated and guest paths):

```typescript
// Best-effort telemetry insert (migration 014).
// Records after_dedup, tier, and PRISMA included estimate for retrospective
// calibration of the screening funnel rates against published SRs.
// Never awaited at top level — a telemetry failure must not affect the response.
void insertSearchTelemetry(resultId, primaryStudyCount, isGuest);
```

The `void` ensures the linter doesn't complain about an unawaited promise. The fire-and-forget pattern is intentional: the main search response must not be delayed or failed by telemetry I/O.

---

## Why Generic (Null Study-Design) Rates for Telemetry

The PRISMA `getScreeningRatios` function adjusts rates by study design type (scoping, meta-analysis, umbrella, rapid, or default). Study design is only determined when the user later requests AI analysis — it is not available at search time.

Two options were considered:

1. **Log null included_estimate until AI analysis runs, then update the row** — requires a second DB write, more complex logic, and most telemetry rows would never be updated (users who don't run AI analysis).

2. **Log generic (null study design) estimate immediately** — simpler, 100% coverage of all searches, consistent basis for tier-level calibration.

Option 2 was chosen. Generic rates give a consistent baseline for validating whether the tier boundaries themselves are correct, independent of study-design variation. If a researcher later runs AI analysis and Blindspot recommends a meta-analysis study design, the actual included estimate shown in the PRISMA tab will differ from the telemetry row — this is expected and acceptable. The telemetry is for tier calibration, not per-search accuracy.

---

## Files Modified / Created

```
supabase/migrations/014_search_telemetry.sql  — NEW: table + RLS + indexes
                                                (+73 lines)

lib/prisma-diagram.ts                          — Added CorpusTier type +
                                                 getCorpusTier() export
                                                (+27 lines after Constants block)

lib/search-telemetry.ts                        — NEW: buildTelemetryPayload +
                                                 insertSearchTelemetry
                                                (+116 lines)

lib/search-telemetry.test.ts                   — NEW: 24 unit tests
                                                (+167 lines)

app/api/search/route.ts                        — Added import + void insert
                                                (+2 imports, +5 lines comment+call)
```

---

## How to Use the Telemetry Data

After 50+ real searches accumulate, run this query in the Supabase SQL editor to get the calibration dataset:

```sql
SELECT
  tier,
  COUNT(*)                              AS n,
  ROUND(AVG(after_dedup))              AS avg_corpus_size,
  ROUND(AVG(included_estimate))        AS avg_estimate,
  ROUND(AVG(included_low))             AS avg_ci_low,
  ROUND(AVG(included_high))            AS avg_ci_high,
  ROUND(AVG(is_guest::int) * 100, 1)  AS pct_guest
FROM search_telemetry
WHERE created_at > now() - interval '30 days'
GROUP BY tier
ORDER BY
  CASE tier
    WHEN 'small'  THEN 1
    WHEN 'medium' THEN 2
    WHEN 'large'  THEN 3
    WHEN 'xl'     THEN 4
    WHEN 'xxl'    THEN 5
  END;
```

To validate a specific tier against published SRs:

1. Find published SRs in that tier's corpus size range on PubMed
2. Note their actual included study count
3. Compare to `included_estimate`, `included_low`, `included_high`
4. If actual is consistently outside CI: adjust the `getScreeningRatios` default rates for that tier in `lib/prisma-diagram.ts`

---

## Verification Status

```
npx eslint lib/search-telemetry.ts lib/search-telemetry.test.ts \
           lib/prisma-diagram.ts app/api/search/route.ts
→ Exit 0 (0 errors, 0 warnings from new/modified code)
  1 pre-existing warning: 'ScreeningCriteria' unused import in ResultsDashboard
  (line 19, present since handoff 034, unrelated to this session)

npx tsc --noEmit
→ Exit 0 (no type errors)

npm test
→ Blocked: known rollup ARM64 binary mismatch (same as handoffs 035–043).
  24 unit tests were written for getCorpusTier (14) and buildTelemetryPayload (10).
  All test cases were reviewed manually for correctness.

npm run build
→ Not attempted: same .fuse_hidden / EPERM infrastructure issue as previous sessions.
```

---

## Recommended Next Steps

1. **[High] Apply migration 014 to production** — Run `supabase/migrations/014_search_telemetry.sql` against the production Supabase instance. The table does not exist until this migration is applied; the `insertSearchTelemetry` call in `app/api/search/route.ts` will silently fail until then (non-fatal by design, logged as `console.warn`).

2. **[Medium] Calibration review after 50+ searches** — Once 50+ rows are in `search_telemetry`, run the tier-breakdown SQL above. Compare `avg_estimate` in each tier against a handful of published SRs from PubMed to check whether the CI consistently covers real included counts.

3. **[Medium] Persist dashboard sort preference** — The sort parameter approach (handoff 042) is stateless. A researcher who always wants "High feasibility first" must click the sort link on every visit. Consider persisting sort preference in a `user_preferences` Supabase table or as a `Set-Cookie` header so the chosen sort is remembered between sessions.

4. **[Low] Animate badge appearance on tab switch** — The per-gap evidence quality badges (handoffs 042–043) appear synchronously when switching to the Gaps tab. A subtle fade-in (50ms stagger per gap card) would draw attention to the badges without being distracting.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
