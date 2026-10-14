# Handoff 111 — Data extraction: 4-check orchestrator (Brief 009, slice 2b)

**Date:** 2026-10-13
**Brief:** `spec/briefs/009.md` — Data Extraction: Verification Core (4-check gate).
**Continues:** handoff 109 (checks 3 & 4) and handoff 110 (check 1, source presence).
**Author note:** written by the **operator session**, not the dev. The dev run
(`loop/dev-20261012-2053`) hit the Claude subscription **session limit** after writing the code
but before running the gates or writing this handoff. The gates below were run by the operator
session on the merged result.

## Changes
- **CREATE `lib/extraction.ts`** — the orchestrator that combines the four checks into one
  status per target value:
  1. source presence (`checkSourcePresence`, handoff 110),
  2. two-pass agreement (two differently-framed passes, **injected as functions**),
  3. internal consistency (`runConsistencyChecks`, handoff 109),
  4. instrument range (`checkInstrumentRange`, handoff 109).
  `verified` only when all four pass; any failed check → `check`; not attemptable → `manual`;
  figure-only value → `author_contact`. Disagreement between passes → `conflict`, **never an
  average**. No value is converted (`calculated` always false). A `method` field discloses
  **AI-assisted** extraction (one model, two passes) — explicitly *not* Cochrane §5.5.2
  dual-independent extraction.
- **CREATE `lib/extraction.test.ts`** — 10 unit tests with stubbed passes.
- **EDIT `types/index.ts`** — `ExtractedValue` / `ExtractionResult` / options types (+56 lines).

## Acceptance criteria (brief 009)
- **AC1** (fabricated number never `verified`): ✅ check 1 gates `verified` (unit-tested here + validation 010).
- **AC2** (Ch 6 formulas): ✅ handoff 109, validation 009.
- **AC3** (provenance or failure code on every value): ✅ per the `ExtractedValue` shape.
- **AC4** (conflict, never averaged): ✅ unit-tested.
- **AC5** (external false-`verified` rate on ketamine/TRD trials): **`claimed`** — needs the
  live model wiring (slice 2c) before the tester can measure it end to end.
- **AC6** (gates): see below.

## Gate results (run by the operator session, 2026-10-13)
- `npx vitest run` extraction suites: **56/56 pass** (10 new + 14 source + 32 checks).
- Full suite: **953 pass / 12 fail** — the 12 are the documented pre-existing baseline; 0 new.
- `npx tsc --noEmit --skipLibCheck`: no errors in touched files.
- `npx eslint lib/extraction.ts lib/extraction.test.ts types/index.ts`: clean, exit 0.
- `npm run build`: ✓ Compiled successfully.

## Deferred — slice 2c (next)
- Wire the two passes to a live model (Gemini) with the field-report failure-mode fixes
  (truncated-output detection, continuation turns, scope cap, bibliography-page exclusion,
  versioned cache key).
- `POST /api/extract` route.
- Then the tester measures AC5 on ≥3 ketamine/TRD trials (false-`verified` rate must be 0).

## Possibly stale wiki pages
[[Data Extraction]] (orchestrator now exists), [[Roadmap & Status]] (brief 009: checks 1–4 +
orchestrator shipped; live model + API pending).
