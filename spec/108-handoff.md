# Handoff 108 — EuropePMC cursor pagination in `fetchPrimaryStudyIds` (recall fix)

**Date:** 2026-08-07
**Role:** Dev
**Brief:** `spec/briefs/005.md` — "Search Recall: Relevance Sort + Comprehensive Pagination"
(the deferred EuropePMC item; handoff 105 shipped only the PubMed portion and explicitly
deferred the "riskier two-pass loop" for EuropePMC and OpenAlex).
**Addresses validation:** `spec/validation/006-validation.md` finding **F3 (High — Carried,
005 F4)** and §8 recommended next step #2 — EuropePMC date-sorted single-page truncation
(production 185 records, **0/5 recall**). Cursor mechanism was confirmed viable in validation
006 probe C2 (advances, no infinite loop).

---

## 1. Summary

`lib/europepmc.ts` `fetchPrimaryStudyIds` previously issued **one** `search` request with
`pageSize = min(limit, 1000)`, date-sorted (EuropePMC default). Validation 006 measured this
at **0/5 recall** on the Mitchell 2012 truth set: total = 1994 records, but the 1991–2006 truth
papers sit past position ~1400 (date-sort buries old papers), so a single 185/200-record page
never reaches them.

This handoff replaces the single-page fetch with a **`cursorMark` deep-pagination loop** that
fetches up to `limit` records (default raised `200 → 2000`) in 1 000-record pages, sorted
`RELEVANCE`. Because the full result set (1994) is below the 2000 ceiling, the loop retrieves
**all** records regardless of sort order, recovering the 4 retrievable truth papers. (The 5th,
McCluskey 1991 / PMID 1888345, remains unretrievable by any source — validation 006 F5 / RC2,
out of scope.)

This is **one scoped stage**. The other deferred brief-005 items remain **deferred** (see §6).

---

## 2. Files touched

| File | Change |
|------|--------|
| `lib/europepmc.ts` | (1) Added `nextCursorMark?: string` to the `EuropePMCResponse` interface. (2) Rewrote `fetchPrimaryStudyIds`: default `limit` `200 → 2000`; single-page fetch → `cursorMark` loop (`*` → follow `nextCursorMark`) in `pageSize = min(limit - collected, 1000)` pages; added `sort=RELEVANCE`; loop terminates when a page is empty, no `nextCursorMark` is returned, or the cursor stops advancing; result sliced to `limit`. |

No changes to any other function (`search`, `searchExistingReviews`, `countPrimaryStudies`,
`countSystematicReviews` untouched), no route/UI/schema changes.

---

## 3. Behavior

- **Recall path (harness / capture script, `limit = 2000`):** cursor loop issues ~2 requests
  (1000 + 994) to retrieve the full 1994-record set → the 4 retrievable Mitchell 2012 truth
  papers are now within the returned set (previously 0/5). Expected to lift EuropePMC from
  **0/5 → 4/5** on the tester's re-run, matching the OpenAlex-keyless and PubMed_NEW ceiling.
- **Production path (`app/api/search/route.ts`, `limit = 200`, unchanged):** `min(200, 1000)`
  = one 200-record page, then the loop breaks (collected ≥ limit). **Identical to prior
  behavior — no added latency** for the overlap-estimation caller, which deliberately caps at
  200 (per its inline comment) and is out of brief-005 scope.
- **Loop safety:** three independent break guards (empty page, missing cursor, non-advancing
  cursor) prevent an infinite loop at end-of-set — the failure mode validation 006 C2 checked
  for and found absent.

**Provenance:** the "EuropePMC 0/5 → 4/5" recall lift is **`claimed` (handoff 108)** until the
tester re-runs the live-network harness. Only PubMed's 4/5 is currently `verified` (validation
006). The cursor mechanism itself was confirmed viable by validation 006 probe C2.

---

## 4. Design note — RELEVANCE sort vs. full pagination

