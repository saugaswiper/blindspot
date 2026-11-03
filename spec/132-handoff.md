# Handoff 132 — Brief 015 slice 2: simulation library + A/B harness + stopping-rule runs

## Addresses
`spec/briefs/015.md` scope items 4 (conditions A and B only) and 5. Slices 1 is handoff 130. Nothing is measured on the full Set B yet; no AC is verified.

## Changes
- `lib/screening-benchmark-sim.ts`: seeded `rng`, `randomOrder` (condition A), `activeLearningRun` (condition B: 1 include + 1 exclude prior, batch = max(10, ceil(n/60)), re-rank on all verdicts), `orderMetrics` (WSS@95, recall@10/20/30%, % screened to 95% and 98% recall), `screenedToReach`, `summarize` (median, worst, mean). `activeLearningRun` also runs brief 013's `estimateRecall` each round and records the first point where `lower >= 0.95`: % screened, true recall there, and whether the bound held. It also times each `rankRecords` call (AC8).
- `lib/screening-benchmark-sim.test.ts`: 5 synthetic tests (no record text).
- `scripts/benchmark-setb.ts`: loads the Set B cache, runs A and B per review and seed, writes metrics only to `spec/benchmarks/015-setb-scorecard.json` (override with `SCORECARD_OUT`). Flags: `--seeds`, `--only`, `--max-n`.
- No change to `rankRecords` or `estimateRecall`.

## Observed (smoke only, not a scorecard)
CD011218 (n=690, 14 includes), seed 1: B WSS@95 0.605 vs random -0.05; B recall@10% 0.857 vs random 0.071. The stopping rule never reached lower >= 0.95 before the pool was exhausted. One seed on one review; `claimed`.

## Latency finding (AC8, input for the 013 budget)
That single run took about 85 s for n=690 (about 60 re-rank rounds). `rankRecords` is the cost, and it grows with n and the number of rounds. At n=49k (CD014715) the full run is not feasible on this path. Per brief, not optimised here. The full 22-review run needs the brief's fallback (seeds 1–3 on the 8 smallest, seed 1 on the rest) or a faster ranker (brief 013 owns latency). I did not produce the committed `spec/benchmarks/015-setb-scorecard.json`.

## Deferred
Conditions C (protocol cold start), D (fusion), E (Gemini sample, AC6); DTA and no-abstract robustness slices; Chan 2025 comparison row; the committed scorecard `.json`/`.md` (with CC BY 4.0 attribution); the full-run decision above.

## Gates
- `npm run lint`: 0 errors (3 pre-existing warnings).
- `npm test`: 1051 pass, 12 fail (same 12 pre-existing), 18 skipped.
- `npx tsc --noEmit`: clean. `npm run build`: succeeds.

## Stale wiki pages
Roadmap & Status and Screening Model Plan (brief 015 slice 2 shipped; latency finding); ML Layer (new `lib/screening-benchmark-sim.ts`).
