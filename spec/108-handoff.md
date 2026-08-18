# Handoff 108 — EuropePMC recall: RELEVANCE sort + cursorMark pagination to 2 000

**Date:** 2026-08-18
**Role:** Dev
**Brief:** `spec/briefs/005.md` — "Search Recall: Relevance Sort + Comprehensive Pagination",
the **EuropePMC item** (row 2 of the "Exact files to touch" table). This is the next
unimplemented item of brief 005; handoff 105 explicitly implemented only item 1 (PubMed),
and handoffs 106/107 completed the PubMed binary-`NOT` correctness fix.
**Addresses validation:** `spec/validation/006-validation.md` finding **F3 (High — Carried)** —
EuropePMC date-sorted single-page truncation returned 185 records, 0/5 recall on the Mitchell
2012 truth set; the 1991–2006 truth papers sit past the retrieval window. Validation 006 §8
step 2 requested exactly this: "implement a cursorMark loop in `lib/europepmc.ts`
`fetchPrimaryStudyIds` to fetch up to 2000 records."

---

## 1. Summary

`lib/europepmc.ts` `fetchPrimaryStudyIds` previously issued a **single** `/search` request,
date-sorted (EuropePMC default), with `pageSize = min(limit, 1000)` and `limit` defaulting to
`200`. Under default date sort the older truth-set papers were never in the retrieved page →
0/5 recall (validation 006 C1/C2, F3).

This handoff replaces that single fetch with the brief's specified retrieval design:

1. **Default `limit` `200 → 2000`** — matches the PubMed 2 000-record ceiling (handoff 105).
2. **`sort=RELEVANCE`** added to the search URL — surfaces topically-matched studies ahead of
   the default date order, the mechanism that let PubMed reach 4/5 (validation 006 B).
3. **cursorMark pagination loop** — first request uses `cursorMark=*`; each response's
   `nextCursorMark` seeds the next request, pages of up to 1 000, until (a) `limit` records are
   collected, (b) a page is empty, or (c) the cursor stops advancing (`next === cursorMark` /
   absent). The cursor-advance guard also prevents an infinite loop if the API repeats a token.
   Validation 006 C2 already confirmed the cursorMark mechanism is viable (cursor advances, no
   loop).
4. **`EuropePMCResponse` interface** gained `nextCursorMark?: string`.

The function returns `collected.slice(0, limit)` — capped at the ceiling even if the last page
overshoots.

## 2. Files touched

| File | Change |
|------|--------|
| `lib/europepmc.ts` | `EuropePMCResponse` gains `nextCursorMark?: string`. `fetchPrimaryStudyIds` default `limit` `200 → 2000`; adds `sort=RELEVANCE`; replaces the single fetch with a `cursorMark` pagination loop (pages of ≤1 000) up to the ceiling. Docstring updated to cite validation 006 F3. |

No other files changed. `search()`, `searchExistingReviews`, `countPrimaryStudies`,
`countSystematicReviews` are untouched (per brief: "No change to `search()`").

## 3. Behavior / compatibility

- **Production dedup path is unaffected in cardinality:** `app/api/search/route.ts:351` calls
  `EuropePMC.fetchPrimaryStudyIds(reviewQuery, minYear, 200)` with an **explicit** `200`, so the
  default-limit change does not alter it. With `limit=200` the loop makes a single request
  (`collected.length` reaches 200 → loop exits), same request count as before. The only change on
  that path is `sort=RELEVANCE` + `cursorMark=*`, which reshuffles the 200-record dedup **sample**
  (acceptable — it is a dedup-fraction sample, not an ordered result).
- **Recall/capture path** (`scripts/capture-recall-fixture.ts`, `--limit 2000`) now paginates to
  2 000 relevance-sorted records — the intended fix.
- No API/route/UI/type changes.

## 4. Gate results

| Gate | Result |
|------|--------|
| `npx eslint lib/europepmc.ts` | **clean** (0 problems on the changed file) |
| `npm run lint` (whole repo) | 444 errors / 3921 warnings — **identical to clean-`main` baseline** (verified via `git stash`); **0 new** introduced by this change. Pre-existing errors are in test-utils (`@ts-ignore`), validation harnesses, and components — none in touched code. |
| `npm test` | **860 passed / 12 failed (872 total)** — matches the documented baseline (roadmap "860/872, 0 new failures"; handoff 083 §8). Failures are in `boolean-search-builder`, `cache-freshness`, `cache-topic-search`, `keyboard-shortcuts`, `protocol-storage`, `study-design`, and 3 persistent-filter hook tests — **none EuropePMC/retrieval-related**. **0 new failures.** |
| `npm run build` | **✓ Compiled successfully in 4.4s** |

## 5. Which brief/validation this addresses

- **Brief 005**, EuropePMC row — **implemented**.
- **Validation 006 F3** (EuropePMC date-sorted truncation) — code fix shipped; awaits tester
  re-measurement (see below).

Methodology status: the recall improvement is **`claimed`** until a tester validation re-runs
the live harness. Validation 006 measured EPMC at 0/5 with the old code; whether RELEVANCE +
pagination recovers ≥2/5 (brief 005 AC-europepmc) must be **verified** against Mitchell 2012 by
the tester before any claim flips. Note the brief's own caveat (§Notes): if `nextCursorMark` is
absent from the live response schema, the tester should flag it — but validation 006 C2 already
observed `nextCursorMark` present and advancing, so the cursor path is expected to work.

## 6. Deferred (remaining brief 005 items — NOT done this run)

Per the one-scoped-stage / smallest-shippable rule, only the EuropePMC item shipped. Still open:

1. **OpenAlex** `fetchPrimaryStudyIds` cursor pagination + `limit 2000` (brief 005 row 3). Code
   fix is unblocked, but OpenAlex is a non-contributor to union recall until **CRIT-1**
   (`OPENALEX_API_KEY` 401) is resolved — an ops task.
2. **Fixture** — populate `REAL_RECALL_FIXTURES` with Mitchell 2012 via
   `scripts/capture-recall-fixture.ts` (brief 005 row 4). Must run **after** all three source
   fixes land so the captured `perSource` reflects fixed retrieval — so this follows the OpenAlex
   item.
3. **Benchmark guard** — replace `expect(REAL_RECALL_FIXTURES).toEqual([])` in
   `lib/recall-benchmark.test.ts:116` with a positive assertion (brief 005 row 5). Depends on the
   fixture being populated.

## 7. Now-stale wiki pages (for the librarian)

- **[[Roadmap & Status]]** — Literature search row: EuropePMC pagination fix now shipped
  (`claimed`); update the "Remaining" list. Note the roadmap already references a "handoff 108"
  and "validation 007" that had **no backing files in the repo** at this run — this handoff is the
  real 108; reconcile that discrepancy (code wins per [[CLAUDE]]).
- **[[Data Sources]]** — EuropePMC `fetchPrimaryStudyIds` now uses RELEVANCE sort + cursorMark
  pagination to a 2 000-record ceiling (was single-page, date-sorted, 200-record default).
- **[[Milestone — Search Recall & Provenance Benchmark]]** — F3 remediation shipped (`claimed`),
  pending tester re-measurement of EPMC per-source recall on Mitchell 2012.
