# Handoff 128 — Screening-feed purity (Brief 012, AC6 code slice)

## Addresses
`spec/briefs/012.md` (Priority NEXT, build order ②); validation 007 F6/F7. No open validation FAIL outranked it.

## Changes
- `lib/pubmed.ts`: new exported `SCREENING_FEED_EXCLUSIONS` and `screeningFeedTerm(query)`;
  `fetchPrimaryStudiesForScreening` now searches
  `(query) NOT systematic[sb] NOT "meta-analysis"[pt] NOT "network meta-analysis"[pt] NOT review[pt]`
  (binary NOT only, per validation 006 F4).
- `lib/pubmed.test.ts` (new): 3 unit tests (wrapping, no `AND NOT`, all four exclusions present).

## Files touched
`lib/pubmed.ts`, `lib/pubmed.test.ts`, `spec/128-handoff.md`.

## Behavior
Only the screening feed changes. `fetchPrimaryStudyIds`, `countPrimaryStudies`, `countPrimaryStudiesRecent` are untouched,
so the verified Mitchell 2012 recall (4/5) path is unchanged (AC4 by construction; no live run done).

## Claims (all `claimed`, none verified)
- AC1–AC3 (0 NMA/MA in top-100, ≤2/20 narrative reviews, ≥5/20 RCTs) and AC5 (partition check) were NOT measured live
  this run — need a tester validation harness against PubMed. Deferred.
- Known trade-off: `review[pt]` can drop a rare mis-tagged primary study; the 20-record dropped-set sample was not taken. Deferred to tester.

## Gates
- `npm run lint`: 0 errors (3 pre-existing warnings).
- `npm test`: 1023 pass, 12 fail — the same 12 pre-existing failures (baseline re-checked: 12 fail without the change).
- `npm run build`: succeeds.

## Stale wiki pages
Roadmap & Status (build order ② now implemented, awaiting validation); the Data Sources / Literature Search page describing
`fetchPrimaryStudiesForScreening` term; Briefs/012 mirror (status).
