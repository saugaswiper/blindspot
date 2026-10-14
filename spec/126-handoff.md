# Handoff 126 — Hard request deadline into model calls (Brief 009 fix slice 2, item 3; validation 013 FAIL)

## Addresses
`spec/briefs/009.md` "Fix slice 2" **item 3** (013 saw requests of 354 s and 899 s; in-flight passes were only bounded per call, not by the request budget).

## Changes
- `lib/extraction-passes.ts`: `ModelCaller` takes an optional 3rd arg `signal?: AbortSignal`. `createModelPass(framing, call, deadline?)` derives `AbortSignal.timeout(deadline - now)` per call and passes it. `callGeminiExtraction` combines it with the per-attempt timeout via `AbortSignal.any([...])`; if the deadline signal is aborted the call throws `ModelTimeoutError` with no retry.
- `app/api/extract/route.ts`: one `deadline` (`Date.now() + EXTRACTION_BUDGET_MS`) shared by both passes and `extractOutcomesAsync`.
- `lib/extraction-passes.test.ts`: 2 tests (aborted deadline → single attempt, `ModelTimeoutError`; `createModelPass` passes a signal only when a deadline is given).

## Behavior
An in-flight Gemini call is aborted at the budget rather than after it, and not retried. The existing orchestrator catch turns `ModelTimeoutError` into `manual` (`model_timeout`); remaining targets already go `manual` past the deadline.

## Deferred (same brief)
- Fix slice 2 item 2's "prefer a table-unit occurrence" (needs pass-level table re-hunt).
- Tester re-run of validation 013; request-duration bound is `claimed` until re-measured. All methodology claims remain `claimed`.

## Gates
- `npm run lint`: 0 errors (3 pre-existing warnings in spec/validation harnesses).
- `npm test`: 1012 pass / 12 fail / 10 skipped (same 12 pre-existing failures, none in extraction files).
- `npm run build`: succeeds.

## Files touched
`lib/extraction-passes.ts`, `lib/extraction-passes.test.ts`, `app/api/extract/route.ts`, `spec/126-handoff.md`.

## Possibly stale wiki pages
Roadmap & Status (Data extraction row); any Data Extraction / API page describing the request time budget or `ModelCaller` signature.
