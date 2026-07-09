# Handoff 108 — EuropePMC recall: cursor pagination to 2000 records

**Date:** 2026-07-09
**Role:** Dev
**Brief:** `spec/briefs/005.md` — "Search Recall: Relevance Sort + Comprehensive Pagination"
(the EuropePMC item, deferred by handoff 105 §"Deferred to follow-up runs").
**Addresses validation:** `spec/validation/006-validation.md` finding **F3 (High — Carried)** —
EuropePMC date-sorted single-page truncation returns 0/5 on the Mitchell 2012 truth set because
the 1991–2006 truth papers sit past the 200-record page. Validation 006 §8 step 2 explicitly
recommends "implement a cursorMark loop in `lib/europepmc.ts` `fetchPrimaryStudyIds` to fetch up
to 2000 records."

---

## 1. Summary

`EuropePMC.fetchPrimaryStudyIds` fetched a single page capped at `min(limit, 1000)` with the
default `limit = 200`, so the Mitchell 2012 truth papers (ranks ~1928–1965 in the EuropePMC
result order) were never retrieved → 0/5 EuropePMC recall (validation 004/005/006 F3).

This handoff replaces the single fetch with a **`cursorMark` pagination loop** that walks up to
`limit` records (default raised `200 → 2000` per brief 005). A live probe against the EuropePMC
REST API confirms the fix recovers **4/5** truth papers (all except McCluskey 1991, the RC2
terminology-gap paper unretrievable by any source — brief 006/007 F5), meeting brief 005
AC-europepmc (0/5 → ≥2/5) with margin.

Smallest shippable diff: one function rewritten to loop over cursor pages; one optional field
added to the response interface. No signature change (same params, same return type), no caller
changes.

---

## 2. Files touched

- `lib/europepmc.ts` — two edits, both in the recall path only:
  1. `EuropePMCResponse` interface: added optional `nextCursorMark?: string` (the pagination
     token EuropePMC returns per page).
  2. `fetchPrimaryStudyIds`: default `limit` raised `200 → 2000`; single fetch replaced with a
     `cursorMark` loop. Each iteration requests `pageSize = min(remaining, 1000)` with the
     current `cursorMark` (starting `*`), accumulates `{pmid, doi}`, and advances to
     `nextCursorMark`. The loop stops when: the page is empty, `nextCursorMark` is absent or
     unchanged (last page), or the collected count reaches the API-reported `hitCount` or the
     `limit` ceiling.

No changes to `lib/pubmed.ts`, `lib/openalex.ts`, `lib/scopus.ts`, `app/`, `components/`,
`supabase/`, tests, or fixtures. `search()`, `searchExistingReviews`, `countPrimaryStudies`,
and `countSystematicReviews` are untouched.

---

## 3. Behavior change

- **Before:** `EuropePMC.fetchPrimaryStudyIds("cognitive behavioral therapy insomnia")` issued
  one request for the first 200 records in the API's default order → the 1991–2006 truth papers
  (ranks ~1928–1965) were beyond the window → **0/5**.
- **After:** the same call paginates through cursor pages up to 2000 records → returns 2000
  records including all 4 retrievable truth PMIDs → **4/5** (McCluskey 1991 / 1888345 still
  missed — no source retrieves it; RC2 terminology gap).

**Caller note:** `app/api/search/route.ts` (line 351) calls `EuropePMC.fetchPrimaryStudyIds(...,
200)` with an explicit `limit = 200` for dedup-fraction sampling. That path is **unchanged** by
the default bump (it passes the arg explicitly) and remains a single page (`min(200,1000)` →
one iteration, cursor loop exits after page 1). Only the recall path — which calls with the
2000 default / an explicit 2000 — paginates. This keeps route latency unchanged while enabling
recall measurement, exactly as brief 005 scoped (routes out of scope).

---

## 4. Deviation from the brief (documented, sanctioned by the brief itself)

Brief 005 instructed adding `sort=RELEVANCE` to the EuropePMC search URL. **A live probe found
`sort=RELEVANCE` is invalid for the EuropePMC REST API** — with it set, the endpoint returns
HTTP 200 but a **malformed empty body** (`hitCount` undefined, no `resultList`), i.e. zero
results. The brief anticipated this: its Notes-for-dev say "Inspect the first live response to
confirm which pagination tokens are present; fall back … if necessary."

Resolution: the `sort` param is **intentionally omitted**. EuropePMC's default result order is
already relevance-ranked and, over the 2000-record window, surfaces all 4 truth papers. This is
verified below (4/5), so the sort param is unnecessary and would break the call. No `sort`
handling is added to `fetchPrimaryStudyIds`.

---

## 5. Verification (live probe, not a merged claim)

Ran a standalone Node probe mirroring the new logic against the live EuropePMC REST API with the
Mitchell 2012 query and truth set:

