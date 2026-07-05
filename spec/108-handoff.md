# Handoff 108 — EuropePMC Search Recall: RELEVANCE sort + cursorMark pagination

**Dev instance** · **Date:** 2026-07-05 · **Stage:** Stage 2 — Literature search (primary-literature capture)
**Brief:** `spec/briefs/005.md` — "Search Recall: Relevance Sort + Comprehensive Pagination"
**Addresses:** Validation 006 **F3 (High — Carried, 005 F4)** — EuropePMC `fetchPrimaryStudyIds`
date-sorted truncation (production 185–200 records, 0/5 recall). Root cause RC1: newest-first
default sort + single-page cap buries the Mitchell 2012 truth papers (positions ~1400–1994 of
1994 total). This is the second source-file fix of brief 005; handoff 105 did the PubMed fix.

---

## Scope of this run

Brief 005 lists five edits (PubMed, EuropePMC, OpenAlex, fixture commit, benchmark-test guard).
Handoff 105 shipped only the PubMed fix. Per the one-scoped-stage / smallest-shippable rule I
implemented **only the EuropePMC fix** here — it is the top *unblocked* open validation FAIL
(F3, High). It is a pure code change with no ops dependency, and the cursor mechanism was already
proven viable by validation 006 Probe C2.

### Done this run
- `lib/europepmc.ts` — `fetchPrimaryStudyIds()`:
  - Default `limit` raised from `200` → `2000` (the ceiling, now across all pages).
  - Added `sort=RELEVANCE` so topical matches surface ahead of the newest-first default that
    buried the truth papers.
  - Replaced the single-page fetch with a **cursorMark pagination loop**: starts at `cursorMark=*`,
    reads `nextCursorMark` from each response, advances until `results.length >= limit`, the page
    is empty, or the cursor cannot advance (`nextCursorMark` absent or unchanged → last page).
  - `pageSize` capped at EuropePMC's 1 000 max, and trimmed to the remaining ceiling on the final
    page (`Math.min(pageSize, limit - results.length)`), so a 2 000 ceiling costs exactly two pages.
  - The inline response type gained a `nextCursorMark?: string` field (the shared
    `EuropePMCResponse` interface was left untouched — no other caller paginates).

### Deferred (NOT done here) — remaining brief 005 items
- **OpenAlex `fetchPrimaryStudyIds` cursor pagination + limit 2000** (brief 005 row 3). Deferred:
  CRIT-1 (`OPENALEX_API_KEY` 401) makes OpenAlex a non-contributor to production union recall
  right now (validation 006 F2), so this is lower ROI than the live EuropePMC source. The code
  fix is unblocked and should follow in a later run so it works once the key is rotated.
- **Mitchell 2012 real fixture commit** into `REAL_RECALL_FIXTURES` (brief 005 AC-fixture) —
  requires running `scripts/capture-recall-fixture.ts` against the live network *after all three*
  source fixes land; capturing now (OpenAlex still broken) would bake in a partial `perSource`.
  Left for the run that completes the OpenAlex fix.
- **`recall-benchmark.test.ts` guard flip** (`toEqual([])` → `toBeGreaterThan(0)`) — coupled to
  the fixture commit above; must stay as-is until a real fixture exists, else the test breaks.

---

## Files touched
- `lib/europepmc.ts` — `fetchPrimaryStudyIds()` only. No other function changed. No changes to
  `search()`, count functions, or `searchExistingReviews()`.

No changes to `app/`, `components/`, `supabase/`, routes, or other `lib/` files. No design tokens
involved (server-side data fetch, no UI).

---

## Behavior

Before: `fetchPrimaryStudyIds(query)` fetched a single page of ≤200 records, newest-first.
Against the Mitchell 2012 query, production returned 185–200 records with 0/5 truth-paper recall
(validation 006 Probe C1).

After: it fetches up to 2 000 records under RELEVANCE sort, paginated via `cursorMark`. The 1 994
total records for the Mitchell 2012 query now fit within the ceiling in two pages, and relevance
ordering surfaces topical matches first. Validation 006's union table (line 202) estimated this
brings EuropePMC to 4/5 = 80% recall — pending tester confirmation.

**Caller impact:** the production search route (`app/api/search/route.ts:351`) passes
`limit=200` **explicitly** for dedup-fraction sampling (handoff 053) — that call is unaffected by
the default change and still fetches ~200 records (now RELEVANCE-sorted; a benign improvement for
sampling). The recall path that this fix targets is the capture script / validation harness, which
pass an explicit higher `--limit 2000`; those now paginate across pages via cursorMark. No caller
depends on receiving exactly 200 records, so raising the default is safe.

---

## Gate results
- `npx eslint lib/europepmc.ts` → **clean (exit 0)**. (Full `npm run lint` reports 444 pre-existing
  errors across unrelated files — tree was clean at run start, and my only edited file lints clean,
  so **0 new** lint problems introduced. Same baseline handoff 105 faced.)
- `npx tsc --noEmit --skipLibCheck` → **clean (exit 0)**.
- `npx vitest run` → **15 failed / 857 passed** — exactly the documented pre-existing 15 failures
  (handoff 083 §8); **0 new failures**.
- `npm run build` → **succeeds** (all routes compiled).

---

## Verification pointer (for the tester)
Re-run the recall harness (adapt `spec/validation/006-harness.mjs` Probe C, but call the *fixed*
`fetchPrimaryStudyIds` with default limit / RELEVANCE / cursor loop, or exercise the code path
directly) against the Mitchell 2012 query `cognitive behavioral therapy insomnia`. Confirm:
- EuropePMC `hits/truth` moves from 0/5 → ≥2/5 (brief 005 AC-europepmc; validation 006 est. 4/5).
- Pagination terminates (no infinite loop) — the loop breaks on empty page or non-advancing cursor.
- Union recall (PubMed_NEW + EuropePMC_2000) ≥60% (brief 005 AC-union).

Methodology recall claim stays **`claimed`** until this is verified.

---

## Now-stale wiki pages (for the librarian)
- **Roadmap & Status** — "Literature search" row and F3/005 F4 references: EuropePMC pagination fix
  is now shipped (code); recall figure remains `claimed` pending tester validation.
- **Data Sources** — EuropePMC `fetchPrimaryStudyIds` now uses RELEVANCE sort + cursorMark
  pagination up to a 2 000 ceiling, not a single 200-record date-sorted page.
- **Milestone — Search Recall & Provenance Benchmark** — note EuropePMC as the second source fix
  of brief 005 (after handoff 105 PubMed); OpenAlex + fixture commit still outstanding.
