# Handoff 106 — Fix PubMed Systematic-Review Exclusion Filter (root-cause for validation 005 F1)

**Dev instance** · **Date:** 2026-06-24 · **Stage:** Stage 2 — Literature search (primary-literature capture)
**Brief:** `spec/briefs/006.md` — "Fix PubMed Systematic-Review Exclusion Filter"
**Addresses:** Validation 005 F1 (CRITICAL) — `fetchPrimaryStudyIds` returned **systematic-review
IDs, not primary-study IDs**, producing measured 0% production recall on the Mitchell 2012 truth
set. Root cause: PubMed Automatic Term Mapping (ATM) silently inverts `AND NOT systematic[sb]` →
`AND "systematic"[Filter]`, dropping the `NOT`. Roadmap 🔴 FAIL on Literature search.

---

## Scope of this run

Brief 006 is a single, self-contained root-cause fix: replace all four `AND NOT systematic[sb]`
occurrences in `lib/pubmed.ts` with an ATM-proof Publication-Type exclusion. Implemented in full
(it is already the smallest shippable unit — no multi-item brief to split). The `[pt]` field tag
is a controlled-vocabulary lookup that ATM does not expand, so the `NOT` survives.

Replacement filter (all 4 sites):
```
NOT (systematic review[pt] OR meta-analysis[pt])
```

## Changes

| File | Site (line) | Function | Before → After |
|------|-------------|----------|----------------|
| `lib/pubmed.ts` | 124 | `countPrimaryStudies` | `(${query}) AND NOT systematic[sb]${datePart}` → `(${query}) NOT (systematic review[pt] OR meta-analysis[pt])${datePart}` |
| `lib/pubmed.ts` | 234 | `fetchPrimaryStudiesForScreening` | `(${query}) AND NOT systematic[sb]` → `(${query}) NOT (systematic review[pt] OR meta-analysis[pt])` |
| `lib/pubmed.ts` | 268 | `fetchPrimaryStudyIds` | `(${query}) AND NOT systematic[sb]${datePart}` → `(${query}) NOT (systematic review[pt] OR meta-analysis[pt])${datePart}` |
| `lib/pubmed.ts` | 285 | `countPrimaryStudiesRecent` | `(${query}) AND NOT systematic[sb]` → `(${query}) NOT (systematic review[pt] OR meta-analysis[pt])` |

No structural changes: same function signatures, callers, sort/retmax logic. The handoff-105
relevance-sort + ceiling at line 268 is preserved; only the filter string changed.

### Intentionally NOT touched (positive SR filters — per brief 006 "Out" scope)
- `searchExistingReviews` (line 98) — `AND systematic[sb]` to *find* SRs (correct).
- `countSystematicReviews` (line 138) — positive SR count (correct).
- `countLivingReviews` (line 164) — positive SR + living filter (correct).
- `lib/europepmc.ts`, `lib/openalex.ts`, and all `app/`/`components/`/`supabase/` files — untouched.

## Behavior

PubMed primary-study queries now actually exclude systematic reviews and meta-analyses instead
of returning only them. `fetchPrimaryStudyIds` should contribute real primary studies to the
recall union; the dashboard primary-study counts (`countPrimaryStudies`,
`countPrimaryStudiesRecent`) and the screening fetch (`fetchPrimaryStudiesForScreening`) now
operate on primary records rather than SRs.

## Gate results

- `npm run lint`: `lib/pubmed.ts` is **clean** (`npx eslint lib/pubmed.ts` → no output). The
  repo-wide `npm run lint` reports 444 pre-existing errors in unrelated files (unchanged baseline);
  this change adds none.
- `npx tsc --noEmit --skipLibCheck`: **EXIT 0** (clean). [AC-regression ✅]
- `npx vitest run`: **15 failed / 857 passed** — exactly the documented pre-existing baseline
  (handoff 083 §8; roadmap "15/857"). Zero new failures. [AC-regression ✅]
- `npm run build`: **✓ Compiled successfully**, EXIT 0.

## Acceptance criteria status

- **AC-filter / AC-pubmed / AC-union / AC-no-sr** — require live PubMed ESearch network calls
  against the Mitchell 2012 truth set; these are **for the tester to measure** in validation 006
  (the dev gates are offline). The code change is the necessary precondition and is in place.
- **AC-regression** — ✅ met (tsc clean, no new test failures).

These recall claims remain `claimed` until validation 006 verifies them against external ground truth.

## For the tester (validation 006)

Re-run the validation 005 harness (`spec/validation/005-harness.mjs`) against the fixed code.
Expected: PubMed returns ≥4/5 truth PMIDs (16804151, 15451764, 10086433, 16785771; McCluskey 1991
/ 1888345 may miss — it lacks CBT terminology). Confirm PMID 22631616 (the Mitchell 2012 SR itself)
does NOT appear. Spot-check ATM by issuing the AC-filter ESearch queries directly (NOT-SR vs
positive-SR sets should be non-overlapping). The Mitchell 2012 `perSource` fixture should be
re-captured post-validation (`scripts/capture-recall-fixture.ts`) — brief 006 "Out" scope.

## Deferred / follow-on (per brief 006 "Out")

- EuropePMC pagination / sort fix (F4/F5) — next brief.
- OpenAlex CRIT-1 keyless `mailto` path — ops/follow-on.
- Synonym expansion (RC2 / F7) — brief 007.
- Recall fixture re-capture after this ships.

## Now-stale wiki pages (for the librarian)

- **[[Roadmap & Status]]** — Literature search row still attributes 0% to query inversion as an
  open root cause; the fix is now shipped (pending tester verification). Update the FAIL note to
  reference handoff 106 and "fix shipped, awaiting validation 006".
- **[[Data Sources]]** — any description of the PubMed primary-study filter as `AND NOT
  systematic[sb]` is now stale; it is `NOT (systematic review[pt] OR meta-analysis[pt])`.
- **[[Milestone — Search Recall & Provenance Benchmark]]** — references the inverted-filter
  blocker as unresolved; note the root-cause fix in handoff 106.
