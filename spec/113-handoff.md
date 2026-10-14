# Handoff 113 — Data extraction: `/api/extract` route (Brief 009, slice 2c-ii, part 1)

**Date:** 2026-10-13
**Brief:** `spec/briefs/009.md` — continues handoff 112. Dev run, Sonnet 5.5.

## Changes
- **CREATE `app/api/extract/route.ts`** — `POST { pages: [{page, text}], targets: [{id, label, instrument?, range?}] }`
  → runs `extractOutcomesAsync` with the live Gemini transcriber + hunter passes; returns
  `{ result, method, disclosure, extracted_at }`. Zod-validated (≤200 pages, ≤50 targets), stateless,
  no DB write, `maxDuration = 300`. Response carries the AI-assisted / not-dual-independent disclosure.
- **CREATE `app/api/extract/route.test.ts`** — 3 tests (bad JSON → 400, empty pages → 400,
  passes-find-nothing → 200 with `manual` + disclosure). Model passes mocked.

## Behavior / claims
The brief's `{doi?/pmid?}` input is not yet supported: the route takes page text directly because no
PDF → per-page text-layer step exists (`resolveFulltext` returns a URL only). Nothing new is `verified`;
AC5 stays **`claimed`** (live caller never run on real papers).

## Gate results
- `npx vitest run app/api/extract`: 3/3 pass.
- `npm test`: 961 pass / 12 fail — the documented pre-existing baseline; 0 new failures.
- `npx eslint app/api/extract`: clean; `tsc`: no errors in touched files.
- `npm run build`: compiled successfully; `/api/extract` listed.
- `npm run lint` (whole repo): still fails on pre-existing unrelated files (see handoff 112); none in touched files.

## Deferred — slice 2c-ii part 2
- PDF → per-page text-layer step and `doi/pmid` input; auth/rate-limiting on this route (it spends Gemini quota).
- Continuation for truncated output; result cache; tester AC5 run on ≥3 ketamine/TRD trials.

## Possibly stale wiki pages
[[Data Extraction]] (API route exists), [[Roadmap & Status]] (brief 009 slice 2c-ii part 1), [[Architecture/Routes]] if present.
