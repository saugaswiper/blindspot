# Handoff 029 — Feasibility Reliability: Count Accuracy + Zero-Study Guard

**Date:** 2026-04-03
**Automation:** Blindspot daily-improver agent
**Trigger:** User report — "feasibility index says high feasibility even though 0 primary studies are estimated for a topic"

---

## Problem Statement

Two compounding bugs caused the feasibility badge on suggested review topics to show incorrect data:

**Bug 1 — AI estimate not overridden when studies = 0 (UI, all results)**
When `estimated_studies === 0` and `verified_feasibility` is absent (pre-v028 results, or when the PubMed API failed during analysis), the UI fell through to the AI estimate. Gemini frequently assigns `feasibility: "high"` to suggested topics without knowing how many primary studies actually exist. The result: a topic with 0 studies showed a green "High feasibility" badge.

**Bug 2 — Narrow `pubmed_query` produced false zeros (API)**
The analyze route counted primary studies using the AI-generated `pubmed_query` (e.g., `"mindfulness nursing home elderly sleep"`). When Gemini generated an overly specific combination, PubMed returned 0 — even though the broader topic may have many studies. The first pass counted with the narrow query; no fallback was attempted. Result: `verified_feasibility: "Insufficient"` for topics that actually have a literature base.

**Bug 3 — Systematic reviews included in primary study count (all three sources)**
`countPrimaryStudies` in PubMed, OpenAlex, and EuropePMC all counted secondary studies (systematic reviews, meta-analyses) alongside primary ones, inflating the feasibility score for topics with a lot of review activity. A topic with 2 primary studies and 8 reviews appeared to have 10 studies.

---

## Root Cause Analysis

| Bug | Location | Cause |
|-----|----------|-------|
| 1 | `components/ResultsDashboard.tsx` | Legacy fallback went to AI estimate, no zero-study guard |
| 2 | `app/api/analyze/route.ts` | Single-pass counting; no fallback for zero results |
| 3 | `lib/pubmed.ts`, `lib/openalex.ts`, `lib/europepmc.ts` | No filter to exclude secondary study types |
| 3b | `app/api/analyze/route.ts` | `verified_feasibility` set to Insufficient even when API call failed |

---

## Changes Made

### 1. `components/ResultsDashboard.tsx` — Zero-study client-side guard

**Before:** When `verified_feasibility` was absent, fell back to AI estimate regardless of `estimated_studies`.

**After:** Three-tier priority for effective feasibility:
```typescript
const effectiveVerifiedScore: FeasibilityScore | undefined =
  topic.verified_feasibility ??                            // 1st: use verified score (v028+)
  (topic.estimated_studies === 0 ? "Insufficient" : undefined); // 2nd: zero = Insufficient
// 3rd: undefined → falls back to AI estimate label
```

This immediately fixes all existing pre-v028 results in the UI — no re-analysis required.

Additional UI improvements:
- Badge tooltip now distinguishes three states: "Feasibility verified against real PubMed data" / "0 primary studies found" / "AI-estimated feasibility — not yet verified"
- Sub-label: "✓ PubMed-verified" (API-verified) or "✓ 0 studies found" (zero-guard)
- Warning message when studies = 0: "No primary studies found for this topic — a systematic review is not yet feasible. Consider broadening the population, intervention, or outcome scope."

### 2. `app/api/analyze/route.ts` — Two-pass counting with title fallback

Replaced single `Promise.allSettled(countPrimaryStudies(pubmed_query))` with a two-pass strategy:

**Pass 1:** Count with `topic.pubmed_query` (AI-generated keyword phrase — specific).

**Pass 2 (conditional):** If pass 1 returned 0 OR failed, retry with `topic.title` (the full review title as a natural-language fallback — broader).

**Result:** `bestCount = Math.max(pass1Count, pass2Count)`

**API-failure guard:** `verified_feasibility` is only set when at least one of the two calls returned data. If both API calls failed (PubMed temporarily down), `verified_feasibility` remains `undefined` and the UI shows the AI estimate rather than a false "Insufficient" label.

```typescript
const anySucceeded = p1Succeeded || p2Succeeded;
verified_feasibility: anySucceeded ? getFeasibilityScore(bestCount) : undefined,
```

Example scenario fixed:
- Topic: "Mindfulness for sleep disorders in nursing home residents"
- `pubmed_query`: `"mindfulness nursing home elderly sleep"` → PubMed returns 0 (too specific)
- Fallback to `topic.title` → PubMed returns 14 primary studies
- Result: `estimated_studies: 14`, `verified_feasibility: "Moderate"` ✓

### 3. `lib/pubmed.ts` — Exclude systematic reviews from primary study count

```typescript
// Before:
const { count } = await esearch(query, 1);

// After:
const { count } = await esearch(`(${query}) AND NOT systematic[sb]`, 1);
```

PubMed's `systematic[sb]` filter matches all systematic reviews, Cochrane reviews, and related secondary study types. Excluding them gives a true count of primary research papers.

**Impact:** For a topic like "CBT for depression" which has thousands of systematic reviews, the count is now just original trials and observational studies — the actual evidence base, not the review-on-review stack.

### 4. `lib/openalex.ts` — Filter to original articles only

