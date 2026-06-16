# Handoff 085 — Retraction / Withdrawal Flagging (Milestone Stage 1, part 2)

**Date**: 2026-06-15
**Session type**: Milestone work — dev acting on a librarian-owned brief
**Previous handoff**: spec/084-handoff.md (2026-06-15)
**Brief**: `[[Milestone — Search Recall & Provenance Benchmark]]`
**Owner stage**: Search (Stage 1) in `[[Roadmap & Status]]`

---

## 1. Summary

Delivers **acceptance criterion #4** of the milestone: retraction/withdrawal awareness. A new
source module flags retracted, withdrawn, removed, and expression-of-concern records via the
Crossref REST API, with the same graceful-degradation contract as Blindspot's other sources —
a retraction-source outage can never block search.

This is a pure, fully-tested library unit. It is **not yet wired into the live search path** —
that integration (latency + result-payload + UI) is a focused follow-up, specified in §6.

**Status**: ✅ TypeScript clean; ✅ new files lint-clean; ✅ 15 new tests pass; ✅ full suite
829 pass (was 814) with the **same 15 pre-existing unrelated failures** — no regression. Not
committed (DEV role: commit only on request).

---

## 2. What changed and why

### `lib/retractions.ts` (new)

Flags discredited studies so a reviewer never unknowingly builds on them — Otto-SR table
stakes (`[[Otto-SR (Reference Target)]]`).

**Data source:** Crossref REST API (`https://api.crossref.org/works/{doi}`) — free, keyless;
an optional `mailto` (env `CROSSREF_MAILTO`, falling back to `OPENALEX_EMAIL`) opts into the
faster polite pool. For each DOI we read the work's own record and detect three signals
Crossref surfaces on the original article:
1. `relation["is-retracted-by"]` — Crossref's explicit retraction link (also captures the
   notice DOI).
2. A title prefixed `RETRACTED:` / `WITHDRAWN:` / `REMOVED:` — the convention publishers and
   PubMed use. Anchored to the start of the title so mid-sentence mentions don't false-positive.
3. `update-to` entries with a discrediting type (retraction, partial_retraction, withdrawal,
   removal, expression_of_concern). Non-discrediting types like `correction` are ignored.

**Exports:**
- `parseCrossrefRetraction(message)` → `RetractionFlag | null` (pure, synchronous).
- `checkRetractions(ids, { limit = 200, concurrency = 5 })` → `Promise<RetractionFlag[]>`.
  Only DOI-bearing records are checked (Crossref is DOI-keyed); DOIs are normalized + deduped
  via `lib/study-id.ts`; bounded concurrency; **always resolves, never rejects**.
- `retractionMap(flags)` → `Map<doi, RetractionFlag>` for joining flags back onto results.
- Types: `RetractionType`, `RetractionFlag`, `CrossrefMessage`.

**Guardrails (RAISE / brief):** flags are advisory and for display only — nothing is
auto-deleted. Every network path degrades to "not flagged" on error/4xx/5xx.

### `lib/retractions.test.ts` (new, 15 tests)

`parseCrossrefRetraction` against representative Crossref shapes (relation, title prefixes,
expression-of-concern, correction-ignored, clean, no-DOI, mid-title non-match);
`checkRetractions` with a stubbed `globalThis.fetch` covering: flags only the retracted DOI,
graceful degradation when one DOI throws, 404 → not flagged, PMID-only skipped (no fetch),
DOI dedup/normalization, and the `limit` option.

---

## 3. Files touched

| File | Type | Note |
|---|---|---|
| `lib/retractions.ts` | new | Crossref-backed retraction source, graceful degradation |
| `lib/retractions.test.ts` | new | 15 tests (parser + batched check, network stubbed) |

No routes, DB schema, or UI changed this turn. One **optional** new env var:
`CROSSREF_MAILTO` (falls back to `OPENALEX_EMAIL`; anonymous pool if neither is set).

---

## 4. Acceptance-criteria status (running, from the brief)

| # | Criterion | Status |
|---|---|---|
| 1 | Reproducible recall harness | ✅ Done (handoff 084) |
| 2 / 2b | Measured ≥95% union recall + coverage gap | ⏳ Pending real fixtures (handoff 084 §6) |
| 3 | Per-record provenance, exportable | ⬜ Not started (next) |
| 4 | Retraction/withdrawal flagging | ✅ **Source built + tested (this handoff)**; ⏳ live-search wiring pending (§6) |
| 5 | No recall regression | ✅ Still holds |

---

## 5. New user-facing behavior

None yet — `lib/retractions.ts` is not called from any route. Behavior ships when wired in (§6).

---

## 6. Recommended next step — wire retraction flags into search

The module is intentionally decoupled so the latency/UX tradeoff is a deliberate choice. Suggested integration:

1. In `app/api/search/route.ts`, after the existing reviews are deduped/relevance-filtered and
   **capped to the displayed set** (not the 200-ID dedup samples — keep the Crossref call count
   small/bounded), call `checkRetractions(displayed.map(r => ({ pmid, doi })))` inside the
   existing `Promise.allSettled` group so a failure is isolated.
2. Add an optional `retraction?: RetractionFlag` (or `retractionType?`) to `ExistingReview` in
   `types/index.ts` and attach via `retractionMap`.
3. Surface a small advisory badge in the Existing Reviews tab (and the screening rows, which
   reuse `ExistingReview`); include the flag + notice DOI in the export path so provenance and
   retraction status travel together (dovetails with criterion #3).
4. Consider caching Crossref results (reuse `lib/cache.ts`) since retraction status is stable.

Latency note: bound the number of DOIs checked (the `limit` option) and run concurrently; only
the displayed records need flagging, so ~25 lookups, not hundreds.

Coverage note: Crossref retraction coverage is partial. The Retraction Watch dataset (now
distributed via Crossref) is more complete; a future enhancement could ingest it as a local
lookup. PMID-only records (no DOI) aren't checked yet — an NCBI "Retracted Publication"
publication-type check could close that gap.

---

## 7. Concepts a reader would need a wiki page for

- **Retraction flagging** — Crossref signals used, advisory-not-deleted guardrail, graceful
  degradation, current coverage limits (Crossref partial; RW dataset + PMID-only as follow-ups).

---

## 8. Wiki pages to update (for the librarian)

- **`[[Milestone — Search Recall & Provenance Benchmark]]`** — criterion #4 source now built &
  tested (wiring pending). #1 done; #2/#2b pending fixtures; #3 not started.
- **`[[Roadmap & Status]]`** — Stage 1 "add retractions" is now partially delivered (library
  landed, integration pending).
- **`[[Data Sources]]`** — add **Crossref** as a (retraction-checking) data source once wired;
  note it's keyless with an optional `CROSSREF_MAILTO`. Not yet a live source — flag as
  `(library ready, integration pending)` if recorded now.
- **`[[Glossary]]`** — candidate entries: *Retraction*, *Expression of concern*, *Crossref*.

No wiki/code discrepancies found this turn. (The `lib/per-source-count.ts` discrepancy from
handoff 084 §8 still stands for the librarian to reconcile in the brief.)

---

## 9. Test / lint / build status

```
TypeScript (tsc --noEmit):   0 errors
ESLint (new files):          0 problems
New tests:                   15 pass (lib/retractions.test.ts)
Full suite:                  829 pass / 15 fail
                             → +15 vs handoff 084's 814; the 15 failures are the SAME
                               pre-existing unrelated ones — no regression from this work.
```

(Production build not re-run this turn — no route/page/config changes; the prior handoff's
build is unaffected. `tsc` + lint + tests cover these library-only additions.)

**Session completed**: 2026-06-15
