# Handoff 123 — Table ≠ figure routing (Brief 009 fix slice, item 2; validation 012 FAIL)

## Addresses
`spec/briefs/009.md` "Fix slice (2026-10-14)" **item 2**, from validation 012 (4/7 Table 2/3 values mis-routed as
figures → `author_contact`, yield 43%). Item 1 shipped in handoff 122.

## Changes
- `lib/extraction.ts` `verifyTarget`: a target routes to `author_contact` only if **both** passes set `from_figure`
  **and** the value is NOT found by `checkSourcePresence(value, pages)` anywhere in the source. Previously *either*
  pass sufficed. A figure-flagged value found verbatim in a table/body unit is treated as text and proceeds through the
  normal gate (two-pass agreement, source-presence, consistency, range). A one-sided figure flag no longer short-circuits;
  the other checks (incl. conflict) decide.
- `lib/extraction.test.ts`: 2 new tests (figure-flagged value present in text → `verified`; only one pass says figure →
  not `author_contact`).

## Behavior
Fewer false `author_contact` routes; no weakening of the gate: a text-routed value still must pass all four checks, and a
value absent from the source still cannot be `verified`. Presence is checked source-wide (not locator-restricted), so the
page-mismatch check still applies afterward via `wrong_page`.

## Deferred
- Item 3: tester re-run (≥3 runs, ablated control, 7 OA papers via XML). Not run live here; no methodology claim changes
  (`claimed` stays `claimed`).
- Back-matter unit dropping in `jatsToPages` (from validation 011) still open.

## Gates
- `npm run lint`: 0 errors (3 pre-existing warnings in spec/validation harnesses).
- `npm test`: 1000 pass / 12 fail / 4 skipped (same 12 pre-existing failures, none in extraction files; +2 new pass).
- `npm run build`: succeeds.

## Files touched
`lib/extraction.ts`, `lib/extraction.test.ts`, `spec/123-handoff.md`.

## Possibly stale wiki pages
Roadmap & Status (Data extraction row: figure-routing fix is in code, unverified); any Data Extraction feature page
describing `author_contact` routing as "either pass".
