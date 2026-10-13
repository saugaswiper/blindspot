# Handoff 110 — Data extraction: source-presence gate (Brief 009, slice 2a)

**Date:** 2026-10-12
**Brief:** `spec/briefs/009.md` — Data Extraction: Verification Core (4-check gate).
**Addresses:** Roadmap NEXT milestone (Data extraction); operator build order ① (brief 009).
Continues handoff 109, which shipped checks 3 & 4 (consistency + range).

**Scope note:** Brief 009's full slice 2 is the extractor (`lib/extraction.ts`), the API route,
and the `ExtractedValue`/`ExtractionResult` shapes. Per the loop's "implement only the
first/smallest shippable one" rule, this run ships the **one deterministic, network-free,
model-free piece of that slice**: **check 1 — the source-presence gate**. It is the check that
directly proves brief AC1 (a fabricated number can never be `verified`) and it needs no model, so
it ships cleanly on its own, matching the discipline of handoff 109. The two differently-framed
model passes (check 2), the 4-check orchestration/status assignment, the API route, and the
`ExtractedValue`/`ExtractionResult` provenance shapes remain **deferred** (see "Deferred" below).

## Changes
- **CREATE `lib/extraction-source.ts`** — pure source-presence verification:
  - `checkSourcePresence(value, pages, citedPage?): SourcePresenceResult` — the gate. Returns
    `ok:true` when the value appears as digits on the cited page (or anywhere, if no page was
    cited); `wrong_page` when it appears only on a *different* page (mis-citation, a distinct
    severity from fabrication per field report §4.1); `spelled_out` when it appears only spelled
    out ("forty-two") — flagged for a human, never called fabrication; `not_in_source` otherwise
    (fabrication — the AC1 case).
  - Number matching is by **normalised numeric value**, tolerant of journal formatting:
    comma-grouped thousands (`1,234`), middle-dot decimals (`3·92`), Unicode minus (`−2.5`), and
    trailing percent (`42%`). A value is **not** matched when embedded inside a larger number
    (`42` ≠ `4267`), so the gate does not spuriously pass.
  - `spelledOutForms(value)` — exported helper giving the lowercase spelled-out variants of a
    non-negative integer 0–999 (hyphenated and spaced tens; British "and" after a hundred);
    empty for values it does not spell out (negative / non-integer / ≥ 1000).
  - Types: `SourcePage { page, text }`, `SourcePresenceResult`, `SourcePresenceCode`
    (the `not_in_source | wrong_page | spelled_out` subset of the existing
    `ExtractionFailureCode`). No mutation, no network, no model.
- **CREATE `lib/extraction-source.test.ts`** — 14 vitest unit tests: the fabrication/AC1 case,
  the embedded-number non-match, present-on-cited-page, present-with-no-cited-page, the
  `wrong_page` mis-citation case, the four formatting variants (comma / middle-dot / Unicode
  minus / percent), three spelled-out cases (hyphen, spaced, digit-preferred-over-spelled), and
  the `spelledOutForms` coverage + out-of-range-returns-empty cases.

No existing files were edited; the failure-code vocabulary reused is the one handoff 109 already
added to `types/index.ts`.

## Files touched
- `lib/extraction-source.ts` (new, ~215 lines)
- `lib/extraction-source.test.ts` (new, 14 tests)

## Behavior
Given a resolved full-text as pages-with-text-layers and an extracted number (optionally with the
page it was cited from), the gate deterministically decides whether that number is really in the
source and on the right page. This is the fabrication/mis-citation guard of the 4-check gate; it
produces no `verified` status on its own (that is the deferred orchestrator's job once all four
checks can be combined) but it is the check that makes `verified` trustworthy.

## Brief acceptance criteria status
- **AC1 (a fabricated number is NEVER `verified` → `not_in_source`; unit-proven):** ✅ the
  source-presence mechanism and its fabrication test are in place. Full enforcement of "never
  `verified`" lands when the deferred orchestrator gates `verified` on this check; the gate
  itself now guarantees a fabricated value returns `not_in_source`.
- **AC2 (Ch 6 formulas):** ✅ already shipped (handoff 109).
- **AC3 (provenance / failure code on every value):** partially served — the gate reports
  `foundOnPages` + a failure code; the full `ExtractedValue` provenance shape is deferred.
- **AC4 (two-pass conflict):** depends on the deferred model passes (check 2) — not in this run.
- **AC5 (tester, external, ketamine/TRD truth set):** stays `claimed` — not yet validated.
- **AC6 (gates green):** see below.

## Gate results
- `npx vitest run lib/extraction-source.test.ts`: **14/14 pass.**
- `npx vitest run` (full suite): **906 pass / 12 fail / 918 total.** The 12 failures are the
  **pre-existing baseline** (same modules recorded in handoff 109: `boolean-search-builder`,
  `cache-freshness`, `cache-topic-search`, `keyboard-shortcuts`, `protocol-storage`,
  `study-design`, the `use-persistent-*` hooks). **0 new failures** (904 → 918 total = +14 new
  passing tests). No screening regression.
- `npx eslint lib/extraction-source.ts lib/extraction-source.test.ts`: **clean, exit 0.** (The
  repo-wide lint still carries its pre-existing error load in `.claude/worktrees/*` and
  `spec/validation/*.mjs`, unchanged by this work.)
- `npm run build`: **✅ exit 0, "Compiled successfully".** TypeScript clean.

## Deferred (follow-on brief 009 slice 2b)
- `lib/extraction.ts` — the two differently-framed model passes (check 2: cell-by-cell
  transcriber vs target-hunting), `conflict:<field>` detection (never average), and the 4-check
  **orchestration/status assignment** that consumes `checkSourcePresence` +
  `runConsistencyChecks` + `checkInstrumentRange` to gate `verified`.
- `ExtractedValue` / `ExtractionResult` provenance shapes in `types/index.ts` (still held back so
  the orchestrator can commit to a provenance shape, per handoff 109's note).
- `app/api/extract/route.ts` — `POST { doi?/pmid?, targets }`.
- Out-of-scope per brief: review UI, figure digitising, author-contact tracker, DB persistence.

## Known limitation (respected / documented)
- The gate reads en/em dashes as range separators, so a hyphen used as a range dash between two
  bare integers (`2-4`, ASCII hyphen) can bind to the second number as a sign. Clinical ranges
  normally use en-dashes (handled) and signed values use Unicode minus (handled); this ASCII-dash
  edge is noted in the source and left for the model-pass slice to disambiguate with context.

## Now-stale wiki pages (titles)
- **[[Roadmap & Status]]** — Data-extraction row: check 1 (source-presence) shipped on main
  alongside checks 3 & 4; AC1 mechanism in place (full `verified`-gating deferred to orchestrator).
- **[[Otto-SR (Reference Target)]]** — gap map Data-extraction row: three of the four checks now
  have deterministic implementations; model passes + orchestration remain.
- **[[index]]** / **[[Handoff Log]]** — add handoff 110 and `lib/extraction-source.ts`.
- A **Data Extraction** feature/architecture page (noted still-absent in handoff 109) would now
  cover two shipped modules (`extraction-checks`, `extraction-source`).
