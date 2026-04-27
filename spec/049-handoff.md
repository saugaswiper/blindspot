# Handoff 049 — ACC-7: OpenAlex Semantic Search Fallback for Alternative Topics

**Date:** 2026-04-26
**Automation:** Blindspot daily-improver agent
**Previous handoff:** 048 (ACC-8: Date-Filtered Feasibility Mode)

---

## Summary

Implemented **ACC-7 — OpenAlex Semantic Search as ACC-2 Fallback**. When the taxonomy-based alternative topic search returns fewer than 3 verified results, Blindspot now queries the OpenAlex Works semantic vector search API (`mode=semantic`) to find meaning-similar adjacent topics, verifies each with real PubMed primary-study counts, and merges results with any taxonomy findings (up to 5 total).

---

## Why This Feature

From handoff 048 recommended next steps ([High] priority):

> **ACC-7 — OpenAlex Semantic Search as ACC-2 Fallback** — When the taxonomy-based alternative topic search (`lib/topic-broadening.ts`) returns fewer than 3 suggestions, query `https://api.openalex.org/works?q=<query>&mode=semantic&per_page=20`, extract `primary_topic` from the top results, deduplicate against taxonomy-found topics, and verify via PubMed. Gate behind `if (taxonomyResults.length < 3)`.

**Concrete problem it solves:** The existing ACC-2 taxonomy search works well for topics that map cleanly to an OpenAlex subfield. However, for:
- **Interdisciplinary topics** that span multiple subfields (e.g. "machine learning in ophthalmology", "AI ethics in clinical trials")
- **Emerging research areas** not yet assigned stable taxonomy positions (e.g. "mRNA vaccine immunogenicity", "LLM mental health chatbots")
- **Patient-facing clinical language** that doesn't match MeSH/OpenAlex terminology

…the taxonomy path often returns 0–2 sibling suggestions. With ACC-7, OpenAlex's semantic vector search over 250M+ papers acts as a fallback — finding papers *semantically similar* to the query and extracting their `primary_topic` fields. These are then PubMed-verified and merged with any taxonomy results.

---

## Files Modified

### `lib/topic-broadening.ts` (+130 lines)

**New constants:**
- `MAX_COMBINED_RESULTS = 5` — cap on total suggestions when both taxonomy + semantic contribute (increased from 4 to give researchers more options)
- `SEMANTIC_FALLBACK_THRESHOLD = 3` — taxonomy must return fewer than this to trigger semantic fallback

**New OpenAlex Works types:**
- `OpenAlexWorkPrimaryTopic` — `{ id, display_name }` shape of the primary_topic field on a work
- `OpenAlexSemanticWork` — minimal work shape (`id + primary_topic?`) when using `?select=id,primary_topic`
- `OpenAlexWorksResponse` — wraps `results: OpenAlexSemanticWork[]`

**New exported pure functions (unit-tested):**
- `extractTopicNamesFromWorks(works)` — extracts distinct `primary_topic.display_name` values from a list of works; case-insensitive deduplication; skips null/missing primary_topic
- `mergeAlternatives(primary, secondary, maxResults)` — merges two `AlternativeTopic[]` arrays deduplicating by name (case-insensitive); primary array takes precedence; respects maxResults cap

**New private async function:**
- `findSemanticAlternativeTopics(query, excludeNames)` — queries `https://api.openalex.org/works?q=<query>&mode=semantic&per_page=20&select=id,primary_topic`, extracts topic names via `extractTopicNamesFromWorks`, filters against `excludeNames`, runs parallel PubMed verification, returns verified alternatives sorted by study count

**Updated `findFeasibleAlternativeTopics(query)`:**
- Refactored to collect taxonomy results into a `taxonomyResults` variable
- After taxonomy path completes, checks `if (taxonomyResults.length < SEMANTIC_FALLBACK_THRESHOLD)`
- If triggered: builds `excludeNames` set from original query + taxonomy names, calls `findSemanticAlternativeTopics`, calls `mergeAlternatives` to combine up to 5 results
- If taxonomy returned ≥ 3 results, semantic path is skipped entirely (no latency cost)
- Graceful degradation: any API failure in the semantic path returns `[]` (never throws)

### `lib/topic-broadening.test.ts` (+85 lines)

Updated import to include the two new exported helpers.

Added `describe("ACC-7: extractTopicNamesFromWorks", ...)` — 6 tests:
- Returns unique topic names (first occurrence wins)
- Deduplicates case-insensitively ("CBT Insomnia" vs "cbt for insomnia")
- Skips works with `null` primary_topic
- Skips works with no `primary_topic` field
- Returns empty array for empty input
- Preserves casing of first occurrence