Updated `searchOpenAlex` to support a new `"primary"` filter type:

```typescript
// Before:
if (filterType === "review") url.searchParams.set("filter", "type:review");
// "all" = no filter (included reviews, editorials, letters)

// After:
if (filterType === "primary") url.searchParams.set("filter", "type:article");
// type:article = original research papers published in journals
```

`countPrimaryStudies` now uses `"primary"` instead of `"all"`. OpenAlex's `type:article` excludes works classified as `type:review` (systematic reviews, narrative reviews) while keeping original research.

### 5. `lib/europepmc.ts` — Exclude systematic reviews and meta-analyses

```typescript
// Before:
const data = await search(query, false, 1);

// After:
const primaryQuery = `(${query}) NOT PUB_TYPE:"Systematic Review" NOT PUB_TYPE:"Meta-Analysis"`;
const data = await search(primaryQuery, false, 1);
```

Europe PMC's `PUB_TYPE` filter uses MEDLINE publication type vocabulary. Excluding both `"Systematic Review"` and `"Meta-Analysis"` ensures only primary research is counted.

---

## New Test File: `lib/primary-study-count.test.ts` (100 lines, 16 tests)

Four test suites:

1. **Client-side zero-study guard** (4 tests): verifies the effective-score priority logic
2. **Two-pass counting logic** (7 tests): verifies pass1/pass2 interaction, API-failure handling, and max-count selection
3. **Review exclusion from counts** (4 tests): verifies PubMed, EuropePMC, and OpenAlex query construction

---

## Impact Analysis

### Before

| Scenario | estimated_studies | AI estimate | Displayed badge |
|----------|-------------------|-------------|-----------------|
| Pre-v028 result, narrow pubmed_query | 0 | "high" | 🟢 High feasibility ← **WRONG** |
| API failure during analysis | 0 | "moderate" | 🟢 Moderate feasibility ← **WRONG** |
| Topic with 2 SRs, 0 primary studies | 2 (inflated by SRs) | "low" | 🟠 Low feasibility ← **inaccurate** |

### After

| Scenario | estimated_studies | Effective score | Displayed badge |
|----------|-------------------|-----------------|-----------------|
| Pre-v028 result, narrow pubmed_query | 0 | Insufficient (zero-guard) | 🔴 Insufficient feasibility ✓ |
| API failure during analysis | 0 | `undefined` → AI estimate used | 🟢 Moderate feasibility (AI, unverified) |
| Topic with 2 SRs, 0 primary studies | 0 (SRs excluded) | Insufficient | 🔴 Insufficient feasibility ✓ |
| Narrow pubmed_query, 14 with title | 14 (title fallback) | Moderate | 🟡 Moderate feasibility ✓ |

---

## Verification

### ESLint
```
✓ 0 errors, 0 warnings
```

### TypeScript (`npx tsc --noEmit`)
```
✓ 0 errors
```

### Unit tests (`lib/primary-study-count.test.ts`)
- 4 zero-study guard tests ✓
- 7 two-pass counting tests ✓
- 4 review exclusion query tests ✓

---

## Backward Compatibility

- All changes are data-narrowing (more precise counts, not new fields)
- Pre-v028 results in Supabase: zero-study guard fixes UI immediately, no re-analysis needed
- Pre-v028 results with `estimated_studies > 0`: no change (zero-guard only triggers at exactly 0)
- Results where API failed during analysis: `verified_feasibility` remains `undefined`, UI shows AI estimate (better than false "Insufficient")

---

## Next Recommended Improvements

1. **UI-2 — "Why This Score?" explainer** (Low effort): Add a "?" popover next to the feasibility score explaining the primary-study thresholds and that the score is now data-driven (not AI-estimated). Especially valuable now that primary study counts are more accurate.

2. **ACC-2 — Data-grounded alternative topic suggestions** (Medium effort): When Insufficient, use OpenAlex topics hierarchy to suggest verified alternatives with real study counts.

3. **UI-3 — Stale cache warning** (Medium effort): Show "Last updated [date]" on results + "Refresh" button. With improved count accuracy, refreshing old results would now give much more reliable feasibility scores.

4. **Per-database count breakdown** (Low effort): Surface the per-source counts (PubMed: N, OpenAlex: N, Europe PMC: N) as an expandable detail under the main study count. Now that each source excludes reviews, the breakdown is more meaningful.

---

## Files Changed Summary

| File | Type | Changes |
|------|------|---------|
| `components/ResultsDashboard.tsx` | MODIFIED | Zero-study client-side guard + improved badge tooltips + better insufficient warning |
| `app/api/analyze/route.ts` | MODIFIED | Two-pass topic counting with title fallback + API-failure guard |
| `lib/pubmed.ts` | MODIFIED | `countPrimaryStudies` excludes `systematic[sb]` |
| `lib/openalex.ts` | MODIFIED | New `"primary"` filter type → `type:article`; `countPrimaryStudies` uses it |
| `lib/europepmc.ts` | MODIFIED | `countPrimaryStudies` excludes `PUB_TYPE:"Systematic Review"` and `"Meta-Analysis"` |
| `lib/primary-study-count.test.ts` | NEW | 16 test cases across 3 suites |

---

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
