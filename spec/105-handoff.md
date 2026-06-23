# Handoff 105 — Search Recall Fix (Stage 1): PubMed relevance sort + 2000-record ceiling

**Dev instance** · **Date:** 2026-06-23 · **Stage:** Stage 2 — Literature search (primary-literature capture)
**Brief:** `spec/briefs/005.md` — "Search Recall: Relevance Sort + Comprehensive Pagination"
**Addresses:** Validation 004 FAIL (measured 0/5 = 0% union recall on Mitchell 2012), root cause RC1
(date-sorted truncation at the 200-record cap). Roadmap 🔴 FAIL on Literature search.

---

## Scope of this run

Brief 005 lists five edits (PubMed, EuropePMC, OpenAlex, fixture commit, benchmark-test guard).
Per the one-scoped-stage / smallest-shippable rule I implemented **only the first item — the
PubMed fix**. It is self-contained (no pagination loop needed — PubMed ESearch retmax supports
up to 10 000 in a single call), the lowest-risk change, and per the brief's own RC analysis it
alone can reach the AC-union ≥60% ceiling: the 3 truth papers that use CBT terminology
(Sivertsen 2006 / 16804151, Jacobs 2004 / 15451764, Wu 2006 / 16785771) become reachable once
the date-sorted 200-cap is replaced by relevance sort over a 2000-record window.

**Deferred to follow-up runs (NOT done here):**
- EuropePMC `fetchPrimaryStudyIds` cursor pagination + `RELEVANCE` sort + limit 2000 (brief 005, riskier two-pass loop).
- OpenAlex `fetchPrimaryStudyIds` cursor pagination + limit 2000 (brief 005).
- Mitchell 2012 real fixture commit into `REAL_RECALL_FIXTURES` (brief 005 AC-fixture) — requires
  running `scripts/capture-recall-fixture.ts` against the live network *after* all three source
  fixes land; a single-source capture would be premature. Left for the run that completes the
  source fixes.
- `lib/recall-benchmark.test.ts` `toEqual([])` guard flip (brief 005 AC-benchmark) — deliberately
  left intact so the test stays green while `REAL_RECALL_FIXTURES` is still empty. Flipping it now
  without a committed fixture would break the suite.
- RC2 / synonym expansion (brief 006), CRIT-1 OpenAlex 401 (ops).

---

## Changes

**File touched:** `lib/pubmed.ts` (only).

1. `esearch()` — added an optional third param `sort?: string`. When provided it sets
   `url.searchParams.set("sort", sort)` before the fetch. When omitted (the default), behaviour is
   unchanged: PubMed's implicit date-sorted order is preserved for the other callers
   (`searchExistingReviews` with retmax 50, `countPrimaryStudies` count path). No other caller passes `sort`.
2. `fetchPrimaryStudyIds()` — default `limit` raised `200 → 2000`; now passes `"relevance"`
   (PubMed "Best Match" ML ranking) as the new `sort` arg. The query string and the
   `AND NOT systematic[sb]` / optional `[dp]` date filter are unchanged.

No changes to `app/`, `components/`, routes, other `lib/*` files, or any test/fixture file.

## Behavior

Before: `fetchPrimaryStudyIds("cognitive behavioral therapy insomnia")` issued an ESearch with
retmax=200 and implicit date sort → returned only the newest ~200 PMIDs (≈2021–2026), excluding
the 1991–2006 Mitchell truth papers (positions 201–313) → 0/5 PubMed recall.

After: same call issues ESearch with retmax=2000 and `sort=relevance` → retrieves the full result
set (PubMed reports 313 for this query) ranked by Best Match. The 3 CBT-terminology truth papers
become reachable. Expected PubMed hits/truth: 0/5 → ≥3/5 (to be confirmed by the tester re-running
the validation 004 harness against the fixed code).

## Brief acceptance criteria status

- **AC-pubmed** (PubMed fetches ≥313, hits 0/5 → ≥3/5): addressed by this change — pending tester
  live-network confirmation (validation 005).
- **AC-europepmc, AC-union, AC-fixture, AC-benchmark:** NOT addressed this run — depend on the
  deferred EuropePMC/OpenAlex/fixture work above.
- **AC-regression:** met — see gates.

## Gate results

- `npx eslint lib/pubmed.ts` → exit 0 (clean). Repo-wide `npm run lint` reports 444 pre-existing
  errors in unrelated files (test mocks, `@ts-ignore` usages); none in the touched file, none new.
- `npx tsc --noEmit --skipLibCheck` → exit 0 (clean).
- `npm test` (`vitest run`) → **15 failed / 857 passed (872 total)** — exactly the documented
  pre-existing baseline (handoff 083 §8). Zero new failures.
- `npm run build` → exit 0, "✓ Compiled successfully", 25/25 static pages generated.

## Now-stale wiki pages (for the librarian)

- **Roadmap & Status** — "Literature search 🔴 FAIL … Fix required before re-test": partial fix
  shipped for PubMed (RC1) only; still FAIL until EuropePMC/OpenAlex land and the tester re-measures.
- **Data Sources** — PubMed `fetchPrimaryStudyIds` now uses relevance sort + 2000-record ceiling
  (was 200, date-sorted). EuropePMC/OpenAlex still on the old 200-record date path.
- **Milestone — Search Recall & Provenance Benchmark** — references the 0% / date-truncation root
  cause; PubMed half now mitigated.

## For the tester

Re-run the validation 004 harness (`spec/validation/004-harness.mjs`) against the fixed PubMed path
to measure PubMed hits/truth (expect ≥3/5) and the partial union. Note EuropePMC and OpenAlex are
NOT yet fixed, so full AC-union ≥60% may not be reached until those source fixes ship.
