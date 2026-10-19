# Validation 015 — Screening ranker + benchmark metrics (handoff 127, brief 010 first slice)

**Date:** 2026-10-19 · **Tester:** Sonnet 5.5 · **Code under test:** `lib/screening-ranker.ts` (`rankRecords`, `estimateRecall`), `lib/screening-benchmark.ts` (`wss`, `recallAtK`). No app code touched.

## 1. What was tested and truth set
- **Truth:** SYNERGY (De Bruin et al. 2023, doi 10.34894/HE6NAQ, CC0): human full-text include/exclude labels of published systematic reviews, fetched via the `synergy-dataset` package. Nine reviews, 258–1,630 records, 9–96 includes: Nelson_2002, Sep_2021, Oud_2018, van_der_Valk_2021, Menon_2022, Donners_2021, Meijboom_2021, Jeyaraman_2020, Chou_2004. Bos_2018 was dropped because the run was too slow.
- **Fixture:** `fixtures/015-synergy-labels.json` has DOI and label per record, with no title or abstract text. The harness refetches text (command in the file header) and asserts n, include count and DOI order match the fixture.
- **Harness:** `015-harness.test.ts`, run with `SYNERGY_DIR=… npx vitest run spec/validation/015-harness.test.ts`. Raw results are in `015-results.json` (25 runs).
- **Scope:** the ranker is not wired to any UI or route, and there is no global model (no SYNERGY training, no `models/screening/v1.json`). So the only testable thing is the **in-review active-learning path**: `rankRecords(records, verdicts)` as the reviewer's verdicts accumulate. The global-model parts of the brief (AC1 held-out split, AC2, AC3, AC5) do not exist yet and were not tested.
- **Simulation (ASReview-style):** the prior is 1 random include and 1 random exclude (seeded). Each round the code re-ranks on all verdicts so far, and the top-B unlabelled records (B = max(10, n/60)) are "screened" with the true label. Seeds 1–3 (Chou_2004 and Jeyaraman_2020 have only 2 seeds because I stopped the run early; Oud_2018 was rerun in parallel and its first partial run discarded). The random baseline is a seeded shuffle of the same records.

## 2. Results

### A. Metric math (no leakage from the code under test)
`lib/screening-benchmark.ts#wss` vs an independent reference implementation of the ASReview definition: max |difference| < 1e-12 over 600 random (order, target) cases, and exactly 0.0 on all 25 simulation runs. **PASS.** `recallAtK` and `splitHasNoOverlap` were not independently checked beyond reading them (both are trivial).

### B. Ranking quality (WSS@95), active learning from 1+1 prior
| review | n | incl | runs | WSS@95 per seed | random WSS@95 | recall@10% / @20% screened |
|---|---|---|---|---|---|---|
| Chou_2004 | 1630 | 9 | 2 | .192, .265 | −.015 | .28 / .44 |
| Sep_2021 | 271 | 40 | 3 | .349, .227, .385 | +.026 | .16 / .38 |
| Nelson_2002 | 366 | 80 | 3 | .450, .379, .382 | −.017 | .25 / .47 |
| van_der_Valk_2021 | 725 | 89 | 3 | .423, .405, .424 | −.015 | .33 / .58 |
| Menon_2022 | 975 | 74 | 3 | .551, .557, .562 | −.015 | .68 / .86 |
| Jeyaraman_2020 | 1175 | 96 | 2 | .583, .605 | +.002 | .56 / .81 |
| Donners_2021 | 258 | 15 | 3 | .652, .601, .613 | +.049 | .51 / .87 |
| Meijboom_2021 | 882 | 37 | 3 | .637, .617, .639 | −.030 | .67 / .95 |
| Oud_2018 | 952 | 20 | 3 | .823, .812, .779 | +.062 | .78 / .95 |

- **Mean WSS@95 across the 9 reviews: 0.51** (review-mean spread 0.23–0.81; range over all 25 runs 0.19–0.82). The random order averages about 0 (−0.03 to +0.06 per review).
- **WSS@95 > 0 in 25/25 runs** and above that review's random baseline in 25/25. Any ordering signal gets this far, so it is a weak bar. The AC1 first clause ("WSS@95 > 0 vs random") is **met for the in-review path** on this set.
- The weakest results are the sparsest reviews, with the fewest positives to learn from and the largest pool (Chou_2004, 9 includes in 1,630: WSS 0.19–0.27). Seed variance is large on small reviews (Sep_2021 0.23–0.39).
- **Not tested:** AC1's second clause ("≥ ASReview published baseline for the same reviews"). I did not retrieve a published per-review baseline, and my protocol (1+1 prior, batch B) is not guaranteed to match theirs. This stays **unverified**; do not read 0.51 as "beats ASReview".

