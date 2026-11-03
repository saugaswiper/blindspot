# Handoff 129 — Screening recall estimate rewrite (Brief 013, validation 015 AC4 FAIL fix)

## Addresses
`spec/briefs/013.md` (fix-brief, Priority NEXT); validation 015 AC4 FAIL. Backend library only.

## Method chosen and why
`estimateRecall(found, unscreenedScores, audit?)` now models missed includes among unscreened records as **Poisson** with mean = sum of scores.
- A Poisson upper tail dominates the Poisson-binomial tail (Hoeffding), so `lower = found / (found + q97.5(missed))` is a real one-sided 97.5% bound for any score vector, not the old `found / (found + 2×expected)` heuristic. `upper` uses the 2.5% quantile. Both are clamped so `lower <= estimate <= upper`.
- Raw logistic scores are uncalibrated (the cause of the 015 failure). Rather than fit Platt/isotonic on in-sample scores (the model trained on those records, so they are overfit), the new optional `audit` argument takes out-of-sample `(score-before-screening, verdict)` pairs, e.g. the latest screened batch. The observed/expected include ratio scales the unscreened mean **up only, never down**; a Garwood upper limit on the observed count feeds `lower`. `method` reports `poisson-uncalibrated` or `poisson-audit-scaled`.
- Output: `{ estimate, lower, upper, method, advisory: true }`. `rankRecords` / `wss` signatures unchanged. `audit` is optional, so the 015 harness call still works.

## Files touched
`lib/screening-ranker.ts`, `lib/screening-ranker.test.ts`, `spec/129-handoff.md`.

## Tests added
Interval ordering, 0 includes / empty pool, monotone in found includes, lower bound well below the point estimate on a long tail, interval narrows as the tail shrinks, audit can only lower the estimate. Latency guard: `rankRecords` at n = 3,000 with 1,500 verdicts took ~1.7 s here; budget in test 10 s.

## Acceptance criteria — NOT measured
The SYNERGY data (`SYNERGY_DIR`) is not available in this run, so the 015 protocol was **not rerun**. All of these stay `claimed`:
- AC1 (lower bound ≥ 0.95 by ≤ 70% screened in ≥ 7/9 reviews), AC2 (coverage ≥ 95%, overshoot ≤ 2%), AC3 (median width ≤ 0.25 at 50% screened): unmeasured.
- AC4 (advisory) holds by construction. AC5 (latency): met on a synthetic 3,000-record case (~1.7 s); real abstracts at n ≈ 3,000 are not timed.
- Risk to flag for the tester: the 015 harness calls `estimateRecall` **without** `audit`, so it will exercise the `poisson-uncalibrated` path. If scores are overconfident-low in the tail, AC2 coverage may fail there. The harness should pass the previous round's batch as `audit` to test the intended path. AC1 may be partial: the Poisson bound over thousands of low-score records is conservative.

## Deferred
Warm-starting / capping epochs in `fit` (not needed for the 10 s budget here); global model, UI, route wiring.

## Gates
- `npm run lint`: 0 errors (3 pre-existing warnings).
- `npm test`: 1029 pass, 12 fail (the same 12 pre-existing failures), 18 skipped.
- `npm run build`: succeeds.

## Stale wiki pages
Roadmap & Status (brief 013 implemented, awaiting validation); ML Layer (`estimateRecall` description and the `RecallEstimate` shape); Briefs/013 mirror (status); Screening Recall Estimate Fix.
