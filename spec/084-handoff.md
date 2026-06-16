# Handoff 084 — Search Recall Benchmark Harness (Milestone Stage 1, part 1)

**Date**: 2026-06-15
**Session type**: Milestone work — dev acting on a librarian-owned brief
**Previous handoff**: spec/083-handoff.md (2026-06-15)
**Brief**: `[[Milestone — Search Recall & Provenance Benchmark]]` (vault: `Briefs/`)
**Owner stage**: Search (Stage 1) in `[[Roadmap & Status]]`

---

## 1. Summary

First implementation pass on the **Search Recall & Provenance Benchmark** milestone. This
turn delivers **acceptance criterion #1** — a committed, reproducible, offline recall
benchmark harness — plus the shared identifier primitive it required. It does **not** yet
deliver the measured ≥95% recall result (#2/#2b), per-record provenance (#3), or retraction
flagging (#4); those are scoped as follow-on handoffs (see §7).

Why criterion #1 first: every downstream stage inherits the recall of search, so the brief
makes the reproducible harness the logical foundation. The harness is pure and deterministic
(computes recall from committed fixtures, never a live API), so it runs in CI and is
unaffected by the open CRIT-1 OpenAlex-key blocker.

**Status**: ✅ TypeScript clean; ✅ new files + refactored route lint-clean; ✅ production
build succeeds; ✅ 25 new tests pass; ✅ full suite 814 pass (was 789) with the **same 15
pre-existing unrelated failures** — the route refactor caused **no regression**.

**Not committed** (per DEV role rules — commit only on request).

---

## 2. What changed and why

### A. Shared study-identifier primitive (refactor) — `lib/study-id.ts` (new)

The cross-source dedup logic (`normalizeDoi`, the PMID→DOI dedup loop) lived privately inside
`app/api/search/route.ts`. The benchmark needs the **exact same** "same study?" semantics to
measure recall, and re-deriving them would risk production and the benchmark silently
diverging. Extracted into one module, now imported by both.

Exports: `StudyId`, `normalizeDoi`, `normalizePmid`, `dedupeStudyIds(sources)` →
`{ unique, totalCount, uniqueCount, dedupFraction }`, and `StudyIdIndex` (PMID/DOI membership
test for recall matching). Matching rules are unchanged from the original route code:
PMID = trimmed equality; DOI = lowercased + trimmed + `doi.org` URL-prefix stripped; two
records match on shared PMID **or** normalized DOI; merge precedence PMID-then-DOI.

### B. Search route now reuses the primitive — `app/api/search/route.ts` (modified)

- Removed the private `normalizeDoi`; imports it from `lib/study-id`.
- `computeDedupFraction` now delegates counting to `dedupeStudyIds(...)` and keeps its
  route-specific clamping (`0.30–0.95`, `0.75` empty-sample fallback) on top. Behaviour is
  identical — verified by the unchanged full-suite pass set.

### C. Recall benchmark engine — `lib/recall-benchmark.ts` (new)

Implements the Bramer et al. 2017 method (P6 in `[[Literature Notes]]`): a published SR's
PRISMA-reported includes are the gold-standard truth set; measure what each source recovers.

Exports:
- `recall(label, truthSet, found)` → `{ found, total, recall, missed[] }` (matches via `StudyIdIndex`).
- `runRecallBenchmark(fixture)` → per-source recall, **deduplicated union** recall, best single
  source, union margin, and boolean flags `meetsTarget` (≥95%), `meetsAspiration` (≥98%),
  `beatsBestSource` (union ≥ best + 5pts).
- `aggregateRecall(results)` → micro-averaged union recall across fixtures.
- `formatBenchmarkReport(result)` → plain-text table for handoffs/CI; explicitly tags
  synthetic results so they can never be mistaken for measured recall.
- Constants: `RECALL_TARGET = 0.95`, `RECALL_ASPIRATION = 0.98`, `UNION_MARGIN_TARGET = 0.05`.

### D. Fixtures — `lib/fixtures/recall-fixtures.ts` (new)

- `SYNTHETIC_RECALL_FIXTURE` — clearly flagged `synthetic: true`; 5-study truth set engineered
  to exercise PMID-only matching, DOI URL/case matching, union-recovers-what-no-source-has,
  and one irreducible miss. Used only to validate the engine math.
- `REAL_RECALL_FIXTURES` — **intentionally empty**. A test asserts it stays empty so nobody
  pastes invented PMIDs as a real truth set. Real recall numbers require captured data (§6).

### E. Tests (new, 25 total)

- `lib/study-id.test.ts` (11) — normalization, dedup, fraction math, membership matching.
- `lib/recall-benchmark.test.ts` (14) — recall math, the synthetic fixture's expected
  per-source/union/margin numbers, aggregation, report labelling, and the empty-real-fixtures
  integrity guard.

---

## 3. Files touched

| File | Type | Note |
|---|---|---|
| `lib/study-id.ts` | new | Shared identifier/dedup primitive |
| `lib/recall-benchmark.ts` | new | Recall harness (pure, deterministic) |
| `lib/fixtures/recall-fixtures.ts` | new | Synthetic fixture + empty real-fixture registry |
| `lib/study-id.test.ts` | new | 11 tests |
| `lib/recall-benchmark.test.ts` | new | 14 tests |
| `app/api/search/route.ts` | modified | Reuses `lib/study-id` (behavior-preserving) |

No new routes, env vars, or DB schema this turn.

---

## 4. Acceptance-criteria status (from the brief)

| # | Criterion | Status |
|---|---|---|
| 1 | Reproducible recall harness committed (Bramer method, per-source + union) | ✅ **Done** — `lib/recall-benchmark.ts` + fixtures + tests |
| 2 | Union recall ≥95% (aim 98%), beats best single source by ≥5pts | ⏳ **Pending real fixtures** — engine computes & flags it; no measured number yet |
| 2b | Coverage-gap analysis vs Bramer's best DB set | ⏳ Pending real fixtures |
| 3 | Per-record provenance (which source, matched query, dedup decision), exportable | ⬜ Not started (next handoff) |
| 4 | Retraction/withdrawal flagging (`lib/retractions.ts`) | ⬜ Not started (next handoff) |
| 5 | No recall regression in normal use | ✅ Verified — full suite, route refactor behavior-preserving |

**Honest note:** I did not produce a measured recall figure. Doing so requires real recorded
source responses for real published SRs (network + the OpenAlex key from CRIT-1), which can't
be captured deterministically in this environment. Reporting a fabricated number would violate
the "never invent behavior" rule and defeat the milestone's purpose. The machinery to produce
the number the moment fixtures exist is in place and tested.

---

## 5. New user-facing behavior

None this turn. All additions are internal libraries/tests; the search route's externally
observable behavior is unchanged (refactor only).

---

## 6. How to capture real fixtures (recipe for the next session)

The engine takes `perSource` records directly, so capture is mechanical:

1. Pick ≥3 published SRs that openly list included studies; record each include's PMID/DOI as
   the fixture `truthSet`.
2. For each SR, run its query through each source's existing `fetchPrimaryStudyIds(query, minYear, limit)`
   (`lib/pubmed.ts`, `lib/openalex.ts`, `lib/europepmc.ts`, `lib/scopus.ts`,
   `lib/semanticscholar.ts`) and store the returned `{pmid,doi}[]` under `perSource[sourceName]`.
   Use a high `limit` so recall isn't truncated by the sample cap.
3. Add the assembled `RecallFixture` (with `synthetic` unset/false and a citation in
   `description`) to `REAL_RECALL_FIXTURES`, and relax the integrity test that currently
   asserts it's empty into one that asserts every entry is non-synthetic with a description.
4. Run `runRecallBenchmark` per fixture + `aggregateRecall`; paste `formatBenchmarkReport`
   output into that handoff. This yields criterion #2/#2b numbers.

(Requires the OpenAlex key — CRIT-1 — for OpenAlex's contribution to be real.)

---

## 7. Concepts a reader would need a wiki page for

- **Study identifier / dedup primitive** (`lib/study-id.ts`) — the one definition of "same
  study" shared by search and the benchmark.
- **Recall benchmark** — Bramer method, truth set, per-source vs union recall, the targets
  (95/98/+5pts), synthetic-vs-real fixture integrity rule.

---

## 8. Wiki pages now stale or to update (for the librarian)

- **`[[Milestone — Search Recall & Provenance Benchmark]]`** — mark criterion #1 in progress/
  done (harness landed); #2–#4 still open. Status was "Proposed".
- **`[[Roadmap & Status]]`** — Stage 1 "next: Milestone (prove recall + add retractions)" can
  note the harness now exists; recall figure still pending; retractions still not started.
- **`[[Data Sources]]`** — when provenance/retractions land it'll need updating; not yet.

### ⚠ Wiki/code discrepancy found (code wins — librarian please reconcile)

The brief's "Suggested approach" says to "reuse `lib/per-source-count.ts`". **That file does
not exist** in the code. The per-source counting/dedup actually lives in
`app/api/search/route.ts` (`dedupeReviews`, `computeDedupFraction`) and the agreement stats in
`lib/source-agreement.ts`. I built the shared primitive as `lib/study-id.ts` and reused the
real dedup path. The brief should drop the `lib/per-source-count.ts` reference.

---

## 9. Test / lint / build status

```
TypeScript (tsc --noEmit):     0 errors
ESLint (new files + route):    0 problems
Production build:              ✓ Compiled successfully
New tests:                     25 pass (study-id 11, recall-benchmark 14)
Full suite:                    814 pass / 15 fail
                               → +25 vs handoff 083's 789; the 15 failures are the SAME
                                 pre-existing unrelated ones (cache-freshness, boolean-search-
                                 builder, cache-topic-search, study-design, protocol-storage,
                                 keyboard-shortcuts) — no regression from this work.
```

**Session completed**: 2026-06-15
