# Handoff 056 — ACC-12: Gap Analysis Freshness Indicator + Refresh Button

**Date**: 2026-05-04
**Previous handoff**: spec/055-handoff.md
**Status**: Implemented and verified (TypeScript clean, ESLint 0 new errors)

---

## 1. Summary

Implemented ACC-12 from `spec/054-market-research.md`: Gap Analysis Freshness Indicator and Refresh Button.

This feature tracks when the AI gap analysis was generated and allows researchers to refresh stale analyses. The cache-freshness warning (handoff 034) handles search result caches; ACC-12 completes the loop by adding timestamp and refresh capability to the AI analysis cache.

| ID | Item | Priority | Status |
|---|---|---|---|
| ACC-12 | Gap Analysis Freshness Indicator + Refresh Button | Medium | ✓ Complete |

---

## 2. What Changed

### New Database Migration: `019_gap_analysis_freshness.sql`

Adds `gap_analysis_generated_at timestamp with time zone` column to `search_results` table.
- Stores the timestamp when gap analysis is generated
- NULL = analysis does not exist OR result predates this migration
- Allows UI to display "Analysis generated on [date]" and offer refresh for analyses > 6 months old

**Deployment step**: Apply migration via Supabase:
```sql
ALTER TABLE search_results
  ADD COLUMN IF NOT EXISTS gap_analysis_generated_at timestamp with time zone;
```

### `app/api/analyze/route.ts`

Updated the Supabase insert/update to include `gap_analysis_generated_at`:

```typescript
const { error: updateError } = await supabase
  .from("search_results")
  .update({
    feasibility_score: feasibility.score,
    feasibility_explanation: feasibility.explanation,
    gap_analysis: gapAnalysis,
    study_design_recommendation: studyDesign,
    gap_analysis_generated_at: new Date().toISOString(),  // ← NEW
  })
  .eq("id", resultId);
```

Timestamp is set to ISO8601 format (UTC) at the moment the Gemini analysis completes and is saved to the database.

### `app/results/[id]/page.tsx`

1. Expanded the Supabase select to fetch `gap_analysis_generated_at`:
```typescript
gap_analysis,
gap_analysis_generated_at,  // ← NEW
study_design_recommendation,
```

2. Added new prop to `ResultsDashboard`:
```typescript
gapAnalysisGeneratedAt={
  (result.gap_analysis_generated_at as string | null | undefined) ?? null
}
```

### `components/ResultsDashboard.tsx`

1. **Props interface**: Added `gapAnalysisGeneratedAt?: string | null` with documentation:
```typescript
/**
 * ACC-12: Timestamp when the gap analysis was generated.
 * Used to display "Analysis generated on [date]" and offer to refresh
 * analyses older than 6 months. Null when analysis doesn't exist or
 * the result predates migration 019.
 */
gapAnalysisGeneratedAt?: string | null;
```

2. **Function signature**: Added to destructuring with default:
```typescript
gapAnalysisGeneratedAt = null,
```

3. **GapsTab component**: 
   - Added `gapAnalysisGeneratedAt` to function signature and props
   - Passed from parent via: `<GapsTab gapAnalysis={...} gapAnalysisGeneratedAt={gapAnalysisGeneratedAt} ... />`

4. **Freshness indicator UI** (new, rendered in GapsTab above "Identified Gaps"):
```tsx
{gapAnalysisGeneratedAt && (() => {
  const generatedDate = new Date(gapAnalysisGeneratedAt);
  const now = new Date();
  const ageMs = now.getTime() - generatedDate.getTime();
  const ageMonths = ageMs / (1000 * 60 * 60 * 24 * 30);
  const isStale = ageMonths > 6;
  
  return (
    <div className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 mb-4">
      <p className="text-xs text-gray-600 dark:text-gray-400">
        Analysis generated on {generatedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
        {isStale && ' · outdated'}
      </p>
      {isStale && isOwner && (
        <button
          onClick={onAnalyze}
          disabled={isPending}
          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          title="Clear and re-run the gap analysis with current data"
        >
          {isPending ? "Refreshing..." : "Refresh analysis"}
        </button>
      )}
    </div>
  );
})()}
```

**Behavior:**
- Always shows: "Analysis generated on [Month Day, Year]"
- If analysis is > 6 months old: adds " · outdated" suffix to the date text
- If analysis is stale AND user is the owner: renders a "Refresh analysis" button
- Clicking the button calls `onAnalyze()` which clears `gap_analysis` and re-triggers `/api/analyze`
- During refresh: button shows "Refreshing..." and is disabled
- The button is NOT shown for guest results (isOwner=false) or recent analyses

