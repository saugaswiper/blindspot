# Handoff 108 — Search Recall Fix (Stage 2): EuropePMC RELEVANCE sort + cursor pagination

**Dev instance** · **Date:** 2026-08-14 · **Stage:** Stage 2 — Literature search (primary-literature capture)
**Brief:** `spec/briefs/005.md` — "Search Recall: Relevance Sort + Comprehensive Pagination" (the `lib/europepmc.ts` row of the "Exact files to touch" table)
**Addresses:** Validation 006 **F3** (High — Carried from 005 F4): EuropePMC date-sorted single-page truncation returns 0/5 on the Mitchell 2012 truth set because the truth papers sit past position 200 in a 1 994-record set. This is the top **code-fixable** remaining recall blocker; the other two open items (CRIT-1 OpenAlex `api_key` 401, and McCluskey 1991 RC2 synonym gap) are ops/terminology, not this run.

---

## Scope of this run (one scoped stage)

Brief 005 lists five edits (PubMed, EuropePMC, OpenAlex, fixture commit, benchmark-test guard).
Handoff 105 shipped the **PubMed** edit; handoffs 106–107 fixed the PubMed `NOT` inversion
(briefs 006/007). Per the one-scoped-stage / smallest-shippable rule I implemented **only the
EuropePMC edit** this run — the single highest-ROI *code* item still open per validation 006's
"Recommended next steps" §2.

**Deferred to follow-up runs (NOT done here):**
- **OpenAlex** `fetchPrimaryStudyIds` cursor pagination (brief 005). CRIT-1 (`OPENALEX_API_KEY`
  401) makes OpenAlex a non-contributor to production union recall right now (validation 006 F2),
  so it is the lower-ROI of the two remaining source fixes; it should follow once a key is rotated.
- **Mitchell 2012 fixture commit** into `REAL_RECALL_FIXTURES` (brief 005 AC-fixture) — requires
  running `scripts/capture-recall-fixture.ts` against the **live network** after the source fixes
  land. A capture cannot be produced or verified inside this run (no committed network access), and
  capturing before the OpenAlex fix would bake in a partial `perSource`. Left for the run that
  completes the source fixes.
- **`lib/recall-benchmark.test.ts`** `toEqual([])` → `toBeGreaterThan(0)` guard flip (brief 005
  AC-benchmark) — deliberately left intact so the suite stays green while `REAL_RECALL_FIXTURES`
  is still empty. Flipping it without a committed fixture would break the suite.

---

## Changes

**File touched:** `lib/europepmc.ts` (only).

1. `fetchPrimaryStudyIds()` — default `limit` raised **200 → 2000**; retrieval is now
   **RELEVANCE-sorted** (`sort=RELEVANCE`) and walks Europe PMC's **`cursorMark`** pagination
   (page size capped at the Europe PMC per-page max of 1 000) until it reaches the `limit`
   ceiling or the result set is exhausted. The first request uses the reserved cursor `"*"`;
   each response's `nextCursorMark` seeds the next page. The loop stops on a short/empty page or
   a non-advancing cursor (Europe PMC repeats the cursor once results run out), then slices to
   `limit`. Replaces the old single date-sorted page of ≤200 that buried the truth papers.
2. `EuropePMCResponse` interface — added `nextCursorMark?: string` (the cursor token the search
   endpoint returns).

**Not touched (kept in `search()` / count paths):** `search()`, `searchExistingReviews`,
`countPrimaryStudies`, `countSystematicReviews` are unchanged — the RELEVANCE-sort + cursor
behaviour is isolated to `fetchPrimaryStudyIds`, matching the brief's "no change to `search()`".

## Behavior

- **Production route unchanged, but improved by relevance sort.** `app/api/search/route.ts:351`
  still calls `EuropePMC.fetchPrimaryStudyIds(reviewQuery, minYear, 200)` explicitly (the brief
  forbids route changes). With `limit=200` the new loop makes exactly **one** fetch (page size
  200, single page) — so no added latency in production — but it is now `sort=RELEVANCE`, which
  surfaces topically-relevant records first so the buried truth papers can enter the top 200.
  This mirrors why the PubMed fix (handoff 105) improved production while the route kept passing
  200: the win is the sort, not the ceiling.
- **Harness / fixture path (limit=2000).** A direct call with the default `limit=2000` now walks
  up to two cursor pages (1 000 + 1 000), satisfying brief 005 AC-europepmc ("returns ≥1 000
  records") and enabling the deferred fixture capture.
- Return shape unchanged: `Array<{ pmid?, doi? }>`, DOIs lowercased.

## Which brief / validation this addresses

- Brief 005, `lib/europepmc.ts` row — **implemented** (RELEVANCE sort + cursor pagination + limit 2000).
- Validation 006 **F3** / "Recommended next steps" §2 (EPMC cursor loop to 2 000 records) — **implemented**.
- AC-europepmc (function returns ≥1 000 records on the paginated path) — **claimed**; awaits tester
  re-run of the recall harness against live EPMC (this run cannot hit the network). AC-union (≥60%)
  and the fixture/benchmark ACs remain for the follow-up runs above.

## Gate results

- `npm run lint` — **green for this change.** `npx eslint lib/europepmc.ts` → 0 problems.
  The repo-wide `npm run lint` reports a large **pre-existing** baseline (444 errors, in untouched
  files — `spec/validation/*.mjs` harnesses, `HeroSourceLogos.tsx`, etc.); this run introduces none.
- `npx tsc --noEmit --skipLibCheck` — **clean** (exit 0, no output).
- `npx vitest run` — **860 passed / 12 failed (872 total).** The 12 failures are **pre-existing**
  and unrelated to this change (e.g. `lib/study-design.test.ts` confidence-threshold assertions);
  none touch `europepmc`/recall. No unit test exercises `fetchPrimaryStudyIds` (it is a live-network
  function), so this change adds zero failures. (Down from the 15-failure baseline noted in the
  roadmap as the suite has since grown.)
- `npm run build` — **succeeds** (exit 0; full route tree emitted).

## Possibly-stale wiki pages (for the librarian)

- **Roadmap & Status** — "Literature search" row / provenance note: EuropePMC is no longer an
  untouched 0/5 date-sorted source in code; F3's *code* fix has shipped (still `claimed` until the
  tester verifies against live EPMC). The ≥95% ceiling now blocks only on CRIT-1 (OpenAlex key) and
  RC2 (McCluskey synonym), plus the deferred OpenAlex pagination + fixture commit.
- **Data Sources** — if it documents EuropePMC retrieval as single-page/200/date-sorted, update to
  RELEVANCE-sorted cursor pagination up to 2 000.
- **Milestone — Search Recall & Provenance Benchmark** — note the EuropePMC source fix landed;
  fixture commit + benchmark-guard flip still outstanding (brief 005 AC-fixture / AC-benchmark).
