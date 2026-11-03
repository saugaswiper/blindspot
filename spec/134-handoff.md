# Handoff 134 — Brief 017 slice 2: min-p over k + untestable reason

## Addresses
`spec/briefs/017.md` operator addendum (k selection, honest reporting of the few-includes limit). Scope (2), ranker latency / class balance, is still **deferred**. All ACs stay `claimed`.

## Changes
- `lib/screening-ranker.ts` `stoppingTest`: now evaluates every k = 1…s-1 (prefix sums, one pass) and uses the smallest p; `kUsed` is the k that gave it. `recallLowerBound` is computed for that best k. The `kFrac` option is removed (`minScreenedFrac` stays, default 0.2).
- New result field `reason`: `null` when it stops; `untestable-few-includes` when fewer than ~19 includes are found (M0 = 1); otherwise `insufficient-sample`.
- Tests (`lib/screening-ranker.test.ts`): few-includes now asserts the reason; new test for `reason === null` on stop, `kUsed > 0`, and `insufficient-sample`.
- `lib/screening-benchmark-sim.ts` is unchanged; it calls `stoppingTest` with defaults, so it picks up the new behaviour.

## Caveats for the tester
- **Paper not accessed.** I did not fetch the CMH 2020 text or the `buscar` code, so I could not confirm whether the paper corrects for scanning k. The min-p is **unadjusted**. This is anti-conservative in principle, so AC2 validity (true recall at stop ≥ 0.95 in ≥ 95% of runs) is the check that matters. If it fails, add a correction (e.g. Bonferroni over a k grid) in the next slice.
- The `untestable-few-includes` threshold is derived from the found-include count, not the true total, as the operator specified.

## Not done
Scope (2) (memoised/warm-start ranker, class balance, AC3/AC4), the `hgStop` column in `scripts/benchmark-setb.ts`, the knee method, and AC1–AC2 measurement. Reviews under 20 includes should be reported separately by the tester (addendum).

## Gates
- `npm run lint`: 0 errors (3 pre-existing warnings).
- `npm test`: 1060 pass, 13 fail, 18 skipped. None of the failures are in screening files (boolean-search-builder, cache-freshness, cache-topic-search, keyboard-shortcuts, protocol-storage, study-design, use-persistent-*): the known baseline set (previously 12 failed; the count differs by one, cause not investigated).
- `npx tsc --noEmit` clean; `npm run build` succeeds.

## Stale wiki pages
Roadmap & Status; Screening Recall Estimate Fix (`stoppingTest` now min-p over k, new `reason` field; `kFrac` removed); ML Layer.
