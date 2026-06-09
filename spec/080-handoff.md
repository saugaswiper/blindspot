# Handoff 080 — AI-Powered Literature Screening Feature

**Date**: 2026-06-09  
**Session type**: Feature implementation  
**Previous handoff**: spec/079-handoff.md (2026-06-08)  
**Focus**: End-to-end title/abstract screening for gap topics

---

## 1. Summary

Implemented a full PRISMA-style AI screening feature. After running gap analysis, the owner can click **"Screen N reviews for this gap"** on any suggested topic card. Blindspot generates inclusion/exclusion criteria, lets the user review and edit them, then screens all existing reviews in a single Gemini call — surfacing Include / Exclude / Uncertain decisions per review with reasoning.

**Work performed**: New types, new Gemini library module, two new API routes, DB migration, new UI component, wiring into ResultsDashboard and results page.  
**Status**: ✅ TypeScript clean (0 errors). Ready to deploy after running Supabase migration `023`.

---

## 2. Files Created / Modified

### New files

| File | Purpose |
|---|---|
| `lib/screening.ts` | Two Gemini-backed functions: `suggestScreeningCriteria` and `runTitleAbstractScreening` |
| `app/api/screening/suggest/route.ts` | POST — generates I/E criteria for a gap topic |
| `app/api/screening/run/route.ts` | POST — runs screening, persists to DB |
| `supabase/migrations/023_screening_results.sql` | Adds `screening_result JSONB` column to `search_results` |
| `components/ScreeningPanel.tsx` | Multi-step inline UI component |
| `spec/screening-market-analysis.md` | Market analysis + prioritized improvement backlog |

### Modified files

| File | What changed |
|---|---|
| `types/index.ts` | Added `ScreeningCriteria`, `ScreeningDecision`, `ScreeningResult`; added `screening_result?` to `SearchResult` |
| `components/ResultsDashboard.tsx` | Imports `ScreeningPanel`; adds `screeningResult` prop; adds `reviewCount` + `savedScreeningResult` to `GapsTab`; inserts `<ScreeningPanel>` into each topic card |
| `app/results/[id]/page.tsx` | Fetches `screening_result` from DB; passes as `screeningResult` prop |

---

## 3. Architecture

### Data flow

```
User clicks "Screen N reviews"
  → ScreeningPanel (idle → suggesting)
  → POST /api/screening/suggest { resultId, topicIndex }
      → Supabase fetch (gap_analysis, query) — RLS
      → Gemini: suggestScreeningCriteria()
      → returns ScreeningCriteria JSON
  → ScreeningPanel (approve) — user edits criteria inline
  → POST /api/screening/run { resultId, criteria }
      → Supabase fetch (existing_reviews) — RLS
      → Gemini: runTitleAbstractScreening()
      → builds ScreeningResult with counts
      → Supabase UPDATE search_results.screening_result
      → returns ScreeningResult
  → ScreeningPanel (results) — table of decisions
```

### Types (`types/index.ts`)

```typescript
interface ScreeningCriteria {
  inclusion: string[];          // 3–5 criteria
  exclusion: string[];          // 3–5 criteria
  focus_gap: string;            // one-sentence gap description
  gap_type: GapDimension;
  topic_title: string;
}

interface ScreeningDecision {
  title: string; year: number; journal: string;
  pmid?: string; doi?: string;
  decision: "include" | "exclude" | "uncertain";
  reason: string;               // one-sentence reasoning
}

interface ScreeningResult {
  criteria: ScreeningCriteria;
  decisions: ScreeningDecision[];
  included_count: number;
  excluded_count: number;
  uncertain_count: number;
  run_at: string;               // ISO 8601
}
```

### Gemini prompts (`lib/screening.ts`)

- **`suggestScreeningCriteria`** — uses `buildCriteriaPrompt`: PRISMA-compliant, asks for 3–5 inclusion + 3–5 exclusion criteria assessable from title/abstract. Returns `{ inclusion[], exclusion[], focus_gap }`.
- **`runTitleAbstractScreening`** — uses `buildScreeningPrompt`: screens up to 50 reviews in one call. Returns array of `{ index, decision, reason }`. Graceful fallback: if array length mismatches, pads with `uncertain` decisions.
- Both use `responseMimeType: "application/json"`, `temperature: 0.2`, `maxOutputTokens: 4096`.
- `extractJson` handles both `[array]` and `{object}` responses.

### Database (`supabase/migrations/023_screening_results.sql`)

