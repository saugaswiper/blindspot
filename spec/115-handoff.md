# Handoff 115 — Data extraction: text-layer page splitter + `text` input (Brief 009, slice 2c-ii part 2a)

**Date:** 2026-10-13
**Brief:** `spec/briefs/009.md` — continues handoffs 113–114. Dev run, Sonnet 5.5.

## Changes
- **CREATE `lib/extraction-pages.ts`** — `splitIntoPages(raw)`: splits a form-feed (`\f`, the `pdftotext` convention) text layer into 1-based `{page, text}`; blank pages are dropped but keep their source page number (so `page` provenance stays correct).
- **CREATE `lib/extraction-pages.test.ts`** — 3 tests.
- **EDIT `app/api/extract/route.ts`** — body now accepts `pages` **or** `text` (form-feed text layer); `pages` still capped at 200; blank input → 400.
- **EDIT `app/api/extract/route.test.ts`** — +2 tests (text input → 200; blank text → 400).

## Behavior / claims
Callers can now post a raw text layer instead of pre-split pages. No PDF parsing is performed: no PDF library is installed and adding a dependency was out of scope for one stage. Nothing new is `verified`; AC5 stays **`claimed`**.

## Gate results
- `npm run lint`: 0 errors / 3 pre-existing warnings.
- `npm test`: 967 pass / 12 fail (979) — the documented pre-existing baseline; 0 new failures.
- `npm run build`: compiled successfully; no tsc errors in touched files.

## Deferred (brief 009 slice 2c-ii part 2b+)
- Actual PDF → text-layer extraction (needs a PDF dependency decision) and `doi`/`pmid` input via `resolveFulltext`.
- Rate-limiting on `/api/extract`, truncation continuation, result cache; tester AC5 run on ≥3 ketamine/TRD trials.

## Possibly stale wiki pages
[[Data Extraction]] (new `text` input, page splitter), [[Roadmap & Status]] (brief 009 slice 2c-ii part 2a).
