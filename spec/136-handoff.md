# Handoff 136 — Brief 017: measurement run (AC1, AC3, AC4) on Set B; no code change

## Addresses
`spec/briefs/017.md` ACs 1, 3, 4, which no earlier handoff measured. This run changed **no source files**. It ran `scripts/benchmark-setb.ts --seeds 1 --max-n 3500` (12 of 22 Set B reviews; the ten larger ones were skipped), after the ranker speed-up in handoff 135. The scorecard went to the scratchpad, not to `spec/benchmarks/`. All numbers are `claimed` until the tester reruns.

## Results (condition B, seed 1, hypergeometric stop `hgStop`)
| review | n | includes | B WSS@95 | hgStop | mean / max ms per `rankRecords` |
|---|---|---|---|---|---|
| CD011218 | 690 | 14 | 0.605 | none | 120 / 271 |
| CD013042 | 1,005 | 27 | 0.471 | 89.9%, recall 1.0 | 158 / 381 |
| CD013590 | 1,852 | 28 | 0.841 | 80.5%, recall 1.0 | 233 / 476 |
| CD015306 | 1,671 | 6 | 0.911 | none | 235 / 1,687 |
| CD015432 | 2,036 | 43 | 0.769 | 78.6%, recall 1.0 | 272 / 868 |
| CD015067 | 2,068 | 12 | 0.822 | none | 284 / 1,156 |
| CD015038 | 2,196 | 14 | 0.837 | none | 271 / 659 |
| CD013199 | 2,238 | 16 | 0.895 | none | 283 / 584 |
| CD013421 | 2,400 | 23 | 0.911 | 80.1%, recall 1.0 | 415 / 950 |
| CD013197 | 2,464 | 43 | 0.859 | 68.3%, recall 1.0 | 435 / 823 |
| CD015042 | 3,057 | 9 | 0.898 | none | 338 / 1,248 |
| CD013295 | 3,137 | 115 | 0.613 | 77.8%, recall 1.0 | 447 / 1,216 |

Mean B WSS@95 across the 12 is 0.786 (A, random: 0.021).

## Reading against the ACs
- **AC1, validity:** all 6 stops that fired have true recall 1.0, so there are no misses. 6 of 6 reviews with at least 20 includes stopped (median 79.3% screened, range 68–90%). The 6 reviews with fewer than 20 includes (6–16) never stopped, which is the limit the brief's addendum predicts. They are reported separately and don't count against the 7-of-8 bar. The 10 skipped larger reviews were not run, so the "all 22" variant is open.
- **AC3, latency:** NOT met. Mean per `rankRecords` call at n ≈ 3,000 is 340–450 ms against a target of 300 ms, with maxima around 1.2 s. These are whole-run means including growing training sets, not post-warm-up per-call figures. No n = 3,000 or n = 49k run was timed end to end. The n = 49k figure is neither measured nor projected. Warm start (still undone) is the lever.
- **AC4, ranking:** B WSS@95 on Set B is high, but this is not the SYNERGY protocol. The SYNERGY mean WSS@95 ≥ 0.49 check was not rerun this run. Since handoff 135 changed no math and no warm start or class balance has been added, no regression is expected. That is not measured.
- **AC2 (SYNERGY validity):** not run. The SYNERGY data is not in the dev cache.

## Not done (deferred)
- Warm start and class balance in `fit` (risk: AC4 regression, so it needs a SYNERGY check).
- Set B run of the 10 reviews with n > 3,500, including n = 49k.
- AC2 on SYNERGY; knee method (optional); committed scorecard under `spec/benchmarks/`.

## Gates
- `npm run lint`: 0 errors, 3 pre-existing warnings.
- `npm test`: 1063 pass, 12 fail (the known baseline), 18 skipped.
- `npm run build`: succeeds.

## Stale wiki pages
Roadmap & Status and ML Layer: brief 017 hgStop fires on 6/6 Set B reviews with at least 20 includes (`claimed`), and latency is still above target at n ≈ 3,000 (340–450 ms/call).
