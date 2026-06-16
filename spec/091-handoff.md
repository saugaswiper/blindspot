# Handoff 091 — Validation 001 fixes: normalizeDoi unification (F3) + capture script (F2)

**Date**: 2026-06-16
**Previous handoff**: spec/090-handoff.md
**Addresses**: `spec/validation/001-validation.md` findings **F3** (fixed) and **F2** (capture script built)
**Brief**: `[[Milestone — Search Recall & Provenance Benchmark]]`

---

## 1. Summary
Two tester findings resolved:
- **F3 (Medium)** — `normalizeDoi` diverged across modules (trim-then-strip vs strip-then-trim);
  a whitespace-padded URL DOI failed to normalize in the screening path, splitting one study into
  two during screening dedup / verdict carry-over. Collapsed the duplicate copies onto the single
  canonical `lib/study-id.ts` primitive.
- **F2 (High/blocker)** — the harness referenced `scripts/capture-recall-fixture.ts`, which didn't
  exist. Built it: captures real `perSource` records live and assembles a `RecallFixture` for a
  supplied (never fabricated) truth set — the missing mechanism to populate `REAL_RECALL_FIXTURES`.

**Status**: ✅ tsc · ✅ lint · ✅ build · suite 844 pass / 15 pre-existing fail — no regression. Not committed.

## 2. Changes
- `lib/screening-utils.ts` — removed local `normalizeDoi`; imports it from `@/lib/study-id`.
- `lib/screening.ts` — removed local `normalizeDoi` (inside `fetchAllPrimaryStudiesForScreening`);
  imports the canonical one. (Behaviour now identical to search dedup.)
- `lib/screening-utils.test.ts` — +1 regression test: a `\t…\n`-padded URL DOI now carries a human
  verdict across re-screens (was broken under strip-then-trim).
- `scripts/capture-recall-fixture.ts` (new) — CLI: `--name --description --query --truth-file
  [--limit --out]`. Queries PubMed/OpenAlex/Europe PMC/Scopus via their `fetchPrimaryStudyIds`,
  records returned `{pmid,doi}` per source, emits a `RecallFixture` (`synthetic:false`). A source
  that errors/lacks a key records `[]` (honest gap, no invented coverage). Truth set is parsed from
  a file (digits→PMID, contains "/"→DOI); nothing fabricated. Run with `npx tsx` (resolves `@/` alias).

## 3. Files touched
| File | Type |
|---|---|
| `lib/screening-utils.ts` | modified (use canonical normalizeDoi) |
| `lib/screening.ts` | modified (use canonical normalizeDoi) |
| `lib/screening-utils.test.ts` | modified (+1 F3 regression test) |
| `scripts/capture-recall-fixture.ts` | new (fixture capture CLI) |

No routes, env vars, or DB schema. Script honors existing keys (OPENALEX_API_KEY, NCBI_API_KEY, ELSEVIER_API_KEY, OPENALEX_EMAIL).

## 4. Behavior
No user-facing change. F3 makes screening dedup/verdict carry-over agree with search dedup on
padded/cased URL DOIs. F2 gives a reproducible way to capture real recall fixtures.

## 5. Not addressed (still open from Validation 001)
- **F1 (High)** — OpenAlex `fetchPrimaryStudyIds` returns 401 with the local key (CRIT-1 extension).
  This is an env/key/ops issue, not a code defect; the code already degrades via `Promise.allSettled`.
  Cannot fix from code in this environment — needs a working key or confirmation of the `api_key` vs
  `mailto` path. Flagged for whoever holds the OpenAlex account.
- **F4 (Low)** — PubMed `fetchPrimaryStudyIds` 200-id cap (no DOIs) truncates large reviews. Noted;
  raising it interacts with recall measurement — defer until real fixtures exist.
- **#2/#2b measured recall** — now unblocked tooling-wise (F2 done), but still needs (a) real fixtures
  captured + committed and (b) OpenAlex working (F1) for the number to include the recall backbone.

## 6. Wiki updates (librarian)
- `[[Architecture]]`/data-flow page — `normalizeDoi` is now single-sourced in `lib/study-id.ts`
  (screening + search + cron all use it). Previously duplicated.
- `[[Milestone — Search Recall & Provenance Benchmark]]` — capture script now exists
  (`scripts/capture-recall-fixture.ts`); #2/#2b still pending real fixtures + F1.
- No new wiki/code discrepancies. (Open: brief's nonexistent `lib/per-source-count.ts`, handoff 084 §8.)

## 7. Next
- DESIGNER specs `spec/design/001–003-design.md` are on file and not yet confirmed implemented
  (handoff 089 landed a retraction badge; relationship to these specs unverified) — a DEV pass to
  reconcile them is the next available work.
- F1 (OpenAlex key) unblocks real recall capture.

## 8. Test / lint / build
```
tsc: 0 · ESLint: 0 · build: ✓ · suite: 844 pass / 15 pre-existing fail (no regression)
```

**Session completed**: 2026-06-16
