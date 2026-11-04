# Handoff 138 — Brief 017 scope (2): AC3 latency measurement script

## Addresses
`spec/briefs/017.md` AC3 (latency). Brief 017 stays open. No ranker code changed this run.

## Changes
- New `scripts/bench-ranker-latency.ts`: times `rankRecords` after warm-up on seeded synthetic records (Zipf-ish vocabulary, 12-word titles, 150-word abstracts), with 10% includes in the training set. Options: `--n`, `--train`, `--reps`.

## Measured (claimed; synthetic text, one dev machine, noisy)
- n = 3,000: first call (vectorise + fit) 258 ms. Warm median: 44 ms at 300 training verdicts, 72 ms at 600, 138 ms at 1,200. All under the 300 ms target.
- n = 49,000 (measured, not projected): first call 4.8 s. Warm median 138 ms at 600 training verdicts, 377 ms at 3,000; maxima 0.9–2.0 s over only 3 reps (outliers, likely GC or machine noise).
- Caveat: real abstracts have more distinct terms and longer texts than this synthetic set. Handoff 136 measured 340–450 ms mean per call on real Set B at n ≈ 3,000, so AC3 is NOT confirmed on real data. Per-call cost is dominated by `fit` (200 epochs × training rows), so it scales with training-set size, not n.

## Not done (deferred)
- Warm start, class balance and epoch early-stop: all change the ranking order, so they need the SYNERGY WSS@95 ≥ 0.49 check (AC4), and SYNERGY is not in the dev cache.
- AC1 on the remaining Set B reviews, AC2 on SYNERGY, committed scorecard, knee method, conditions C–E.

## Gates
- `npm run lint`: 0 errors, 3 pre-existing warnings.
- `npm test`: 1064 pass, 12 fail (known baseline), 18 skipped.
- `npm run build`: succeeds.

## Stale wiki pages
ML Layer / Roadmap & Status: n = 49k latency is now measured on synthetic data (above); real-data AC3 remains unconfirmed.
