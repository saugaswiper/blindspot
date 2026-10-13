# Handoff 109 — Data extraction: consistency & range checks (Brief 009, slice 1)

**Date:** 2026-10-12
**Brief:** `spec/briefs/009.md` — Data Extraction: Verification Core (4-check gate).
**Addresses:** Roadmap NEXT milestone (Data extraction); operator build order ① (brief 009).
**Scope note:** Brief 009 names five files across the full 4-check gate. Per the loop's
"implement only the first/smallest shippable one" rule, this run ships the **deterministic,
network-free, model-free slice**: Cochrane Ch 6 consistency relations + the instrument range
check (checks 3 & 4 of the gate), plus the shared status/failure-code vocabulary. The two-pass
extractor, source-presence check, 4-check orchestration, and the API route are **deferred** to
a follow-on handoff (see "Deferred" below).

## Changes
- **CREATE `lib/extraction-checks.ts`** — pure functions implementing the Cochrane Handbook v6
  Chapter 6 arithmetic relations and the Ch-6 instrument range check:
  - `tCritical975(df)` / `ciDivisor(n)` — t-based CI divisor; `3.92` (= 2×1.96) for n ≥ 60 or
    unknown n, `2 × t_{0.975, n−1}` for small samples (§6.5.2.2–3). t-values from a published
    table (df 1–30, 40/50/60/80/100), nearest-lower-df (conservative); invalid df → 1.96.
  - `seFromCi` / `sdFromSe` / `seFromSd` — the §6.3.1 / §6.5.2.2 conversions (used only to
    *compare*, never to mutate a reported value — no silent conversion, per Cochrane §5.2.3).
  - Relation checks (each returns `{ok, ran, code?, computed?, reported?, detail?}`, and
    `ran:false` when inputs are absent — absence of evidence is not a failure):
    `checkCiOrder`, `checkMeanInCi`, `checkSeAgainstCi`, `checkSdAgainstSe`,
    `checkProportion`, `checkSampleSize`.
  - `runConsistencyChecks(stats): ConsistencyReport` — runs every applicable relation, returns
    `{consistent, ran, failures}`.
  - `checkInstrumentRange(value, range|name)` + `INSTRUMENT_RANGES` seed registry (MADRS 0–60,
    HAM-D, BDI, PHQ-9, QIDS, etc. from the ketamine/TRD truth set) + `lookupInstrumentRange` /
    `normalizeInstrument`.
- **CREATE `lib/extraction-checks.test.ts`** — 32 unit tests (vitest): the AC2 worked examples
  (SE from 95% CI large-sample & small-sample t divisor; SD = SE·√n; inverse), each relation's
  pass + fail path (incl. a reversed-CI, a mean-outside-CI, an SE/CI inconsistency, an SD/SE
  inconsistency, a proportion mismatch, an n>randomised case), a **range-violation case**
  (MADRS 75 → `out_of_range`), unknown-instrument (does not run), and the multi-discrepancy
  aggregation path.
- **EDIT `types/index.ts`** — new "Data extraction (Brief 009)" section with `ExtractionStatus`
  (`verified` / `check` / `manual` / `human` / `author_contact`) and `ExtractionFailureCode`
  (incl. `not_in_source` vs `wrong_page` distinction, `conflict`, the consistency codes, and
  `out_of_range`). These are the shared vocabulary the deferred extractor + API will reuse.

## Files touched
- `lib/extraction-checks.ts` (new, ~360 lines)
- `lib/extraction-checks.test.ts` (new, 32 tests)
- `types/index.ts` (+~45 lines, additive; no existing type changed)

## Behavior
A value's internal-consistency status can now be computed deterministically: given the
statistics an extractor reports for one outcome (any subset of mean/SD/SE/CI/n/randomised/
events/total/proportion), `runConsistencyChecks` reports whether every relation that *could*
be evaluated held, and names each discrepancy by its Cochrane-specific failure code. Range
plausibility is a separate check keyed on the instrument. No value is ever mutated or converted.

## Brief acceptance criteria status
- **AC2 (Ch 6 formulas exact + unit-tested):** ✅ implemented and unit-tested against worked
  examples (SE from 95% CI incl. the t-divisor for n<60; SD from SE·√n).
- **AC1, AC3, AC4:** depend on the source-presence check + two-pass extractor (deferred slice) —
  not in this handoff.
- **AC5 (tester, external, ketamine/TRD truth set):** stays `claimed` — not yet validated.
- **AC6 (gates green):** see below.

## Gate results
- `npm test` (new file in isolation): **32/32 pass.**
- `npm test` (full suite): **892 pass / 12 fail / 904 total.** The 12 failures are the
  **pre-existing baseline** (roadmap records 860/872 pass = 12 fail before this run) in unrelated
  modules — `boolean-search-builder`, `cache-freshness`, `cache-topic-search`,
  `keyboard-shortcuts`, `protocol-storage`, `study-design`, and the `use-persistent-*` hooks.
  None touch extraction; **0 new failures** (872 → 904 total = +32 new passing tests).
- `npm run lint` (touched files only: `lib/extraction-checks*.ts`, `types/index.ts`): **clean,
  exit 0.** Repo-wide `npm run lint` still reports its **pre-existing** error load (concentrated
  in `.claude/worktrees/*` copies and `spec/validation/*.mjs` harnesses); unchanged by this work.
- `npm run build`: **✅ exit 0, "Compiled successfully".** TypeScript clean.

## Deferred (follow-on brief 009 slice 2)
- `lib/extraction.ts` — the two differently-framed passes (check 2), source-presence matching
  against the page text layer (check 1: `not_in_source` vs `wrong_page` vs `spelled_out`),
  conflict detection (never average), and status assignment that consumes
  `runConsistencyChecks` + `checkInstrumentRange` to gate `verified`.
- `app/api/extract/route.ts` — `POST { doi?/pmid?, targets }`.
- `ExtractedValue` / `ExtractionResult` shapes in `types/index.ts` (held back deliberately so the
  extractor slice can commit to a provenance shape without pre-locking it here).
- Out-of-scope per brief: review UI, figure digitising, author-contact tracker, DB persistence.

## Now-stale wiki pages (titles)
- **[[Roadmap & Status]]** — Data-extraction stage can note slice 1 (Ch 6 consistency + range
  checks) shipped on main; AC2 `claimed`→ still needs tester (AC5).
- **[[Otto-SR (Reference Target)]]** — gap map Data-extraction row: backend checks begun.
- **[[index]]** / **[[Handoff Log]]** — add handoff 109 and the new `lib/extraction-checks.ts`.
- A new **Data Extraction** feature/architecture page may be warranted (currently none).
