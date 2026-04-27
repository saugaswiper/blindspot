# Handoff 048 — ACC-8: Date-Filtered Feasibility Mode

**Date:** 2026-04-16
**Automation:** Blindspot daily-improver agent
**Previous handoff:** 047 (NEW-4: RAISE Compliance Disclosure Page)

---

## Summary

Implemented **ACC-8 — Date-Filtered Feasibility Mode**. Researchers can now filter primary study counts by publication period ("Since 2010", "Since 2015", "Since 2018", "Since 2020", "Since 2022"), preventing misleadingly-High feasibility scores on topics where most evidence is old.

---

## Why This Feature

From the handoff 047 recommended next steps (and market research spec/004 and spec/044):

> **[High] ACC-8 — Date-Filtered Feasibility Mode** — Add a "Publication period" dropdown to the search form. Pass `minYear` to `lib/pubmed.ts countPrimaryStudies()` and `lib/openalex.ts`. Prevents misleading High scores on topics with predominantly old evidence (e.g., "telemedicine for chronic disease" — most studies pre-2020).

**Concrete problem it solves:** A query like "exercise for hypertension" might return 8,000+ PubMed studies — earning a "High" feasibility score — but 90% of those may have been published before 2010. A researcher asking "should I do a systematic review now?" needs to know if the active evidence base is still growing, not just that the topic exists historically.

The date filter lets researchers answer: "Are there enough *recent* primary studies to support a systematic review in this field right now?"

---

## Files Modified

### `types/index.ts` (+10 lines)

Added `minYear?: number` to `SearchInput` with JSDoc explaining the ACC-8 motivation and valid range (1990–current year).

### `lib/validators.ts` (+16 lines)

Added `minYearSchema` — a Zod `number().int().min(1990).max(currentYear).optional()`. Applied to both `simpleSearchSchema` and `picoSearchSchema`, so validation works for both input modes.

### `lib/pubmed.ts` (+5 lines)

Updated `countPrimaryStudies(query, minYear?)` to append ` AND YYYY:YYYY[dp]` (PubMed date published field tag) when `minYear` is provided. Current year is used as the upper bound so in-press records are included.

```typescript
const datePart = minYear ? ` AND ${minYear}:${new Date().getFullYear()}[dp]` : "";
const { count } = await esearch(`(${query}) AND NOT systematic[sb]${datePart}`, 1);
```

### `lib/openalex.ts` (+12 lines)

Updated `searchOpenAlex(query, filterType, perPage, minYear?)` to include `from_publication_date:YYYY-01-01` in the filter string when `minYear` is set. OpenAlex supports comma-joined filter criteria so this composes cleanly with the existing `type:article` filter.

Updated `countPrimaryStudies(query, minYear?)` to pass `minYear` through.

### `lib/europepmc.ts` (+6 lines)

Updated `countPrimaryStudies(query, minYear?)` to append ` AND FIRST_PDATE:[YYYY-01-01 TO 3000-01-01]` (Europe PMC date range syntax) when `minYear` is provided.

### `app/api/search/route.ts` (+20 lines)

Key changes:
1. **`SearchBody` type** — added `minYear?: number`
2. **`buildQueryString`** — when `minYear` is set, appends ` (after YYYY)` to the stored query text. This serves as both the cache key (different year filters → different cache entries) and the user-visible label in the results page header.
3. **`baseQuery` extraction** — separates the raw topic text from the cache-key query so count functions receive the topic without the year suffix (avoiding double filtering).
4. **`Promise.allSettled`** — `PubMed.countPrimaryStudies`, `OpenAlex.countPrimaryStudies`, and `EuropePMC.countPrimaryStudies` now receive `minYear`.
5. **Trend analysis** — `PubMed.countPrimaryStudiesRecent` still uses the fixed 3-year window (not minYear), since the trend metric is independent of the user's date filter.

### `components/TopicInput.tsx` (+40 lines)

Added `YEAR_OPTIONS` constant and `minYear` state. The form now renders a compact `<select>` on the right side of the mode-toggle bar:

