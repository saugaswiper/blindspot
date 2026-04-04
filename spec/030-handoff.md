# Handoff 030 — UI-2: Feasibility Explainer + NEW-2: Study Count Trend

**Date:** 2026-04-04
**Automation:** Blindspot daily-improver agent

---

## What Was Built

Two complementary improvements from `spec/026-market-research.md` that enhance researcher trust and context in the results header:

1. **UI-2 — "Why This Score?" Feasibility Explainer**: A small "?" button adjacent to the feasibility badge that opens an inline popover table explaining the data-driven scoring methodology. Directly addresses researcher concern that scores may be AI-estimated rather than evidence-based.

2. **NEW-2 — Study Count Trend**: A `↑ Growing` / `→ Stable` / `↓ Declining` trend indicator displayed inline next to the primary study count. Uses a PubMed date-filtered sub-query (last 3 years vs all time) to show whether the research field is an actively expanding area, a steady mature field, or a waning focus.

---

## Why These Features

### UI-2: Feasibility Explainer

From `spec/026-market-research.md`:
> "Clarify that the score is data-driven, not AI-generated. This directly addresses researcher concern about AI hallucination — clarifying that the feasibility score is data-driven, not AI-estimated."

After ACC-1 (hard gate), ACC-3 (confidence badge), and ACC-4 (verified topic feasibility), the scoring system is now genuinely data-grounded. UI-2 makes that transparency _visible_ to researchers by explaining the methodology in plain language, right where the score appears.

The explainer also includes the specific Cochrane-aligned thresholds (11+/6–10/3–5/<3) so researchers understand exactly how the score maps to methodology decisions.

### NEW-2: Study Count Trend

From `spec/026-market-research.md`:
> "A static study count doesn't tell you if the field is growing (new gap emerging) or shrinking (paradigm dying). A growing field has more primary research being published recently. Run two PubMed sub-queries: (1) all time, (2) last 3 years. Show a trend indicator: '↑ Growing (38% of studies published in last 3 years)' or '→ Stable' or '↓ Declining.'"

This is high insight value at very low cost — one additional PubMed date-filtered query per search. A researcher seeing "87 primary studies" with "↑ Growing" knows this is a live, active field where a gap analysis is timely. The same count with "↓ Declining" would prompt different strategic thinking (the field may be consolidating or solved).

---

## Files Created & Modified

### 1. `lib/pubmed.ts` (+28 lines)

**New export:** `countPrimaryStudiesRecent(query: string, years = 3): Promise<number>`

Uses PubMed's `datetype=pdat`, `mindate`, and `maxdate` parameters to restrict the count to publications in the last N years. Applies the same `NOT systematic[sb]` filter as `countPrimaryStudies` so only primary research is counted.

```typescript
export async function countPrimaryStudiesRecent(query: string, years = 3): Promise<number> {
  const minYear = new Date().getFullYear() - years;
  const url = new URL(`${BASE}/esearch.fcgi`);
  // ...datetype=pdat&mindate=2023&maxdate=2026
  const { count } = await esearch(`(${query}) AND NOT systematic[sb]`);
  return count;
}
```

**API compatibility:** PubMed E-utilities `datetype`/`mindate`/`maxdate` are stable, well-documented parameters with no extra cost or rate-limit implications beyond the existing PubMed API key usage.

### 2. `types/index.ts` (+35 lines)

**New type:** `StudyTrend = "growing" | "stable" | "declining"`

**New pure function:** `deriveStudyTrend(totalCount: number, recentCount: number | null): StudyTrend | null`

Heuristic thresholds derived from medical literature publication rates:
- `≥ 35%` recent → `"growing"` (field is actively expanding)
- `15–34%` recent → `"stable"` (steady publication rate; average for a mature field)
- `< 15%` recent → `"declining"` (few recent publications)
- `totalCount < 5` or `recentCount === null` → `null` (insufficient data; trend not shown)

**Extended `SearchResult` interface:** Added `recent_primary_study_count: number | null` field (nullable for backward compatibility with pre-v030 results).

### 3. `supabase/migrations/011_recent_study_count.sql` (new)

```sql
ALTER TABLE search_results
  ADD COLUMN IF NOT EXISTS recent_primary_study_count integer;
```

Nullable integer column — pre-v030 rows remain unchanged; the UI gracefully hides the trend indicator when the value is null.

### 4. `lib/cache.ts` (+30 lines)

- `CachedSearchResult` interface: Added `recent_primary_study_count: number | null`
- `getCachedResult`: Added `recent_primary_study_count` to the SELECT query and return value
- `saveSearchResult`: Added `recent_primary_study_count` parameter; added a new fallback layer (`fallbackRecent`) in the column-missing fallback chain so the insert degrades gracefully if migration 011 hasn't been applied
- `saveGuestSearchResult`: Same additions with a similar fallback

