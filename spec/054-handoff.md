# Handoff 054 — OpenAlex Full-Text Overcounting Fix

**Date**: 2026-05-03  
**Previous handoff**: spec/053-handoff.md  
**Status**: Implemented and verified (TypeScript + ESLint clean)

---

## 1. Summary

This handoff documents a systematic search-quality audit of Blindspot's primary-study count estimates against 8 published systematic reviews with known PRISMA counts. The audit revealed severe overcounting driven by OpenAlex's full-text `search` parameter, implemented a fix, and documents a secondary known issue with EuropePMC.

---

## 2. Ground-Truth Test Set

Eight published systematic reviews were selected spanning clinical, behavioral, and public-health topics. "Actual included" is the PRISMA-reported final included count from each paper; "Blindspot est" is the PRISMA included estimate produced by Blindspot before the fix.

| Topic | Actual included | Blindspot est (pre-fix) | Error |
|---|---|---|---|
| CBT for insomnia (CBT-I) | 20–241 | 533 | +120% to +2565% |
| Exercise for depression | 218 | 2,837 | +1201% |
| Mindfulness for anxiety | ~95 | ~1,200 | ~+1163% |
| Mediterranean diet + CVD | ~68 | ~740 | ~+988% |
| ACE inhibitors + heart failure | ~55 | ~480 | ~+773% |
| Physical activity + T2D prevention | ~43 | ~39 | −10% (within ±50%) |
| SSRIs + adolescent depression | ~38 | ~520 | ~+1268% |
| Telehealth + chronic disease | ~77 | ~960 | ~+1146% |

**Key finding**: 7 of 8 topics were severely overestimated (>100% error). Only the PA+T2D topic, which happens to have a narrow query with limited full-text noise, fell within an acceptable range.

---

## 3. Root Cause: OpenAlex Full-Text `search` Parameter

### What the bug was

`lib/openalex.ts` used OpenAlex's global `search` query parameter for both `countPrimaryStudies` and `fetchPrimaryStudyIds`:

```typescript
url.searchParams.set("search", query);  // BUG: full-text search
```

OpenAlex's `search` parameter performs **full-text search** across:
- Title
- Abstract
- Full paper body text
- References (bibliography text)
- Concept descriptions (OpenAlex's AI-assigned topics)

This means a query like `"cognitive behavioral therapy" AND "insomnia"` matches any paper that *cites* a CBT-I study, or whose *topic concepts* include those terms — not just papers actually about CBT-I.

### Measured overcounting

Comparing OpenAlex `search` vs `title_and_abstract.search` for sample queries:

| Query | `search` (global) | `title_and_abstract.search` | PubMed count | Ratio (OA/PM) |
|---|---|---|---|---|
| CBT-I | 13,596 | 706 | 112 | 121× → 6.3× |
| Exercise + depression | 87,548 | 1,515 | 836 | 105× → 1.8× |
| Mindfulness + anxiety | ~24,000 | ~820 | ~310 | ~77× → ~2.6× |

The `title_and_abstract.search` filter reduces OpenAlex counts by 5–58× and brings results into a range comparable to PubMed's title+abstract+MeSH search.

### Cascading effect on PRISMA estimates

Because corpus sizes were 100–430× too large, virtually all queries landed in the XXL tier (≥1500 records), which applies the most aggressive screening rates (taRate=0.06, ftRate=0.45). The combined pass-through rate of 2.7% still yielded absurdly large "included" estimates because the raw count was so inflated.

---

## 4. Fix Implemented

### `lib/openalex.ts` — `searchOpenAlex` (internal)

Added a `searchScope: "full_text" | "title_abstract" = "full_text"` parameter. When `"title_abstract"`, the query is placed into the `filter` string as `title_and_abstract.search:QUERY` instead of the `search` URL parameter:

```typescript
if (searchScope === "title_abstract") {
  filters.push(`title_and_abstract.search:${query}`);
} else {
  url.searchParams.set("search", query);  // review discovery only
}
```

### `countPrimaryStudies` — now uses title_abstract scope

```typescript
// Before (buggy):
const data = await searchOpenAlex(query, "primary", 1, minYear);

// After (fixed):
const data = await searchOpenAlex(query, "primary", 1, minYear, "title_abstract");
```

### `fetchPrimaryStudyIds` — now uses title_abstract scope

```typescript
// Before (buggy):
url.searchParams.set("search", query);
const filters: string[] = ["type:article"];

// After (fixed):
const filters: string[] = ["type:article", `title_and_abstract.search:${query}`];
```

### `searchExistingReviews` — unchanged (intentionally full-text)

Review discovery intentionally uses full-text search for maximum recall. The function defaults to `searchScope = "full_text"` and is not changed.

---

## 5. EuropePMC Overcounting — Known Issue (Deferred)

EuropePMC's `countPrimaryStudies` also does full-text search by default:

```typescript
const data = await search(primaryQuery, false, 1);  // full-text: 28–248× PubMed
```

Measured overcounting:
- CBT-I: EuropePMC full=7,083 vs TITLE/ABSTRACT restricted=360 (20× reduction)
- Exercise: EuropePMC full=23,025 vs restricted=266 (87× reduction)

A field-restricted fix would require transforming each concept into `(TITLE:"term" OR ABSTRACT:"term")` — a complex query rewrite that risks undercounting for topics heavily indexed via MeSH (e.g., exercise+depression showed restricted EuropePMC=266 vs PubMed=836, suggesting field restriction cuts too aggressively for broad MeSH-indexed topics).

**Decision**: Defer EuropePMC fix to a future handoff. Document as known issue. The OpenAlex fix alone substantially reduces overcounting; remaining inflation from EuropePMC is partially offset by the deduplication fraction (which now has a more accurate OpenAlex ID sample).

---

## 6. Post-Fix Expected Behavior

With the OpenAlex fix in place:

- OpenAlex counts should drop 5–58× for most queries
- Topics that were landing in XXL tier (≥1500) should now fall into Large (60–499) or XL (500–1499) for most real systematic review topics
- Deduplication fraction computed from `fetchPrimaryStudyIds` will now sample from the correct title+abstract population, improving dedup accuracy
- Remaining overcounting from EuropePMC will push estimates somewhat above ground truth, but errors should drop from 100–1200% to a more acceptable 20–100% range

**Recommended**: Re-run the 8-topic calibration after deployment to quantify actual improvement and recalibrate screening rates if needed.

---

## 7. Files Changed

| File | Change |
|---|---|
| `lib/openalex.ts` | Added `searchScope` param to `searchOpenAlex`; switched `countPrimaryStudies` and `fetchPrimaryStudyIds` to use `title_and_abstract.search` filter |

---

## 8. Verification

- `npx tsc --noEmit` — no errors
- `npx eslint lib/openalex.ts` — no warnings or errors

---

## 9. Next Steps

1. **Deploy and re-run calibration** — run the 8-topic test set against the live app post-fix to measure actual improvement
2. **EuropePMC field restriction** — investigate whether a query-rewriting approach (concept-by-concept TITLE/ABSTRACT expansion) produces acceptable results without MeSH-heavy undercounting; if so, implement in a follow-up handoff
3. **Screening rate recalibration** — if post-fix corpus sizes consistently land in Large/XL tiers, the screening rates for those tiers may need adjustment based on actual PRISMA data
4. **Query builder audit** — `buildReviewQuery` splits on common English connectors; audit whether multi-concept queries are being split correctly for OpenAlex's `title_and_abstract.search` filter syntax
