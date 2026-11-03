# Validation 016 — Brief 015 slice 2 (handoff 132): Set B simulation library, conditions A/B, stop-rule runs

**Date:** 2026-11-03 · **Tester:** Sonnet 5.5 · **Code under test:** `lib/screening-benchmark-sim.ts` (`screenedToReach`, `summarize`, `orderMetrics`, `randomOrder`, `activeLearningRun`), `lib/screening-benchmark-setb.ts` (loader). No app code touched.

## 1. Scope and truth
- **Truth:** Chan, He, Leung, Verspoor 2025 "Set B" (22 Cochrane reviews, doi:10.17632/7sgmg89zb6.1, CC BY 4.0). Human include/exclude labels. The zip in the cache has the sha256 the brief names (`649d8933…e48d3`, checked). Labels are binary (`True`/`False` only, in all 22 files).
- **Fixture:** `fixtures/016-setb-counts.json` has n, includes and no-abstract count per review. I made it with an independent Python `csv` parse, not the dev loader. It holds no record text.
- **Harness:** `016-harness.test.ts`. Results in `016-results.json`.
- **Not testable:** the handoff states that no scorecard exists (`spec/benchmarks/015-setb-scorecard.json` is absent), and that C, D, E are not built. The brief's decision questions (C vs B, D vs B) and AC4/AC5/AC6 have no data to test. Handoff 132 itself says no AC is verified.

## 2. Results
### A. Metric math: PASS
Against independent reference implementations, over 300 random orders (n 30–530, includes 1–21%): `screenedToReach` (95% and 98%), `wss95`, `recallAt10/20/30` and `summarize` agree to < 1e-12. `randomOrder` is a seeded permutation, and its WSS@95 is ≈ 0 at Set B-like imbalance (mean over 200 seeds, 30/3000, |mean| < 0.02).

### B. Loader vs independent parse: PASS (22/22)
n, include count and no-abstract count match the Python parse for all 22 reviews. Range is n 690–49,162, includes 6–133 (0.1%–3.9% prevalence), and no-abstract records are 2.3%–21% of the pool (CD013199 20.9%, CD015306 14.7%, CD015038 14.3%).

### C. Active learning (condition B) on real Set B: 4 runs, 2 reviews, thin
| review | n | incl | seed | WSS@95 | recall@10% | @20% | @30% | screened→95% | rankRecords calls | wall | mean / max per call |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CD011218 | 690 | 14 | 1 | .605 | .857 | .929 | .929 | 34.5% | 58 | 96 s | 1.7 s / 4.8 s |
| CD011218 | 690 | 14 | 2 | .601 | .857 | .929 | .929 | 34.9% | 58 | 118 s | 2.0 s / 8.5 s |
| CD011218 | 690 | 14 | 1 (rerun) | .605 | .857 | .929 | .929 | 34.5% | 58 | 108 s | 1.9 s / 6.3 s |
| CD013042 | 1,005 | 27 | 1 | .471 | .074 | .333 | .852 | 47.9% | 59 | 139 s | 2.4 s / 6.4 s |

- **Reproducibility (AC1, same seed → same numbers):** the CD011218 seed-1 rerun gave an identical order (all 14 include positions equal) and identical metrics. PASS for this one case. A–D not otherwise checked.
- **Handoff's smoke figure confirmed:** B WSS@95 0.605 and recall@10% 0.857 on CD011218 seed 1 reproduce exactly.
- **Wide spread across reviews:** CD013042 gets recall@10% of 0.07, which is about the same as random (0.10), and only 85% by 30%. The CD011218 figure is not representative. With n=2 reviews I can give no median, worst or CI; the dev's 22-review scorecard does not exist yet.
- **Independent consistency:** metrics recomputed from the returned order match `orderMetrics`; the order is complete (n records, all includes present).

### D. Stopping rule: no stop fired, so AC4 is unmeasured
`stop` was `null` in 4/4 runs: `estimateRecall`'s lower bound never reached 0.95 before the pool was exhausted, even though true recall hit 95% at 34.5–47.9% screened. This reproduces validation 015's finding (useless as a stopping rule) on Set B-style data and with the "previous batch as audit" fix from the operator review. The stop-point correctness check I wrote (recompute true recall at the stop index) never ran because there was no stop. So "share of reviews where stop has true recall < 0.95" is unknown, not 0. Four runs on two small reviews; the larger pools (3,000+, where the brief says it matters) were not run.

### E. Latency (AC8): confirmed, and it blocks the full scorecard
About 1.7–2.4 s per `rankRecords` call at n=690–1,005, roughly 60 calls, so 1.5–2.3 min per run. That is a single-run cost, with per-call time growing with n (1.7 s at 690 vs 2.4 s at 1,005). Extrapolating to n≥3,000 across 22 reviews × 3 seeds is untested by me; I did not run beyond n=1,005 and make no estimate for n=49k beyond the handoff's own statement that it is not feasible.

## 3. Pass/fail vs. the bar
| Item | Verdict |
|---|---|
| Sim metric math (`orderMetrics`, `screenedToReach`, `summarize`) | **PASS** |
| Loader parity on all 22 reviews | **PASS** |
| AC1 reproducibility (same seed, B) | **PASS** (1 case) |
| AC2 per-review metrics, median/worst/mean | **NOT MET**: helper exists, no 22-review run |
| AC3 C vs B, D vs B | **NOT TESTABLE** (C, D not built) |
| AC4 stop-rule safety at scale | **NOT MEASURED** (stop never fired in 4/4 runs) |
| AC5/AC6/AC7 (Chan comparison, Gemini, hygiene scan) | not built; not tested |
| AC8 latency recorded | **MET for n≤1,005** (≈2 s/call); full-n untested |

## 4. Wiki claims
- *`wss`/sim metric helpers compute WSS@95, recall@k, %-to-95/98 correctly*: `claimed` → **verified** (validation 016, independent reference, < 1e-12).
- *Loader parses Set B: 22 reviews, labels binary, counts*: `claimed` → **verified** (validation 016; n 690–49,162, includes 6–133).
- *B's smoke result on CD011218 (WSS@95 0.605)*: reproduced, but 1 review is not evidence. Keep `claimed`; CD013042 shows 0.47 and recall@10% 0.07.
- *Estimate-recall stop never fires on Set B*: new, measured on 4 runs (see §2D). Consistent with validation 015's contradiction of the stopping rule as practically useful. Handoff 132's reading ("conservative Poisson bound itself") is plausible but I did not isolate the cause.
- *"Beats Chan 2025 (19/22 ≥95% recall)"*: untested; nothing comparable has been produced.

## 5. Follow-ups
- Dev: commit a faster ranker path or use the brief's fallback so a real 22-review run exists. Until then this validation can only say the plumbing is correct.
- Re-validate when the committed scorecard lands: check A/B means against my own runs, and run stop-point safety on ≥ 8 reviews.
- Caveat: my runs reuse the dev's `activeLearningRun`, so §2C checks reproducibility and metric consistency, not the ranker independently. Ranking quality on Set B is only as strong as 4 runs.
- Files: `016-harness.test.ts`, `016-results.json`, `fixtures/016-setb-counts.json`. Cache path `~/.cache/blindspot/chan2025/x` (not committed).