```sql
ALTER TABLE search_results
  ADD COLUMN IF NOT EXISTS screening_result jsonb DEFAULT NULL;

CREATE INDEX IF NOT EXISTS search_results_screening_idx
  ON search_results ((screening_result IS NOT NULL))
  WHERE screening_result IS NOT NULL;
```

**Pending**: Run this migration in Supabase before deploying.

---

## 4. UI Component (`components/ScreeningPanel.tsx`)

Five internal states managed by `step: PanelStep`:

| Step | What the user sees |
|---|---|
| `idle` | "Screen N reviews for this gap" button (owner only) |
| `suggesting` | Spinner: "Generating inclusion/exclusion criteria…" |
| `approve` | Editable criteria lists (add/remove/edit items) + "Approve & Screen" button |
| `running` | Animated progress bar, "~20–30 seconds" estimate |
| `results` | Filter chips (All/Include/Exclude/Uncertain), per-review decision rows with expandable reasoning, re-screen button |

Key behaviours:
- `initialResult` prop: if a `ScreeningResult` was previously saved to the DB, the panel opens directly in `results` state — no re-run needed.
- `isOwner` guard: the entire component returns `null` for non-owners.
- `gapAnalysis.suggested_topics.indexOf(topic)` used to get the unfiltered topic index for the API call (the `visibleTopics` map uses a filtered array).
- `savedScreeningResult` is matched to a topic by `criteria.topic_title === topic.title` (one saved result per result record for now).

---

## 5. API Routes

### `POST /api/screening/suggest`
```
Body:    { resultId: string; topicIndex: number }
Returns: ScreeningCriteria | { error: string }
Auth:    required (401 if not signed in)
RLS:     search_results fetched with Supabase client (user-scoped)
```

### `POST /api/screening/run`
```
Body:    { resultId: string; criteria: ScreeningCriteria }
Returns: ScreeningResult | { error: string }
Auth:    required
Side effect: UPDATE search_results SET screening_result = ... WHERE id = resultId
Note:    Returns ScreeningResult even if DB save fails (client always sees results)
```

---

## 6. Known Limitations

1. **One saved result per search result** — `search_results.screening_result` is a single JSONB column. If the user screens multiple gap topics in one result, the last one run overwrites the previous. The panel matches the saved result to a topic by `topic_title`. A future migration could change this to `jsonb[]` or a separate `screening_results` table keyed by `(result_id, topic_index)`.

2. **50-review cap** — `runTitleAbstractScreening` screens up to 50 reviews in one Gemini call. Results beyond 50 are silently ignored. Sufficient for the current `existing_reviews` dataset size; revisit if that grows.

3. **No dual-reviewer / blinding** — The current flow is single-reviewer (the owner). Covidence-style blinded dual review is a future feature.

4. **No structured exclusion reason codes** — Decisions include a free-text reason but no PRISMA reason code (wrong population, wrong design, etc.). This is the next improvement in the backlog.

---

## 7. Improvement Backlog

A prioritized improvement backlog (informed by market analysis of Rayyan, Covidence, DistillerSR, ASReview) is in `spec/screening-market-analysis.md`.

**A scheduled agent** (`blindspot-screening-improver`) runs every Monday at 9am. It reads the backlog, picks the next undone Tier 1 item, implements it, runs `tsc --noEmit`, and marks it done in the backlog. Run it once manually first ("Run now" in Scheduled sidebar) to pre-approve file tool permissions.

**Tier 1 backlog (in order):**
1. Chain-of-thought per criterion — per-criterion reasoning breakdown in results
2. Structured exclusion reason codes — PRISMA-aligned codes on each excluded decision
3. Export to CSV — download decisions as CSV for PRISMA flow / audit
4. PRISMA flow diagram integration — feed screening counts into existing PrismaFlowDiagram

---

## 8. Deployment Checklist

- [ ] Run Supabase migration `023_screening_results.sql`
- [ ] Verify `GEMINI_API_KEY` is set in Vercel environment
- [ ] Run scheduled agent once manually to pre-approve tools
- [ ] Smoke test: run a gap analysis → click "Screen reviews" → verify criteria appear → approve → verify results table renders

---

## 9. Build Status

```
✅ npx tsc --noEmit --skipLibCheck  → 0 errors
✅ All 5 new/modified files type-safe
✅ Backward compatible (screening_result optional throughout)
```

**Session completed**: 2026-06-09
