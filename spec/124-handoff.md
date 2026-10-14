# Handoff 124 — Close coincidental-match hole (Brief 009 fix slice 2, item 1; validation 013 FAIL)

## Addresses
`spec/briefs/009.md` "Fix slice 2 (2026-10-14)" **item 1**, from validation 013 (handoff 123 let figure-flagged values
pass if they appeared *anywhere* in the source, so small/common numbers coincidentally verified).

## Changes
- `lib/extraction.ts`: new `isCommonValue` / `figureFoundAsText`. When both passes flag a value as figure, it is treated
  as text only if it is found **at the page the passes cite** (`checkSourcePresence(value, pages, citedPage).ok`) AND is not
  a common value (integers with |v| < 100, 0.05, 0.01, 0.001, 95). Otherwise it stays `author_contact`. No cited page → `author_contact`.
- `lib/extraction.test.ts`: wrong-page variant test; parameterised test that 10, 31, 60, 2, 0.05 figure-flagged with a
  coincidental text occurrence stay `author_contact`. Existing test (12.4 on cited page 4 → `verified`) still passes; real table values
  like 12.55/21.18 on their cited page remain text-routed.

## Behavior
Fewer false-`verified` from figure reads that match unrelated text. Cost: figure-flagged integers < 100 that truly are table cells
route to `author_contact` (conservative).

## Deferred (same brief)
- Item 2: statistic/precision guard (prose integer vs continuous target → `check`; prefer table-unit occurrence).
- Item 3: hard request deadline via `AbortSignal.any` into every model call.
- Tester re-run; all methodology claims remain `claimed`.

## Gates
- `npm run lint`: 0 errors (3 pre-existing warnings in spec/validation harnesses).
- `npm test`: 1007 pass / 12 fail / 10 skipped (same 12 pre-existing failures, none in extraction files).
- `npm run build`: succeeds.

## Files touched
`lib/extraction.ts`, `lib/extraction.test.ts`, `spec/124-handoff.md`.

## Possibly stale wiki pages
Roadmap & Status (Data extraction row); any Data Extraction page describing figure routing as "source-wide presence".
