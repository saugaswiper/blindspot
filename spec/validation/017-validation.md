# Validation 017 — Handoff 137 (brief 017 scope 2 part 2): exact active-term `fit`; 16-review Set B scorecard

**Date:** 2026-11-04 · **Tester:** Sonnet 5.5 · **Code under test:** `lib/screening-ranker.ts` `fit` / `rankRecords` (HEAD 151a403) vs. the pre-change file at `1f0b349`. No app code touched.

## 1. Scope and truth
- **Truth:** Chan, He, Leung, Verspoor 2025 "Set B" Cochrane human include/exclude labels (doi:10.17632/7sgmg89zb6.1, CC BY 4.0), from the cache `~/.cache/blindspot/chan2025/x` (not committed). Same data and provenance as validation 016.
- **Limit on independence:** the claim under test, "the change is mathematically exact", is a code-equivalence claim, so the reference is the old code. External truth enters through the real Set B texts and labels, and through the metric recomputation on the human labels. The scorecard's ranking quality is not independently validated here. I reuse the dev's `activeLearningRun`, as in 016.
- **Harness:** `017-harness.test.ts` (extracts the old ranker with `git show 1f0b349:…` into a temp file, deletes it afterwards). Results in `017-results.json`. No new fixtures; the data lives in the cache.

## 2. Results
### A. Exactness of the active-term `fit`: PASS
Old vs. new `rankRecords` on real Set B records (CD011218 n=690, CD013042 n=1,005, CD015306 n=1,671, CD013295 n=3,137). Training sets were random labelled samples of 5, 20, 100 and 400 rows (plus one forced include and one forced exclude), 2 seeds each: **32 cases**.
- Id-order mismatches: **0** over all records in all 32 cases.
- Max |score difference|: **0** (bit-identical).
This supports the handoff's "identical ranking" claim for these inputs. It is 32 cases on 4 reviews, not a proof. The argument that inactive weights stay 0 is sound by inspection: zero gradient, zero init, L2 term is `l2·0`. The "no SYNERGY regression" claim follows from exactness, but I did not run SYNERGY.

### B. Scorecard reproduction (condition B, seed 1, current code): PASS (3/3)
| review | n | incl | my WSS@95 | scorecard WSS@95 | hgStop mine | hgStop scorecard |
|---|---|---|---|---|---|---|
| CD011218 | 690 | 14 | 0.60507 | 0.60507 | none | none |
| CD015306 | 1,671 | 6 | 0.91110 | 0.91110 | none | none |
| CD013197 | 2,464 | 43 | 0.85950 | 0.85950 | 68.3% screened | 68.3%, trueRecall 1 |

The WSS values agree to < 1e-9. The CD013197 stop point agrees, and true recall at the stop (1.0), recomputed from the returned order against the human labels, agrees. That is 3 of 16 reviews. The other 13 were not rerun.

### C. Latency (AC3): improved modestly; the 300 ms target is confirmed met only for a single call, not for the run average
Warm single-call `rankRecords`, median of 5, same inputs, old vs. new (my machine, other load unknown):
| review | n | train rows | before | after |
|---|---|---|---|---|
| CD013295 | 3,137 | 100 | 68 ms | 47 ms |
| CD013295 | 3,137 | 400 | 125 ms | 112 ms |
| CD013358 | 3,542 | 100 | 50 ms | 39 ms |
| CD013358 | 3,542 | 400 | 144 ms | 101 ms |

The speed-up is about 10–30%. Per-call time is dominated by the number of training rows and by scoring, not the O(dim) loop. Reproduction-run means from `activeLearningRun`: 106 ms (n=690), 210 ms (n=1,671), 406 ms (n=2,464, max 874 ms). The committed scorecard has 600 ms for CD013197, 295 ms for CD013295 (n=3,137) and 229–357 ms for CD015042, CD012268 and CD013358, so the mean at n≈3,000 is about 230–360 ms and the per-call mean is NOT reliably ≤ 300 ms. The scorecard value predates this change per the operator note, and per-call time is noisy. **AC3 per-call: not met in the run average, inconclusive.** A full n=3,000 run in ≤ 3 minutes: CD013197 (n=2,464) took 24 s here, so likely met, but I did not time n=3,000 end to end. n=49k: not measured. The scorecard's CD013059 mean of 26.6 s per call is the machine-sleep artefact the operator mentions. It distorts the mean in the committed file (that is the `latencyMs.meanPerCall`), so any latency summary taken from the scorecard is wrong for that row.

### D. Scorecard summary (read from the committed file, not rerun beyond §B)
- B WSS@95 over 16 reviews: mean 0.779, median 0.829, worst 0.471 (CD013042). A (random): mean 0.012. Recall@10% B: median 0.89, worst 0.059, so the ranking is weak early on some reviews.
- hgStop fired in 7 of 16 reviews (CD013042, CD013197, CD013295, CD013358, CD013421, CD013590, CD015432), at 67.8–89.9% screened, true recall 1.0 in all 7. It did not fire in 9 of 16, which are mostly the reviews with < 20 includes. So AC1's "stops in ≥ 7 of 8 smallest" is not met by the full list (7/16 = 44%), but is unevaluated for the addendum's <20-includes split. Validity: 7/7 stops met the target. With n = 7 stops this does not support a ≥ 95% validity claim (exact 95% lower bound on a 7/7 proportion is about 0.65).
- `stopRule.neverStopped: 15` in the scorecard summary refers to the old Poisson rule. The `summary.claimed: true` flag is the dev's.
- Late stops (68–90% screened) save little work. The AC2 bar (stop ≤ 70% screened in ≥ 7 of 9) is not tested here, since it needs SYNERGY.

## 3. Pass/fail vs. brief 017
| Item | Verdict |
|---|---|
| Handoff 137: `fit` change is exact (identical ranking) | **PASS** (32/32 bit-identical, 4 real reviews) |
| Scorecard rows reproducible (3 rerun) | **PASS** |
| AC3 latency ≤ 300 ms/call after warm-up at n=3,000 | **NOT CONFIRMED**: single calls 40–110 ms; run means 230–400 ms; n=49k unmeasured |
| AC1 on Set B (hgStop fires ≥ 7/8, recall ≥ 0.95) | Validity 7/7 stops; fires 7/16 overall; small-review split not computed |
| AC2 SYNERGY, AC4 WSS ≥ 0.49 on SYNERGY | **NOT TESTED** (no SYNERGY data in cache) |

## 4. Wiki claims
- *`fit` active-term update is exact / ranking unchanged*: `claimed` → **verified** (validation 017, §A).
- *Set B scorecard (B WSS@95 mean 0.78 on 16 reviews, ≤ 6,000 records)*: three rows `claimed` → **verified by rerun**; the other 13 stay `claimed`.
- *hgStop stops were safe*: 7/7 stops reached recall 1.0 on Set B, but too few for a validity claim. Keep `claimed`.
- *Latency at n≈3,000 ≤ 300 ms*: still **unconfirmed**; the ML Layer page should not say it is met. Do not use `latencyMs.meanPerCall` for CD013059 (sleep artefact).

## 5. Follow-ups
- Dev: record per-call ms distributions (median, p95) rather than mean, so sleeps and outliers do not mislead. Profile `rankRecords` at 400+ training rows: `fit` is O(epochs × train nnz) and scoring is O(n·nnz) regardless.
- Tester next: SYNERGY AC2/AC4 once the SYNERGY data is cached; an n=49k timing.
- Files: `017-harness.test.ts`, `017-results.json`. Lint: 0 errors, 3 pre-existing warnings (none from my files).