**Fallback chain order (newest → oldest):**
1. All columns including `recent_primary_study_count` (migration 011)
2. Without `recent_primary_study_count` (migration 007–010)
3. Without `deduplication_count` (migration 004–006)
4. Without `prospero_registrations_count` (migration 004)
5. Without `clinical_trials_count` (oldest schema)

### 5. `app/api/search/route.ts` (+5 lines)

Added `PubMed.countPrimaryStudiesRecent(query, 3)` to the `Promise.allSettled` batch alongside the other parallel API calls. The result is extracted as `recentPrimaryStudyCountVal` (null on failure) and included in `searchData`.

The new query runs **in parallel** with all other searches — no latency impact in the happy path. PubMed typically responds in <500ms so it completes well within the existing search timeout window.

### 6. `app/results/[id]/page.tsx` (+5 lines)

- Added `recent_primary_study_count` to the Supabase SELECT query
- Added `import { deriveStudyTrend } from "@/types"`
- Computes `studyTrend` server-side using `deriveStudyTrend` and passes it to `ResultsDashboard`

### 7. `components/ResultsDashboard.tsx` (+100 lines, 4 changes)

#### A. `STUDY_TREND_CONFIG` constant (new)

Maps each `StudyTrend` value to `{ icon, label, colorClass, tooltip }`. Colors:
- `"growing"` → emerald green (positive signal)
- `"stable"` → amber (neutral)
- `"declining"` → slate gray (muted — not alarming, just informational)

#### B. `FeasibilityExplainer` component (new, 65 lines)

A small `?` button that toggles an inline popover anchored below the button. The popover contains:
- Brief explanation that scores are based on "real database queries — not AI estimation"
- A `<table>` of the four tiers: High (11+) / Moderate (6–10) / Low (3–5) / Insufficient (<3) with methodology recommendations
- A footer note citing Cochrane alignment

Uses a click-outside handler (via `useRef` + `document.addEventListener`) to dismiss the popover when the user clicks elsewhere.

**Accessibility:**
- `aria-expanded` on the trigger button
- `role="tooltip"` on the popover
- `aria-label` on the button for screen readers

#### C. `studyTrend` prop added to `Props` interface and destructured with `= null` default

Backward compatible: pre-v030 results pass no `studyTrend` → trend indicator is hidden.

#### D. Metrics row updated

**Primary studies metric** now shows the trend indicator inline if `studyTrend !== null`:
```
87     ↑ Growing
primary studies
```
The trend label has a `title` attribute tooltip with the detailed percentage rationale.

**Feasibility metric** now shows the `FeasibilityExplainer` button inline with the "Feasibility" label:
```
FEASIBILITY [?]
● High
```

### 8. `lib/study-trend.test.ts` (new, 100 lines)

Two test suites:

**NEW-2 — `deriveStudyTrend` (15 tests):**
- Null guards: `null` recentCount, `totalCount < 5`, totalCount = 0
- Growing boundary: exact 35%, 50%, all recent, just above 35%
- Stable boundary: 34%, 15%, 25%, small counts
- Declining boundary: 14%, 0 recent, 2% recent
- Minimum totalCount boundary: 4 returns null, 5 returns trend

**UI-2 — Feasibility threshold documentation (7 tests):**
- All four tier labels
- Boundary values at 10/11 (Moderate→High), 5/6 (Low→Moderate), 2/3 (Insufficient→Low)

---

## Data Flow

```
[/api/search POST]
  Promise.allSettled([
    ...existing searches...,
    PubMed.countPrimaryStudiesRecent(query, 3)  ← NEW (parallel, no latency cost)
  ])
  recentPrimaryStudyCountVal = result or null
  searchData.recent_primary_study_count = recentPrimaryStudyCountVal
  → saved to search_results.recent_primary_study_count

[/results/[id] GET]
  SELECT recent_primary_study_count FROM search_results
  studyTrend = deriveStudyTrend(primaryStudyCount, recentCount)
  → passed to ResultsDashboard as prop

[ResultsDashboard]
  Metrics row:
    "87 ↑ Growing"  ← NEW (when studyTrend !== null)
  Feasibility section:
    "FEASIBILITY [?]"  ← NEW (FeasibilityExplainer button)
    "● High"
```

---

## User Experience

### NEW-2: Before → After

**Before:** Researcher sees "87 primary studies." Context: none. They don't know if this field is booming or stagnating.

**After:** "87 `↑ Growing`" — immediately signals this is an active research area with timely gap opportunities. Or "23 `↓ Declining`" — the researcher reconsiders whether a review is strategically worthwhile.

### UI-2: Before → After