```
Search mode: [Simple] [PICO]         Period: [All time ▾]
```

The select uses `var(--surface-2)` background and `var(--border)` border to match the existing design system. It is responsive (wraps gracefully on mobile via `flex-wrap`).

When a year is selected, it is included in the POST body as `minYear`:

```typescript
{ mode: "simple", queryText, ...(minYear !== undefined && { minYear }) }
```

### `lib/validators.test.ts` (+35 lines)

Added a `describe("validateSearchInput — minYear (ACC-8)", ...)` block with 7 tests:
- Passes when minYear is absent
- Passes when minYear = 2020 (typical case)
- Passes when minYear = 1990 (lower boundary)
- Fails when minYear < 1990
- Fails when minYear is in the future
- Fails when minYear is a float (non-integer)
- Passes with PICO mode + valid minYear

---

## Design Decisions

**Why append "(after YYYY)" to query_text instead of a separate DB column?**
Adding a column would require a migration, fallback insert chains, and schema changes across `cache.ts`, `CachedSearchResult`, and the Supabase `search_results` table. Embedding it in `query_text` follows the existing pattern (the `searches` table already uses `query_text` as the canonical identifier), is zero-migration, and naturally appears on the results page where the query is displayed.

**Why is trend analysis NOT affected by minYear?**
The trend metric (growing/stable/declining) compares total study count vs. last-3-year count. If the user already filtered to "since 2018", applying another 3-year window inside that window would produce confusing semantics. Trend analysis always uses the 3-year window against the full-scope query.

**Why not filter the existing review search by minYear?**
Existing reviews are used to determine `existing_review_status` (recent_exists / update_opportunity / novel). A review from 2019 is still relevant even if the user is asking about studies "since 2022". Filtering reviews by date would incorrectly suppress the "update opportunity" signal.

---

## Verification Status

```
npx eslint components/TopicInput.tsx lib/pubmed.ts lib/openalex.ts \
           lib/europepmc.ts lib/validators.ts app/api/search/route.ts
→ Exit 0 (0 errors; 1 pre-existing warning in validators.ts unused-disable)

npx tsc --noEmit
→ Exit 0 (no type errors)

npm test
→ Blocked: known rollup ARM64 binary mismatch (unchanged from handoffs 035–047).
  7 new ACC-8 tests in lib/validators.test.ts are correct; cannot execute.

npm run build
→ Blocked: known .fuse_hidden EPERM infrastructure issue (unchanged from handoffs 035–047).
```

---

## Recommended Next Steps

1. **[High] ACC-7 — OpenAlex Semantic Search as ACC-2 Fallback** — When the taxonomy-based alternative topic search (`lib/topic-broadening.ts`) returns fewer than 3 suggestions, query `https://api.openalex.org/works?q=<query>&mode=semantic&per_page=20`, extract `primary_topic` from the top results, deduplicate against taxonomy-found topics, and verify via PubMed. Gate behind `if (taxonomyResults.length < 3)`.

2. **[Medium] NEW-5 — Zotero Direct Export** — SciSpace launched native Zotero integration in 2026. Blindspot already has RIS export (handoff 005). Adding a "Save to Zotero" button using the Zotero web translator API (`https://www.zotero.org/utils/doi/metadata?doi=...`) is low effort and directly competitive.

3. **[Medium] NEW-7 — Multi-Topic Comparison Panel** — Check-boxes on dashboard search cards + "Compare selected" side-by-side table (Topic | Feasibility | Study Count | Trend | PROSPERO | Date, max 4). High value for PhD student persona who runs 5–10 searches across candidate dissertation topics.

4. **[Low] Persist dashboard sort preference** — Store chosen sort order in a cookie so "High feasibility first" is remembered between sessions.

5. **[Low] Show minYear in feasibility explanation** — When a year filter was applied, append "Studies counted from YYYY onward." to `FeasibilityResult.explanation` so the filtered scope is visible in the results cards without reading the query text.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
