# Validation 015 — Screening ranker (handoff 127, brief 010 slice 1)

**Date:** 2026-10-18 · **Tester:** Sonnet 5.5 · **Code under test:** `lib/screening-ranker.ts` (`rankRecords`, `estimateRecall`), `lib/screening-benchmark.ts` (`wss`, `recallAtK`). No app code touched.

## 1. What was tested
Brief 010 AC1 (WSS@95 > 0 vs random on real reviews) for the in-review active-learning path, plus the advisory recall estimate (AC4). The global SYNERGY model is not shipped (deferred), so only the cold-start → in-review retrain path exists to test.

**Protocol (simulated reviewer):** seed with 1 random include + 1 random exclude; repeatedly `rankRecords` on the revealed verdicts only, screen the top unlabeled batch (max(20, N/50)), reveal truth labels, stop at 95% of includes. WSS@95 computed with the repo's `wss()` **and** an independent re-implementation (identical in every run). Random baseline = shuffled order, same seed.

## 2. Truth set + provenance
SYNERGY (De Bruin et al. 2023, CC0): full-text-stage inclusion labels of published SRs, joined to OpenAlex title/abstract (reconstructed from `abstract_inverted_index`). Committed: IDs+labels only (`fixtures/015-synergy-ids/*.csv`); abstract text is cached outside git by `015-fetch.mjs`. ~1–5% of listed records lacked an OpenAlex match and were dropped; duplicates removed. Harness: `015-harness.test.ts`; raw per-seed rows: `015-results.jsonl`.

## 3. Results

| Review | N | Includes | Seeds | WSS@95 per seed | Random WSS@95 (mean) | Recall @10% screened (mean) |
|---|---|---|---|---|---|---|
| Donners 2021 | 252 | 15 | 3 | .573 .589 .525 | −.025 | .56 |
| Nelson 2002 | 365 | 80 | 3 | .328 .361 .353 | .000 | .20 |
| Sep 2021 | 270 | 39 | 3 | .050 .050 .050 | −.018 | .20 |
| Oud 2018 | 945 | 20 | 3 | .714 .693 .755 | .094 | .72 |
| Jeyaraman 2020 | 1172 | 96 | 1 | .563 | .008 | .64 |
| Bos 2018 | 4860 | 10 | 1 | .887 | .052 | 1.00 |

Mean of review means WSS@95 = **0.52** (6 reviews; per-review range 0.05–0.89). 6/6 reviews > random order. Seed-to-seed spread within a review is small (≤0.05) where n=3; Jeyaraman and Bos are single-seed. Appenzeller-Herzog 2019 (N≈3,000) and further Jeyaraman/Bos seeds were started but did not finish (see caveats), so are **not** reported.

### AC1 vs. ASReview baseline — NOT assessed
I did not obtain ASReview's published per-review WSS@95 for these datasets, so "≥ ASReview baseline" is **unverified**. Only "WSS@95 > 0 vs random" is supported. Sep 2021 (0.05) is barely above random and is likely a weak spot (high-prevalence, short-text review; screened 243/270).

### AC4 — recall estimate: poorly calibrated, never signals stop
- `estimateRecall` point estimate **never reached 0.95** in any run (`stopEst95` null in 13/13 runs), even though true recall reached 0.90–0.95 at the last evaluated point.
- At the last point before true recall hit ~95%, the estimate was far below truth: Donners 0.39–0.47 (true 0.93), Nelson 0.59–0.64 (0.94), Oud 0.21–0.27 (0.90), Jeyaraman 0.41 (0.95); only Sep was near (0.91 vs 0.95). The sum of model probabilities over thousands of unscreened records is a large overestimate of remaining includes, so the estimate is very pessimistic.
- The "lower bound" was ≤ true recall at every trace point in 13/13 runs (coverage 100%), but trivially, because the estimate itself is so low. A stopping rule that never fires is conservative (safe for recall) but gives no workload saving; as designed it is unusable as a stopping criterion. Point estimate overstated true recall at only 1 of ~13 runs' points (Sep seed 3, 7.7% of its points).

## 4. Pass/fail vs brief 010
| Criterion | Verdict |
|---|---|
| AC1 WSS@95 > 0 vs random | **PASS** (6/6 reviews, mean 0.52; but n=1–3 seeds, 6 reviews, in-review learning only) |
| AC1 ≥ ASReview published | **NOT TESTED** |
| AC4 estimate usefulness | **FAIL (usefulness)**: advisory-only and never auto-excludes (code), but the estimate is miscalibrated ~2–3× low and never reaches a stop threshold |
| AC2/AC3/AC5, global model | not testable (deferred) |

## 5. Wiki claims
- "Ranker beats random order on real reviews (WSS@95 > 0)": `claimed` → **verified** for in-review active learning on 6 SYNERGY reviews (mean 0.52).
- Stopping estimate / "2× lower bound is conservative": stays `claimed`; the estimate is **contradicted as a usable stopping rule** (never reaches 0.95; heavily underestimates true recall).
- `lib/screening-benchmark.ts` WSS math: **verified** against an independent implementation (identical on all runs).
- Anything about the global SYNERGY model: nothing to verify yet.

## 6. Caveats
- Runtime: `rankRecords` retrains from scratch with 200 full-batch epochs each call; Jeyaraman (N=1172) took ~18 min per seed. Screening a 3,000+ record review (operator requirement) interactively would be far too slow at this cost — Appenzeller (N≈3,000) did not finish within ~1.5 h. Suggest dev warm-start/cache vectorization or fewer epochs.
- Simulation uses true labels as instant verdicts, 1+1 priors, and full-text labels (SYNERGY), not title-abstract labels.
- Fewer seeds/reviews than planned; no CIs beyond the seed ranges shown (6 reviews: too few for a meaningful interval).
- `npm run lint`: 0 errors.