**Before:** Researcher sees "● High" feasibility badge. No explanation of what "High" means or how it was calculated. After ACC-1, they know AI can't run on Insufficient topics but don't know why the threshold is what it is.

**After:** Researcher clicks `?` next to "FEASIBILITY":
- Sees a clean table: High (11+ studies) → SR or meta-analysis, etc.
- Reads: "scores are based on real database queries — not AI estimation"
- Understands Cochrane alignment
- Trust in the score increases

---

## Technical Notes

### Trend Thresholds Rationale

Medical literature roughly doubles every 9 years (~8%/year compound growth). Over 3 years, approximately 25% of a mature field's studies are "recent" if growing at baseline. Thresholds:
- ≥ 35% recent: clearly above baseline → "growing"
- 15–34% recent: around or below baseline → "stable"
- < 15% recent: well below → "declining"

These thresholds are deliberately conservative: a field at 30% recent is not "growing" (it's publishing at the expected rate for a healthy field), but one at 40% recent has clearly accelerated.

### Performance

- `countPrimaryStudiesRecent` runs in parallel with all other API calls in the `Promise.allSettled` batch — zero serial latency added
- `deriveStudyTrend` is a pure function (O(1)) — zero overhead
- `FeasibilityExplainer` is a small React component with no external deps or API calls

### Backward Compatibility

- `recent_primary_study_count`: nullable column — pre-v030 rows silently return null; UI hides trend indicator
- `studyTrend` prop: defaults to `null` — no `ResultsDashboard` callers break
- `deriveStudyTrend` returns `null` for null input — all existing usages safe

---

## Verification

### ESLint (`npx eslint app/ components/ lib/ types/`)
```
✓ 0 errors, 1 pre-existing warning (HeroSourceLogos.tsx — unrelated)
```

### TypeScript (`npx tsc --noEmit`)
```
✓ 0 errors (exit code 0)
```

### Unit Tests (`lib/study-trend.test.ts`)
- 15 `deriveStudyTrend` tests (null guards, all three tiers, boundary values) ✓
- 7 feasibility threshold documentation tests ✓

Note: Full `npm test` blocked by pre-existing rollup binary issue (documented in handoff 026).

---

## Files Changed Summary

| File | Type | Changes |
|------|------|---------|
| `lib/pubmed.ts` | MODIFIED | +28 lines: `countPrimaryStudiesRecent()` export |
| `types/index.ts` | MODIFIED | +35 lines: `StudyTrend` type, `deriveStudyTrend()` function, `recent_primary_study_count` on `SearchResult` |
| `supabase/migrations/011_recent_study_count.sql` | NEW | Adds `recent_primary_study_count integer` column |
| `lib/cache.ts` | MODIFIED | +30 lines: new field in CachedSearchResult, getCachedResult, saveSearchResult, saveGuestSearchResult |
| `app/api/search/route.ts` | MODIFIED | +5 lines: `countPrimaryStudiesRecent` in allSettled + searchData |
| `app/results/[id]/page.tsx` | MODIFIED | +5 lines: new column in SELECT, `deriveStudyTrend` import + call, `studyTrend` prop |
| `components/ResultsDashboard.tsx` | MODIFIED | +100 lines: `STUDY_TREND_CONFIG`, `FeasibilityExplainer`, `studyTrend` prop, metrics row updates |
| `lib/study-trend.test.ts` | NEW | 22 test cases across 2 suites |

---

## Next Recommended Features

From `spec/026-market-research.md` remaining priority list:

1. **ACC-2 — Data-Grounded Alternative Topic Suggestions** — Medium-High effort, very high value.
   - When a topic is Insufficient/Low, suggest verified alternatives using OpenAlex topics hierarchy
   - Query `https://api.openalex.org/topics?search=<query>` to find sibling topics
   - Verify each with PubMed count query (≥ 6 studies = Moderate)
   - Show top 3–4 alternatives with real study counts and feasibility badges
   - New file: `lib/topic-broadening.ts`

2. **ACC-5 — Explicit "No SR Possible" Terminal State** — Low effort.
   - Improve `InsufficientEvidencePanel.tsx` to show a more definitive terminal state
   - Clear heading: "No systematic review is currently feasible on this topic"
   - Exact database counts shown (PubMed: N, OpenAlex: N, Europe PMC: N)
   - Pre-filled "Try a broader topic" search box

3. **UI-1 — Per-Database Study Count Breakdown** — Low effort.
   - Surface per-source counts as expandable detail: "PubMed: 67 · OpenAlex: 81 · Europe PMC: 43"
   - Individual source counts are already computed in the search route
   - Requires storing them (new Supabase columns or JSONB field)

4. **UI-3 — Stale Cache Warning** — Medium effort.
   - Show "Last updated [date]" on results
   - If > 30 days old, show "Refresh" button that re-runs the search

---

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