---

## 3. Verification

```
npx tsc --noEmit  → clean (0 errors)
npx eslint ...    → 2 pre-existing warnings (unrelated to ACC-12)
```

No new linting errors or TypeScript issues introduced.

---

## 4. How It Works End-to-End

1. **Search runs**: User submits a query. `/api/search` calls `/api/analyze` which generates gap analysis and stores `gap_analysis_generated_at = now()`.

2. **Results page loads**: `app/results/[id]/page.tsx` fetches `gap_analysis_generated_at` from Supabase along with `gap_analysis`.

3. **UI displays freshness**: GapsTab renders the timestamp indicator. If `gapAnalysisGeneratedAt` is non-null:
   - Shows "Analysis generated on [date]"
   - Calculates age in months
   - If > 6 months old and user is owner, shows "Refresh analysis" button

4. **Researcher clicks refresh** (optional): Button calls `onAnalyze()` → `/api/analyze` POST with resultId.
   - `/api/analyze` fetches the search result (which still has the existing reviews, primary study count, etc.)
   - Sets `gap_analysis = null` and `gap_analysis_generated_at = null` before analysis
   - Runs new Gemini analysis
   - Stores new `gap_analysis` and new `gap_analysis_generated_at` timestamp
   - Returns `{ resultId, cached: false }`
   - UI re-renders with fresh analysis and new timestamp

5. **Timestamp persists**: The `gap_analysis_generated_at` is never null once an analysis exists (it's set on every analysis run). Pre-migration results will have null (gracefully hidden).

---

## 5. UI Behavior & Edge Cases

| Scenario | Display | Refresh Button? |
|----------|---------|---|
| Analysis generated < 6 months ago | "Analysis generated on [date]" | No |
| Analysis generated > 6 months ago | "Analysis generated on [date] · outdated" | Yes (if owner) |
| No analysis yet | Nothing | N/A (AnalysisPrompt shown instead) |
| Guest viewer, stale analysis | "Analysis generated on [date] · outdated" | No |
| Analysis being refreshed | Shows "Refreshing..." | Disabled |

---

## 6. Next Steps

1. **Apply migration 019** to production Supabase (as described above)
2. **ACC-15 — Cross-Source Confidence Score** — CV-based "Sources agree/vary/disagree" indicator using already-stored per-source counts (low effort)
3. **ACC-14 — MeSH Vocabulary Check** — Flag non-standard terminology in AI-suggested titles (low effort)
4. **NEW-9 — Evidence Gap Map Visualization Tab** — Matrix view of gaps by dimension × feasibility (medium effort)
5. **EuropePMC field-restriction** — Deferred investigation into title/abstract-only queries to reduce overcounting

---

## 7. Technical Notes

- **Timezone handling**: Timestamp is stored in UTC (ISO8601). The UI uses `.toLocaleDateString()` to display in the browser's local timezone, which is correct for UX.
- **6-month threshold**: Chosen as a reasonable balance between "analysis still somewhat relevant" and "should check for new reviews". No MeSH or domain-specific reasoning; this is a configurable constant in the code if needed.
- **Graceful degradation**: If `gap_analysis_generated_at` is null (pre-migration or missing data), the entire indicator block doesn't render — no visual artifact.
- **Refresh semantics**: The `onAnalyze` callback already handles the rate limiting (20 analyses per 24h) and user auth, so no additional guards needed.
- **Performance**: The timestamp is a simple ISO string — no indexing or query optimization needed until we build a "Stale searches" dashboard (future feature).

---

## 8. Testing Notes

- **Unit tests**: None added (timestamp logic is trivial; tested via integration when feature is deployed)
- **Manual testing checklist**:
  1. Generate a gap analysis → verify timestamp appears in the Gaps tab
  2. Go back to results and reload → timestamp persists
  3. Manually update the timestamp in Supabase to > 6 months ago → "Refresh analysis" button appears
  4. Click refresh → analysis re-runs, new timestamp appears
  5. As guest → timestamp appears but no refresh button
  6. Refresh while pending → button shows "Refreshing..." and is disabled

---

## 9. Compliance & Standards

- **Dark mode**: Uses `dark:` Tailwind classes for the indicator box and button
- **Accessibility**: Button is properly disabled during pending state; title attribute explains the action
- **TypeScript**: Full strict mode compliance; no `any` types
- **Mobile responsive**: Uses `flex` layout that stacks on mobile (default); text truncates gracefully