The brief specified `sort=RELEVANCE`; validation 006 C2 demonstrated the cursor mechanism using
EuropePMC's **default (date)** sort. Both are safe here: with total (1994) < ceiling (2000) the
loop fetches every record, so recall does not depend on sort order for this fixture. `RELEVANCE`
is retained per the brief because it improves ranking for topics whose result set **exceeds** the
2000 ceiling (where only the top-ranked pages are kept). The break guards make an unexpected
`RELEVANCE`+`cursorMark` interaction fail safe (early stop), never an infinite loop.

---

## 5. Gate results

| Gate | Result |
|------|--------|
| `npx tsc --noEmit --skipLibCheck` | ✅ **0 errors** |
| `npm run lint` | ✅ `lib/europepmc.ts` **clean** — no new errors/warnings. Repo-wide pre-existing error count unchanged (~444, all in files not touched here: `@ts-ignore` test scaffolds, `HeroSourceLogos.tsx`, `006-harness.mjs`). |
| `npm run build` | ✅ **Compiled successfully in 2.7s** |
| `npx vitest run` | ✅ No new failures. **12 pre-existing failures** across unrelated modules (`boolean-search-builder`, `cache-freshness`, `cache-topic-search`, `keyboard-shortcuts`, `protocol-storage`, `study-design`, `use-persistent-*`) — none import or exercise `europepmc`. No test covers `fetchPrimaryStudyIds` (grep-confirmed). |

> Note: unit-test totals now read 12 failed / 872 (roadmap recorded 15 / 857) — tests have been
> added since; the delta is not caused by this change.

---

## 6. Deferred (still open from brief 005 / validation 006)

- **OpenAlex `fetchPrimaryStudyIds` cursor pagination** (brief 005, `lib/openalex.ts` ~line 192)
  — not touched. OpenAlex keyless already returns 4/5 within 200 records; blocked on **CRIT-1
  (F2, ops)** for the keyed production path.
- **Mitchell 2012 real fixture** (`lib/fixtures/recall-fixtures.ts`) + **`recall-benchmark.test.ts`
  `toEqual([])` guard flip** (brief 005 AC-fixture / AC-benchmark) — requires running the live
  `scripts/capture-recall-fixture.ts` (network) *after* this fix, so the captured `perSource`
  reflects the new paginated output. Defer to a run with live-network capture, or fold into the
  tester's validation 007.
- **CRIT-1 (F2, ops):** `OPENALEX_API_KEY` 401 — ops action, not code.
- **McCluskey 1991 synonym expansion (F5 / brief 006):** structural terminology gap; ceiling
  stays 4/5 until synonym expansion ships.

---

## 7. For the tester (suggested validation 007)

Re-run the EuropePMC arm of the `spec/validation/006-harness.mjs` recall probe against the fixed
`fetchPrimaryStudyIds` with `limit = 2000`:
- **Expected:** EuropePMC hits 0/5 → **4/5** (missing only McCluskey 1991), via ~2 cursor pages
  over the 1994-record set.
- Confirm the cursor loop terminates (no hang) and returns ≤ 2000 records.
- Union recall (PubMed_NEW + EPMC + OA-keyless) remains 4/5 = 80% (EPMC now additive-capable but
  finds the same 4 papers; ceiling still gated by McCluskey RC2 + CRIT-1).

Flip "EuropePMC `fetchPrimaryStudyIds` recovers truth papers via pagination" from `claimed
(handoff 108)` → `verified` only on a passing live re-run.

---

## 8. Stale wiki pages (for the librarian)

- **[[Data Sources]]** — EuropePMC `fetchPrimaryStudyIds` now cursor-paginates to a 2000-record
  ceiling with `RELEVANCE` sort (was single 200-record date-sorted page).
- **[[Roadmap & Status]]** — validation 006 F3 (EuropePMC date-sorted truncation) now has a
  `claimed` code fix pending tester verification; §Literature search "Remaining" list.
- **[[Milestone — Search Recall & Provenance Benchmark]]** — EuropePMC pagination shipped
  (claimed); fixture/benchmark items still deferred.
- **[[Handoff Log]]** / **[[index]]** — add handoff 108.
