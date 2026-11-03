# Handoff 135: Brief 017 scope (2), part 1: memoised vectors + dense LR weights

*Written by the operator: the dev run (loop/dev-20261103-1238) lost the network (ENOTFOUND) before writing its handoff; the code was committed by the runner.*

## Changes
`lib/screening-ranker.ts`:
- TF-IDF rows are now typed arrays (`Int32Array` term index, `Float64Array` weights).
- `vectorizeCached` memoises vectors per records-array instance (`WeakMap`, with a length guard). Arrays must be treated as immutable.
- `fit` uses dense `Float64Array` weights and gradient.

The math is unchanged: same summation order, and terms outside the training rows stay at 0, so rankings are identical. There is no warm start or class balance yet. Tests were added in `lib/screening-ranker.test.ts`.

## Measured (operator, 2026-11-03, `scripts/benchmark-setb.ts --seeds 1 --only CD011218,CD013042`)
| review | n | B WSS@95 | mean / max ms per `rankRecords` | before (validation 016) |
|---|---|---|---|---|
| CD011218 | 690 | 0.605 (identical) | 38 / 82 | 1,700–2,000 ms |
| CD013042 | 1,005 | 0.471 (identical) | (in run) | 2,400 ms |

The whole two-review run took **6.3 s**, against about 4 min before. That is about 45× faster with identical results. AC3 (≤ 300 ms per call at n = 3,000) is plausible but **not measured** at 3,000+.

## Not done
- Warm start and class balance (AC4 regression check).
- The `hgStop` column in `scripts/benchmark-setb.ts`. The scorecard still reports only the deprecated `estimateRecall` stop, which never fired.
- Full 22-review run; conditions C, D and E.

## Gates
`lib/screening-ranker.test.ts` and `lib/screening-benchmark-sim.test.ts`: 27/27 pass. The full suite is run at merge.
