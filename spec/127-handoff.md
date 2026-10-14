# Handoff 127 — Screening ranker + benchmark metrics (Brief 010, first slice)

## Addresses
`spec/briefs/010.md` (ML layer v0). No open validation FAIL fix remained for the dev (brief 009 fix slice 2 has only a pass-level "prefer table-unit" refinement and a tester re-run left), so the next unimplemented brief was taken. Only the smallest shippable slice is done.

## Changes
- `lib/screening-ranker.ts` (new): `rankRecords(records, verdicts?)` — deterministic TF-IDF (title+abstract) + L2 logistic regression trained in memory on the reviewer's human-verified include/exclude verdicts; cold start (missing either class) preserves input order with flat score 0.5. `estimateRecall(found, unscreenedScores)` — advisory recall estimate with a conservative lower bound; never excludes anything.
- `lib/screening-benchmark.ts` (new): `recallAtK`, `wss` (WSS@95), `splitHasNoOverlap` (leakage check).
- `lib/screening-ranker.test.ts` (new): 8 tests (cold start, topical ranking, determinism, recall estimate, metric math, split overlap).

## Behavior
Pure library code; not wired into any UI or route yet, so no user-visible change.

## Deferred (same brief)
- SYNERGY fetch/train scripts and `models/screening/v1.json` global model (AC1, AC3 artifact scan, AC5 promotion rule).
- "Most likely include first" sort mode + recall line in `components/ScreeningPanel.tsx`.
- Held-out WSS@95 vs ASReview baseline. All methodology claims remain `claimed` (the lower-bound heuristic is unvalidated).

## Gates
- `npm run lint`: 0 errors (3 pre-existing warnings in spec/validation harnesses).
- `npm test`: 1020 pass / 12 fail / 10 skipped (same 12 pre-existing failures, none in new files).
- `npm run build`: succeeds.

## Files touched
`lib/screening-ranker.ts`, `lib/screening-benchmark.ts`, `lib/screening-ranker.test.ts`, `spec/127-handoff.md`.

## Possibly stale wiki pages
Roadmap & Status (ML layer row); ML Layer; Screening.