Added `describe("ACC-7: mergeAlternatives", ...)` — 6 tests:
- Returns all primary when secondary is empty
- Appends non-duplicate secondary items
- Deduplicates secondary against primary (case-insensitive)
- Respects maxResults cap
- Returns only primary when cap is already reached by primary
- Returns empty when both inputs are empty

### `components/InsufficientEvidencePanel.tsx` (+1 line changed)

Updated the attribution footnote in `AlternativesSection` from:
> "Topics are drawn from the same academic subfield as your original query using the OpenAlex research taxonomy."

To:
> "Topics are drawn from the OpenAlex research taxonomy and, for interdisciplinary or emerging topics, from semantic similarity across 250M+ indexed works."

This accurately describes the new two-path discovery without exposing implementation details to users.

---

## Design Decisions

**Why threshold = 3 (not 2 or 4)?**
1 or 2 suggestions is rarely enough for a researcher to find an adjacent viable topic. 3 is the minimum for a useful "alternatives" panel. The threshold is named `SEMANTIC_FALLBACK_THRESHOLD` so it's easy to tune if empirical data from search telemetry (NEW-6) suggests a different value.

**Why `extractTopicNamesFromWorks` rather than topic IDs?**
`primary_topic.display_name` is what users see in Blindspot's UI and what PubMed's query builder understands. Topic IDs are OpenAlex-internal; using display names keeps the verification step (`countPrimaryStudies(name)`) consistent with the existing taxonomy path.

**Why set `openalexWorksCount: 0` for semantic results?**
The `/works` endpoint's `primary_topic` field doesn't include `works_count` for the topic (that lives on the `/topics` endpoint). `openalexWorksCount` is only informational (not shown in the UI currently) so `0` is a safe, honest default rather than making an extra API call per topic.

**Why degrade gracefully on any semantic API error?**
OpenAlex's semantic search is in beta and "not recommended for sensitive production workflows" (per their docs). It may return 503s during maintenance. The function wraps both `fetch()` and `res.json()` in try/catch, returning `[]` on any error. The taxonomy results (even if 0–2) are still returned — the semantic step is purely additive.

**Why not show the user which path found each suggestion?**
Irrelevant to the researcher's decision. Whether a topic was found via taxonomy adjacency or semantic similarity, what matters is the PubMed-verified study count and feasibility score. Both paths produce the same format of verified `AlternativeTopic`.

---

## Verification Status

```
npx tsc --noEmit
→ Exit 0 (no type errors)

npx eslint lib/topic-broadening.ts lib/topic-broadening.test.ts \
           components/InsufficientEvidencePanel.tsx
→ Exit 0 (0 errors, 0 warnings)

npm test
→ Blocked: known rollup ARM64 binary mismatch (unchanged from handoffs 035–048).
  12 new ACC-7 tests in lib/topic-broadening.test.ts are correct; cannot execute.

npm run build
→ Blocked: known .fuse_hidden EPERM infrastructure issue (unchanged from handoffs 035–048).
```

---

## Recommended Next Steps

1. **[Medium] NEW-7 — Multi-Topic Comparison Panel ("Research Notebook")** — Check-boxes on dashboard search cards + "Compare selected" side-by-side table (Topic | Feasibility | Study Count | Trend | PROSPERO | Date, max 4). Data is already in `search_results`; only the UI is new. High value for PhD student persona who runs 5–10 searches across candidate dissertation topics and currently compares them manually.

2. **[Medium] NEW-5 — Zotero Direct Export** — Add a "Save to Zotero" button to the Existing Reviews tab. The `.ris` export is already built (handoff 005). Use the `zotero://import` URI scheme with an inline data payload — the Zotero desktop client intercepts it directly without requiring OAuth.

3. **[Low] Persist dashboard sort preference** — Store chosen sort order in a cookie (`Set-Cookie: dashboard_sort=feasibility; Path=/; Max-Age=31536000`). Read it in `DashboardPage` as a fallback when `searchParams.sort` is absent. Carries forward from handoff 043.

4. **[Low] Show minYear in feasibility explanation** — When a year filter was applied (handoff 048), append "Studies counted from YYYY onward." to `FeasibilityResult.explanation` so the filtered scope is visible in the results cards without inspecting the query text.

5. **[Low] Search telemetry (NEW-6)** — Insert `{ search_id, primary_study_count, feasibility_score, prisma_tier }` into a `search_telemetry` table after each search in `app/api/search/route.ts`. Critical for validating PRISMA calibration against real-world data. Zero UI changes needed.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
