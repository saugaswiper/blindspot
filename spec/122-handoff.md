# Handoff 122 — Bounded Gemini calls (Brief 009 fix slice, item 1; validation 012 FAIL)

## Addresses
`spec/briefs/009.md` "Fix slice (2026-10-14)" **item 1** (bounded Gemini calls + whole-request budget), from
validation 012 finding 1 (2/3 live runs hung >900 s; no timeout in `callGeminiExtraction`).

## Changes
- `lib/extraction-passes.ts`: `callGeminiExtraction` now passes `AbortSignal.timeout(GEMINI_TIMEOUT_MS = 45 s)`
  per attempt; on timeout/abort it waits 1 s and retries **once**; a second timeout throws the new exported
  `ModelTimeoutError` (`reason = "model_timeout"`). Non-timeout errors (HTTP errors, missing key) behave as before.
- `lib/extraction.ts`: `ExtractOptions.deadline?` (epoch ms). `extractOutcomesAsync` catches `ModelTimeoutError`
  per target → status `manual`, `detail` starting `model_timeout: …`, and continues with later targets. Once the
  deadline has passed, no further target is started; each remaining one is `manual` with a `model_timeout:` detail.
  Other errors still propagate.
- `app/api/extract/route.ts`: sets `deadline = now + 180 s` (`EXTRACTION_BUDGET_MS`), leaving room for one in-flight
  target (≈2×45 s + backoff) under `maxDuration = 300`. Response stays 200 with partial results.
- `lib/extraction-passes.test.ts`: 4 new tests (retry-then-ModelTimeoutError with `signal` set; success on retry;
  timed-out target → `manual` while the next target still verifies; past-deadline → `manual` without model calls).

## Behavior
A stalled Gemini call can no longer hang the request: worst case per target ≈ 91 s, whole request is capped by
the budget. Timed-out targets are `manual` (never guessed, never `verified`). `ExtractedValue` has no `reason`
field, so the `model_timeout` reason is carried in `detail` (no type change).

## Deferred
- **Item 2 (table ≠ figure routing, `lib/extraction.ts` `verifyTarget`)** — next run.
- Item 3's tester re-run (≥3 runs, ablated control, 7 OA papers via XML) — tester's job after item 2.
- Not verified live: no real Gemini stall was reproduced; timeout behavior is unit-tested with stubs only.
  Whether the 012 hang was Gemini-side or connection-side remains undiagnosed. No methodology claim changes
  (`claimed` stays `claimed`).

## Gates
- `npm run lint`: 0 errors (3 pre-existing warnings in spec/validation harnesses).
- `npm test`: 997 pass / 12 fail / 4 skipped. The same 12 failures exist on a clean stash of main (993 pass before
  +4 new); none in extraction files.
- `npm run build`: succeeds.

## Files touched
`lib/extraction-passes.ts`, `lib/extraction-passes.test.ts`, `lib/extraction.ts`, `app/api/extract/route.ts`.

## Possibly stale wiki pages
Roadmap & Status (Data extraction row: add that the 012 hang is fixed-in-code, unverified); any Data Extraction /
`/api/extract` feature page describing time bounds (none existed: "reliable/bounded in time" was contradicted by 012).
