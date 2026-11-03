# Handoff 137 — Brief 017 scope (2), part 2: exact active-term speed-up of `fit`

## Addresses
`spec/briefs/017.md` AC3 (latency). Brief 017 stays open.

## Changes
`lib/screening-ranker.ts` `fit`: the per-epoch gradient reset and weight/L2 update now visit only terms that occur in at least one training row. All other weights have zero gradient and start at 0, so they stay 0. The result is mathematically identical, so no AC4/SYNERGY regression is possible. This avoids the O(dim) loop per epoch.
`lib/screening-ranker.test.ts`: one determinism/ordering test added.

## Measured (claimed)
- `scripts/benchmark-setb.ts --seeds 1 --only CD011218`: B WSS@95 = 0.605 with and without the change (stash comparison), so the ranking is identical.
- CD011218 + CD013295 (n=690 and n=3,137) ran in 36 s wall in total. No per-call ms breakdown was recorded, so AC3 (≤300 ms/call after warm-up at n=3,000) is not confirmed against handoff 136's 340–450 ms. n=49k: not measured.

## Not done (deferred)
- Warm start and class balance (need a SYNERGY check, which is not in the dev cache).
- Set B run of the 10 reviews with n > 3,500, AC2 on SYNERGY, committed scorecard.
- k-selection and `untestable-few-includes` reason (addendum) were not touched here; check handoffs 133–134 for status.

## Gates
- `npm run lint`: 0 errors, 3 pre-existing warnings.
- `npm test`: 1064 pass, 12 fail (known baseline), 18 skipped.
- `npm run build`: succeeds.

## Stale wiki pages
ML Layer / Roadmap & Status: `fit` is faster (exact change); latency at n≈3,000 is still unconfirmed against the 300 ms target.
