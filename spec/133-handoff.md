# Handoff 133 — Brief 017 slice 1: hypergeometric stopping test

## Addresses
`spec/briefs/017.md` scope (1), the stopping rule. Scope (2), ranker latency, is **deferred** to the next run. No AC is verified; all stay `claimed`.

## Changes
- `lib/screening-ranker.ts`: new `stoppingTest(screenedInOrder, nTotal, { target=0.95, alpha=0.05, minScreenedFrac=0.2, kFrac=0.1 })` returning `{ stop, p, recallLowerBound, kUsed, method: "hypergeometric-cmh2020", advisory: true }`, plus exported `hypergeomCdf`. `estimateRecall` is unchanged but now marked `@deprecated` as a stopping signal.
- Derivation is in a code comment. I could not access the paper's full text, so this is the test from first principles (brief's fallback). Last k screened = sample; the first s-k have d' includes; H0 is recall(s-k) < target, i.e. M ≥ floor(d'(1-t)/t)+1 includes in the R = N-(s-k) unreviewed records; p = P(X ≤ x) under hypergeometric(R, M0, k); stop when p < α. Ranked-order tails bias x upward, so the test errs toward not stopping.
- `recallLowerBound` = d'/(d'+M_max), where M_max is the largest M not rejected at α (binary search).
- `lib/screening-benchmark-sim.ts`: `activeLearningRun` now also returns `hgStop` ({ screenedFrac, trueRecall, targetMet } | null) alongside the unchanged `stop`.
- Tests (`lib/screening-ranker.test.ts`): hand-computed p-values (56/120, 112/120), no stop before the minimum fraction, all-negative-tail stop, include in last k blocks the stop, too few includes can't stop.

## Behaviour note (limit of the method)
The test needs enough found includes to be powerful. With d' includes, M0 = floor(0.0526·d')+1; for small reviews (e.g. 14 includes, M0 = 1) it can only reject when k covers nearly the whole remaining pool, so it will rarely fire there. The k/min-fraction defaults (0.1 / 0.2) are untuned. AC1/AC2 may partly fail on low-prevalence reviews; the tester should report per review.

## Not done
- AC1–AC4 measurement (Set B cache exists at `~/.cache/blindspot/chan2025/x`, but a run is ~85 s per n=690 review until the ranker is faster). `scripts/benchmark-setb.ts` does not yet write `hgStop` to the scorecard.
- Knee method (optional).
- Scope (2): memoised/warm-start ranker, class balance, memoised-vs-plain identity test, latency and WSS@95 regression checks (AC3, AC4).

## Gates
- `npm run lint`: 0 errors (3 pre-existing warnings).
- `npm test`: 1060 pass, 12 fail (the same known baseline), 18 skipped.
- `npx tsc --noEmit` clean; `npm run build` succeeds.

## Stale wiki pages
Roadmap & Status and Screening Recall Estimate Fix (new `stoppingTest`; `estimateRecall` deprecated); ML Layer (new export).
