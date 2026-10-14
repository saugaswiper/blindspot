# Handoff 125 — Statistic/precision guard (Brief 009 fix slice 2, item 2; validation 013 FAIL)

## Addresses
`spec/briefs/009.md` "Fix slice 2" **item 2** (013: prose "9 days" was `verified` for Table 4's 8.70).

## Changes
- `lib/extraction.ts`: new `proseIntegerForContinuous` guard in `verifyTarget`, after the two passes agree. If the agreed
  value is an integer, the target is a continuous statistic (has an `instrument`, or label matches mean/SD/median/change/
  score/difference/MD/SMD/SE), and the cited `locator`/`source_text` has no "table" cue → failure code `prose_integer`
  → status `check` (never `verified`).
- `types/index.ts`: `ExtractionFailureCode` gains `"prose_integer"`.
- `lib/extraction.test.ts`: 3 tests (prose integer → `check`; table decimal 8.70 still `verified`; count target unaffected).

## Behavior
Prose integers standing in for mean/SD-type targets are queued for human check. Heuristic is label/locator based:
a genuine integer-valued continuous statistic read from prose (e.g. an integer-scored scale median) also routes to `check` (conservative).
Note: targets with an `instrument` set are treated as continuous.

## Deferred (same brief)
- "Prefer a table-unit occurrence when the same quantity appears in both" — needs pass-level changes (re-hunt in tables); not done.
- Item 3: hard request deadline via `AbortSignal.any` into every model call.
- Tester re-run; all methodology claims remain `claimed`.

## Gates
- `npm run lint`: 0 errors (3 pre-existing warnings in spec/validation harnesses).
- `npm test`: 1010 pass / 12 fail / 10 skipped (same 12 pre-existing failures, none in extraction files).
- `npm run build`: succeeds.

## Files touched
`lib/extraction.ts`, `lib/extraction.test.ts`, `types/index.ts`, `spec/125-handoff.md`.

## Possibly stale wiki pages
Roadmap & Status (Data extraction row); any Data Extraction page listing the failure codes (new `prose_integer`).
