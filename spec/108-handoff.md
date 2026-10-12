# Handoff 108 — EuropePMC cursorMark pagination in `fetchPrimaryStudyIds` (brief 008)

**Date:** 2026-10-12
**Brief:** `spec/briefs/008.md` — EuropePMC Cursor Pagination: Full-Result Retrieval
**Stage:** Stage 2 — Literature search (primary-literature capture)
**Addresses:** validation 006 F3 (High) — EPMC single-page truncation; the EPMC channel's
contribution to the Stage-3 union recall FAIL (006 verdict: union recall 80%, ceiling blocked
by EPMC pagination among others).

> ⚠️ **Note on numbering:** `Roadmap & Status` and `Data Sources` in the wiki already claim
> brief 008 / "handoff 108" shipped (EuropePMC pagination). That was **never true in the
> committed repo** — latest handoff on `main` was 107 and `fetchPrimaryStudyIds` still did a
> single-page fetch. This handoff is the real implementation. Those two wiki pages are stale
> and should be reconciled (see "Stale wiki pages" below).

---

## What changed

`lib/europepmc.ts` only — one interface field + one function body. No other files touched.

### 1. `EuropePMCResponse` interface
Added top-level `nextCursorMark?: string` (confirmed by validation 006 Probe C2 to live at the
JSON root, not nested in `resultList`).

### 2. `fetchPrimaryStudyIds(query, minYear?, limit?)`
Replaced the single-page fetch (`pageSize = Math.min(limit, 1000)`, one request) with a
`cursorMark` pagination loop:

- **Ceiling** `Math.min(limit, 2000)`; **pageSize** 200 → up to 10 requests/query.
- **Default `limit` bumped `200` → `2000`** so a bare call retrieves full depth (AC-depth
  calls the function with no `limit` arg). This matches PubMed's existing default (2000).
  Callers that pass an explicit limit are unaffected — see "Production path" below.
- `cursor` starts at `"*"`, set as `cursorMark` each page; advances to the page's
  `nextCursorMark`.
- **Break conditions** (per brief): collected ≥ ceiling; no `nextCursorMark`; cursor unchanged
  from the previous page; empty page.
- **No `sort` param** — `sort=RELEVANCE` is deprecated and returns zero results
  (validation 005 F5); default date sort + full pagination retrieves every record regardless
  of position.

### Two deliberate deviations from the brief's sample snippet (contract-preserving)
1. **Return type kept as `Array<{ pmid?: string; doi?: string }>`**, not `string[]`. The
   brief's snippet simplified to an ID list, but this function is the cross-database "linker"
   (bridges PubMed PMIDs ↔ OpenAlex/Scopus DOIs for dedup). Dropping DOIs would break the
   union dedup.
2. **`resultType=lite`, not `idlist`.** `idlist` omits the DOI; `lite` returns both PMID and
   DOI, which the return contract requires.

---

## Behavior

- `EuropePMC.fetchPrimaryStudyIds("...")` (no limit) now walks cursor pages to 2000 records
  instead of returning a single ~185–200-record date-sorted window. Older relevant RCTs that
  previously fell beyond page 1 are now retrieved and can contribute to the union.
- **Production path unchanged (no regression):** `app/api/search/route.ts:351` calls
  `EuropePMC.fetchPrimaryStudyIds(reviewQuery, minYear, 200)` with an explicit `limit=200`, so
  `ceiling = min(200, 2000) = 200` → it still collects a single 200-record page (one cursor
  iteration, then the ceiling break). This keeps the sampled-union latency/size identical to
  before. Lifting production depth is a route-level decision explicitly **out of scope** for
  brief 008 (route changes excluded) and belongs to a follow-on brief.

---

## Files touched
- `lib/europepmc.ts` — `EuropePMCResponse` interface (+1 field) and `fetchPrimaryStudyIds`
  (single-page fetch → cursor loop; default `limit` 200→2000).

## Gate results
- **Lint:** `npx eslint lib/europepmc.ts` → **exit 0, clean.** Full `npm run lint` exits
  nonzero, but every one of the 1082 errors is in the stale `.claude/worktrees/distracted-northcutt/`
  checkout (another branch's worktree, not shipping source); the only committed main-tree lint
  items are two **pre-existing warnings** (`components/HeroSourceLogos.tsx` `<img>`,
  `spec/validation/006-harness.mjs` unused var). No europepmc lint findings.
- **Test:** `npx vitest run` → **860 passed / 12 failed** = documented baseline (handoff 083
  §8: boolean-search-builder, cache-freshness, cache-topic-search, keyboard-shortcuts,
  protocol-storage, study-design, use-persistent-*). **Zero new failures; none in europepmc.**
- **Typecheck:** `npx tsc --noEmit --skipLibCheck` → no europepmc errors.
- **Build:** `npm run build` → **✓ Compiled successfully.**

## Acceptance criteria status (claimed — awaiting tester)
AC-depth, AC-cursor, AC-recall require live EuropePMC network runs and are **not** exercised by
the unit suite (no dedicated europepmc test spies on the real search fetch). They remain
`claimed` pending tester validation 008 against the Mitchell 2012 truth set. AC-union
(no regression) and AC-regression (no new TS/test failures) are met by the gates above.

| AC | Status |
|----|--------|
| AC-depth (≥1900 IDs for CBT-insomnia) | `claimed` — needs live probe |
| AC-cursor (cursor advances, no infinite loop) | `claimed` — logic implements the four break conditions; needs live probe |
| AC-recall (EPMC ≥2/5 truth papers) | `claimed` — needs live probe |
| AC-union (production union ≥4/5, no regression) | met — production path still fetches one 200-record page (limit=200 unchanged) |
| AC-regression (no new TS/test failures) | met — see gates |

## Deferred / follow-on
- **Production depth:** route passes `limit=200`, so production EPMC still fetches one page.
  Raising it (and the latency/dedup implications across all four sources) is a route-level
  follow-on, out of scope for brief 008.
- Synonym expansion / McCluskey 1991 (validation 006 F5) — separate brief.
- Recall fixture re-capture (`scripts/capture-recall-fixture.ts`) — tester post-validation.

## Stale wiki pages (for the librarian)
- **`Roadmap & Status`** — states "EuropePMC pagination shipped (handoff 108, brief 008)" and
  "cursorMark loop to 2000 records + RELEVANCE sort". Both were untrue until now, and the
  **RELEVANCE sort detail is wrong** — this implementation uses **no sort param** (RELEVANCE is
  deprecated, 005 F5). Reconcile to: pagination shipped here (handoff 108), date sort, EPMC
  recall still `claimed` pending validation 008.
- **`Data Sources`** — if it references handoff 108 / EPMC pagination, same reconciliation.
- Methodology claims stay `claimed` until tester verifies (validation 008).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