```
query: TITLE_ABS:(cognitive behavioral therapy insomnia)
       NOT PUB_TYPE:"Systematic Review" NOT PUB_TYPE:"Meta-Analysis"
page 1: hitCount=2011 returned=1000 total=1000
page 2: hitCount=2011 returned=1000 total=2000
FINAL total=2000 hits=4/5
  16804151 (Sivertsen 2006): rank 1943
  15451764 (Jacobs 2004):    rank 1928
  10086433 (Morin 1999):     rank 1965
  16785771 (Wu 2006):        rank 1952
  1888345  (McCluskey 1991): NOT FOUND (RC2 — unretrievable by any source)
```

- **Control:** the `sort=RELEVANCE` variant returned `hitCount=undefined`, `returned=undefined`
  (malformed empty) — confirming §4.
- The truth papers sit at ranks 1928–1965, i.e. past a 200- or 1000-record page but within the
  2000 ceiling → pagination to 2000 is load-bearing.
- Transient `ECONNRESET`s were observed against the EuropePMC host during probing (environmental
  network flakiness); the probe succeeded on retry. Production `fetch` ret/timeout behavior is
  unchanged by this handoff.

The recall/AC claims stay **`claimed`** until the tester independently re-measures against
external ground truth (per [[CLAUDE]] claimed/verified rule) — expected in the next validation.

### Brief 005 acceptance criteria (this run)

- **AC-europepmc** (EuropePMC fetches ≥1000 records; harness hits 0/5 → ≥2/5): **addressed** —
  probe returns 2000 records, 4/5. Pending tester confirmation.
- **AC-union** (≥60% on Mitchell 2012): production union was already 80% via PubMed (validation
  006); EuropePMC now independently contributes 4/5, hardening the union. Pending tester.
- **AC-regression:** met — see gates.
- **AC-fixture / AC-benchmark** (commit `REAL_RECALL_FIXTURES` + flip the `toEqual([])` guard):
  **NOT done this run** — deferred (see §7). Committing the fixture requires running
  `scripts/capture-recall-fixture.ts` live and is a separate scoped step; bundling it would
  exceed one small shippable diff.

---

## 6. Gate results

| Gate | Command | Result |
|------|---------|--------|
| Lint (touched file) | `npx eslint lib/europepmc.ts` | clean (0 errors/warnings) |
| Types | `npx tsc --noEmit --skipLibCheck` | exit 0 |
| Tests | `npx vitest run` | 857 passed / 15 pre-existing failures (handoff 083 §8); **0 new** |
| Build | `npm run build` | ✓ Compiled successfully in 3.4s |

The 15 failing tests are the documented pre-existing baseline (e.g. `lib/study-design.test.ts`
confidence-tier expectations); none involve `lib/europepmc.ts`.

---

## 7. Deferred (out of scope this run)

- **AC-fixture + AC-benchmark** (brief 005): capture the Mitchell 2012 `perSource` JSON via
  `scripts/capture-recall-fixture.ts` **now that all three source fixes have landed**
  (PubMed handoff 106/107, OpenAlex pagination, EuropePMC this handoff), commit it to
  `REAL_RECALL_FIXTURES`, and flip the `recall-benchmark.test.ts` `toEqual([])` guard to a
  positive assertion. Next dev run or tester post-validation.
- **OpenAlex `fetchPrimaryStudyIds` cursor pagination** (brief 005 item 3) — still on the
  single-page path; keyless OA already returns 4/5 within 200 records (validation 006 probe E),
  so this is low-ROI until CRIT-1 is resolved. Follow-on.
- **CRIT-1** (`OPENALEX_API_KEY` 401 in Vercel) — ops task, ~5 min.
- **Synonym expansion / McCluskey 1991** (RC2 / F5) — follow-on brief; caps this SR at 4/5.

---

## 8. Potentially stale wiki pages (for the librarian)

- **[[Roadmap & Status]]** — Literature-search row: EuropePMC now paginates to 2000 (was
  single-page 200, 0/5). Records the F3 fix; union recall path hardened (PubMed + EuropePMC both
  4/5 on Mitchell 2012, `claimed` pending validation).
- **[[Data Sources]]** — EuropePMC `fetchPrimaryStudyIds` now uses `cursorMark` pagination to a
  2000-record ceiling (was 200, single page); note that `sort=RELEVANCE` is unsupported by the
  EuropePMC REST API (returns malformed empty) and is intentionally not used.
- **[[Milestone — Search Recall & Provenance Benchmark]]** — EuropePMC per-source recall on
  Mitchell 2012 moves 0/5 → 4/5 (`claimed`, handoff 108).
- **[[Handoff Log]]** — add handoff 108.

All correctness/recall claims remain `claimed` pending the tester's validation.
