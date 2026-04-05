# Handoff 032 — ACC-2: Data-Grounded Alternative Topic Suggestions

**Date:** 2026-04-04
**Automation:** Blindspot daily-improver agent

---

## What Was Built

**ACC-2 — Data-Grounded Alternative Topic Suggestions**: When a topic returns Insufficient feasibility (<3 primary studies), the InsufficientEvidencePanel now fetches and displays up to 4 verified alternative topics in the same academic subfield — each backed by a real PubMed count.

```
Insufficient Evidence
Only 1 primary study was found. A systematic review is not feasible on this exact topic.
...
─────────────────────────────────
Paths forward

Explore related topics with sufficient evidence
  These adjacent topics are in the same research area and have been verified
  to have enough primary studies for a systematic review.

  ┌──────────────────────────────────────────────────┐
  │ Cognitive Behavioral Therapy for Anxiety         │ Moderate │
  │ 87 primary studies found →                       │          │
  └──────────────────────────────────────────────────┘
  ┌──────────────────────────────────────────────────┐
  │ Sleep Disorders Treatment                        │ High     │
  │ 234 primary studies found →                      │          │
  └──────────────────────────────────────────────────┘
  ...
  Study counts are verified from PubMed in real time. Topics are drawn from
  the same academic subfield as your original query using the OpenAlex
  research taxonomy.

Try a broader topic
  [Enter a broader topic…] [Search]

Consider a scoping review first
  ...
```

Each card links directly to a new Blindspot search for that topic.

---

## Why This Feature