### C. `estimateRecall` as a stopping rule (the brief's headline feature) — **FAIL as useful**
At every round I compared the estimate and "conservative lower bound" with the true recall:
- **Lower bound ≤ true recall in 100% of rounds** (25 runs × all rounds; Wilson 95% lower limit on per-run coverage ≈ 87%), so it is "conservative" as advertised.
- **It is useless as a stopping rule.** The estimate first reaches 0.95 only after the reviewer has screened **95–98% of all records** (e.g. Oud_2018 96.0%, Meijboom 95.5%, Chou_2004 98.0%, Donners 97.7%). The lower bound reaches 0.95 after 97–99.8% of records. For Sep_2021 it **never** reaches 0.95 in any run. Compare the 19–82% of records the same rankings actually allowed one to skip at 95% true recall (section B). Cause: the "expected missed" figure is the sum of per-record probabilities over all unscreened records, and the regularised logistic scores are uncalibrated (each of thousands of unscreened records carries a small non-zero probability, which adds up).
- The point estimate **overestimated** true recall in some rounds: 5% of rounds in Sep_2021 and 3% in Chou_2004 (0% elsewhere). In the early rounds, where a stopping rule would matter, the estimate is therefore not a reliable upper-bound-safe quantity.
- The handoff lists the heuristic as unvalidated. This confirms it is unusable at the current calibration, though harmless because it is advisory and never excludes.

## 3. Pass/fail vs. the brief's bar
| Criterion | Verdict |
|---|---|
| AC1 WSS@95 > 0 vs random (in-review path) | **PASS** (25/25 runs; mean 0.51) |
| AC1 ≥ ASReview published baseline | **NOT TESTED / unknown** |
| AC1 on held-out reviews with a global model | **NOT TESTABLE** (no model, no split yet) |
| AC2 leakage, AC3 artifact scan, AC5 promotion | not implemented; not tested |
| AC4 stopping estimate useful and with uncertainty | **FAIL** (valid but stops at ~96% screened; lower bound is a 2× heuristic, not an uncertainty interval) |
| Metric math (`wss`) | **PASS** (independent reference) |

## 4. Wiki claims
- *Active-learning re-rank from the reviewer's verdicts beats random order*: `claimed` → **verified** (validation 015) for the in-review path: WSS@95 0.51 mean, 9 SYNERGY reviews, 25 simulated runs, 1+1 prior. Scope: simulated reviewers, TF-IDF + LR, 258–1,630 records.
- *`wss` implements WSS@95 correctly*: `claimed` → **verified**.
- *Advisory recall estimate / stopping rule (and its lower bound)*: stays `claimed` — **contradicted as practically useful**. Its lower bound was never above true recall (100% coverage) but it only licenses stopping after ~96% of the pool, i.e. no work saved. Do not present as a stopping rule.
- *"Beats ASReview baseline"*: unverified.

## 5. Caveats and follow-ups
- Simulated labels are final full-text includes (as in the SYNERGY label), not title/abstract verdicts, and the reviewer is perfect. Real reviewers are noisier.
- Nine reviews, 2–3 seeds each. Small, medicine/psychology only. No test on Bos_2018 or the larger SYNERGY reviews; the ranker was slow (many minutes per run at n ≈ 1,000 because it refits 200 epochs per call). Dev should check latency at the stated 3,000+ record requirement; batch gradient descent over the full pool each call may be too slow for interactive use.
- Suggested dev actions: (1) calibrate the recall estimate (e.g. a sample-based or SAFE/knee-style stopping rule, or Platt-scaled probabilities) and report an interval, not a ×2 heuristic; (2) benchmark against a stated ASReview baseline with the same prior/batch protocol before claiming AC1; (3) add runtime tests at n ≥ 3,000.
- Files: `015-harness.test.ts`, `015-results.json`, `fixtures/015-synergy-labels.json`.