From `spec/026-market-research.md` — ACC-2 (priority #4):

> "The existing `lib/related-searches.ts` generates related topic suggestions using AI (Gemini). These are purely language-model suggestions — the app does not verify that the suggested topics have sufficient studies. A researcher could click a 'related topic' and get another Insufficient result."

The problem this solves: when a user lands on an Insufficient result, they get stuck. The existing InsufficientEvidencePanel (built in handoff 027) showed a static text prompt to "try a broader topic" — but gave no concrete starting points. If the user clicked a Gemini-generated "related topic" from the gaps tab, they might land on another Insufficient result.

ACC-2 fixes this by:
1. Using the **OpenAlex Topics taxonomy** (4,500 research topics in domain > field > subfield > topic hierarchy) to discover adjacent research areas in the same academic subfield
2. **Verifying each candidate against PubMed** — only topics with ≥ 6 primary studies (Moderate threshold) are returned
3. Showing real study counts next to each suggestion so researchers know exactly what they're clicking into

This directly differentiates Blindspot from Elicit and SciSpace, which suggest related topics using AI without evidence verification.

---

## Technical Architecture

### Data flow

```
User's query returns Insufficient feasibility
    ↓
ResultsDashboard renders GapsTab with feasibilityScore="Insufficient"
    ↓
GapsTab renders InsufficientEvidencePanel with { primaryStudyCount, query }
    ↓
InsufficientEvidencePanel renders AlternativesSection
    ↓
useEffect: GET /api/alternatives?query=<query>&originalCount=<n>
    ↓
app/api/alternatives/route.ts
  ├── Auth check (returns [] silently for unauthenticated users)
  ├── Short-circuit if originalCount >= 6 (already Moderate — no alternatives needed)
  └── findFeasibleAlternativeTopics(query)
        ↓
      lib/topic-broadening.ts
        ├── searchTopics(query, 3)
        │   → GET https://api.openalex.org/topics?search=<query>&per-page=3
        ├── extractSubfieldId(topTopic.subfield.id)
        ├── fetchSiblingTopics(subfieldId, 20)
        │   → GET https://api.openalex.org/topics?filter=subfield.id:<id>&sort=works_count:desc&per-page=20
        ├── filterCandidates(siblings, topTopic.id, 50, 6)
        │   → exclude original, exclude < 50 works, cap at 6, sort desc
        └── Promise.allSettled(candidates.map(c => countPrimaryStudies(c.display_name)))
            → PubMed countPrimaryStudies for each (max 6 parallel)
            → keep only ≥ 6 studies
            → sort by pubmedCount desc
            → return top 4
    ↓
AlternativesSection receives alternatives: AlternativeTopic[]
    ↓
Renders clickable cards with displayName, pubmedCount, feasibility badge
Each card links to /?q=<encoded topic name>
```

### Zero UI impact for non-Insufficient results

The entire feature is gated behind `feasibilityScore === "Insufficient" && !gapAnalysis` (existing ACC-1 check). Users with High/Moderate/Low feasibility never see this code path.

### Graceful degradation

- API returns `{ alternatives: [] }` (not an error) when user is unauthenticated, query is short, OpenAlex is unavailable, or all PubMed counts come back < 6
- Loading state uses `alternatives === null` sentinel (avoids `setLoading` in `useEffect` which triggers cascading renders)
- `cancelled` flag in `useEffect` prevents state updates after unmount

---

## Files Created & Modified

### 1. `lib/topic-broadening.ts` (new, ~190 lines)

Core library file. Exports:

**Types:**
- `AlternativeTopic` — `{ displayName, pubmedCount, feasibility, searchUrl, openalexWorksCount }`

**Pure functions (testable, no I/O):**
- `extractSubfieldId(subfieldUrl: string): string | null` — extracts numeric ID from OpenAlex subfield URL (e.g. `"https://openalex.org/subfields/2738"` → `"2738"`)
- `filterCandidates(topics, originalId, minWorksCount, maxResults): OpenAlexTopic[]` — filters out original topic and noise (< 50 works), sorts desc, caps at maxResults

**API functions:**
- `searchTopics(query, perPage)` — queries `https://api.openalex.org/topics?search=<query>`
- `fetchSiblingTopics(subfieldId, perPage)` — queries `https://api.openalex.org/topics?filter=subfield.id:<id>&sort=works_count:desc`
- `findFeasibleAlternativeTopics(query): Promise<AlternativeTopic[]>` — main export; orchestrates the full pipeline

**Constants:**
- `MIN_STUDY_COUNT = 6` — Moderate feasibility threshold (Cochrane-aligned)
- `MAX_CANDIDATES = 6` — max parallel PubMed calls
- `MAX_RESULTS = 4` — max alternatives returned to client

### 2. `app/api/alternatives/route.ts` (new, ~65 lines)

`GET /api/alternatives?query=<query>&originalCount=<n>`

- Zod schema: `query` (string, 2–400 chars), `originalCount` (optional coerce integer ≥ 0)
- Auth check via Supabase session — returns `{ alternatives: [] }` (not 401) for unauthenticated users so the UI degrades silently
- Short-circuit: if `originalCount >= 6`, returns `{ alternatives: [] }` immediately
- All errors caught and returned as `{ alternatives: [] }` — alternatives are non-critical

### 3. `components/InsufficientEvidencePanel.tsx` (modified, +110 lines)

Added two new components and a new prop:

**New `query?: string` prop** — optional; when absent, the alternatives section is not rendered (preserves backward compatibility with any caller that doesn't yet pass query)

**New `AlternativeTopicCard` component** — renders a single verified alternative as a clickable card:
- Topic display name (left)
- Feasibility badge (right, colored)
- `"N primary studies found →"` (below, muted)
- Full card is an `<a>` tag linking to `/?q=<encoded topic>`

**New `AlternativesSection` component** — manages fetch + rendering:
- Shows 3 pulse-animation skeleton cards while loading
- Shows `AlternativeTopicCard` for each result
- Shows "No verified alternative topics found in this subfield." when empty
- Footnote: sources attribution + methodology note

**Inline `FEASIBILITY_BADGE` mapping** — duplicated locally (not imported from `lib/feasibility.ts`) to avoid a server/client module boundary issue. Uses `React.CSSProperties` for inline styles matching existing dark/light mode patterns.

### 4. `components/ResultsDashboard.tsx` (modified, +4 lines)

- Added `query?: string` prop to `GapsTab` component interface with JSDoc
- Passed `query={query}` to `<InsufficientEvidencePanel>` in the ACC-1 render branch
- Passed `query={query}` to `<GapsTab>` at the call site (line ~897)

### 5. `lib/topic-broadening.test.ts` (new, ~110 lines)

Two test suites covering the pure helpers:

**`extractSubfieldId` (7 tests):**
- Well-formed URL → extracts numeric ID
- Single-digit ID
- Long ID
- URL without subfields segment → null
- Empty string → null
- Non-digit segment → null
- Missing trailing ID → null

**`filterCandidates` (9 tests):**
- Excludes original topic by ID
- Excludes topics below `minWorksCount`
- Includes topics at or above `minWorksCount`
- Sorts descending by `works_count`
- Respects `maxResults` cap
- Returns empty when all topics are the original
- Returns empty when all topics are below `minWorksCount`
- Custom `minWorksCount = 0` includes everything non-original
- Original ID not in list: all qualifying topics returned

---

## User Experience

### Before

Researcher gets "Insufficient Evidence" for their narrow topic. The panel shows:
1. Header: "Only 1 primary study was found. Not feasible."
2. "Try a broader topic" — text box with no suggestions
3. "Consider a scoping review first" — link to JBI manual
4. "Register a primary research study" — ClinicalTrials link

The researcher has no idea where to go next. They might try a random variation or leave.

### After

The same panel shows an **"Explore related topics with sufficient evidence"** section (loads in ~2–3 seconds):

1. **Loading state**: 3 skeleton pulse cards animate while OpenAlex + PubMed are queried
2. **Results**: Up to 4 clickable cards, each showing:
   - Adjacent topic name from the same academic subfield
   - Real PubMed study count
   - Feasibility badge (Moderate/High)
3. **Empty state**: "No verified alternative topics found in this subfield. Try broadening your query manually using the search box below."

The researcher can click an alternative and immediately start a new, pre-validated Blindspot search.

---

## Backward Compatibility

- `query` prop on `InsufficientEvidencePanel` is optional — existing callers without `query` render as before (no `AlternativesSection`)
- `query` prop on `GapsTab` is optional — no default value required; TypeScript allows `string | undefined`
- All new API calls are error-tolerant: failures return `{ alternatives: [] }` so the panel remains functional
- The OpenAlex polite pool email header is set via `process.env.OPENALEX_EMAIL` (already set from `lib/openalex.ts` usage)

---

## Verification

### ESLint (`npx eslint app/api/alternatives/ components/InsufficientEvidencePanel.tsx lib/topic-broadening.ts lib/topic-broadening.test.ts`)

```
✓ 0 errors, 0 warnings
```

Previously caught and fixed:
- `react-hooks/set-state-in-effect`: Refactored loading state to use `alternatives === null` sentinel (avoids calling `setLoading(true)` inside `useEffect`)
- `@typescript-eslint/no-unused-vars`: Removed unused `_originalCount` parameter from `findFeasibleAlternativeTopics`

### TypeScript (`npx tsc --noEmit`)

```
✓ 0 errors (exit code 0)
```

### Unit Tests (`lib/topic-broadening.test.ts`)

- Note: Full `npm test` blocked by pre-existing rollup binary issue (documented since handoff 026)
- 7 `extractSubfieldId` tests written ✓
- 9 `filterCandidates` tests written ✓

---

## Files Changed Summary

| File | Type | Changes |
|------|------|---------|
| `lib/topic-broadening.ts` | NEW | ~190 lines: OpenAlex Topics API types, pure helpers, pipeline function |
| `app/api/alternatives/route.ts` | NEW | ~65 lines: GET endpoint with Zod validation, auth check, short-circuit |
| `components/InsufficientEvidencePanel.tsx` | MODIFIED | +110 lines: `query` prop, `AlternativesSection`, `AlternativeTopicCard`, `FEASIBILITY_BADGE` |
| `components/ResultsDashboard.tsx` | MODIFIED | +4 lines: `query` prop on GapsTab interface + two call-site additions |
| `lib/topic-broadening.test.ts` | NEW | ~110 lines: 16 tests across 2 suites |

---

## Next Recommended Features

From `spec/026-market-research.md` remaining priority list:

1. **UI-3 — Stale Cache Warning** — Medium effort, accuracy impact.
   - Show "Last updated [date]" on results (already have `created_at` in the data)
   - If > 30 days old, show "Refresh" button that re-runs the search with same params
   - Especially important now that per-source counts (v031) are richer — refreshing old results upgrades them

2. **ACC-5 — Enhanced "No SR Possible" Terminal State using per-source counts** — Low effort.
   - The `InsufficientEvidencePanel` is now strong with alternatives. Could surface the per-source breakdown:
   - "Blindspot searched PubMed (N), OpenAlex (N), Europe PMC (N) and found N total primary studies."
   - Uses the newly stored per-source counts (v031) to make the evidence of absence concrete

3. **NEW-1 — Persistent PROSPERO indicator on summary** — Low effort.
   - PROSPERO check (handoff 013) shows a one-time result, buried in a tab
   - Pinned badge on the result summary card: "PROSPERO: No match found" or "⚠ 2 possible matches"
   - Always visible without navigating to a tab

4. **NEW-3 — Boolean search operators in simple search box** — Low-medium effort.
   - Let users type `AND`, `OR`, `NOT`, `"phrases"` in the simple search box
   - `lib/boolean-search.ts` already has parsing logic

---

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
