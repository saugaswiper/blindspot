# Handoff 118 — Data extraction: `doi`/`pmid` input on `/api/extract` (Brief 009, slice 2c-ii part 2b-ii)

**Date:** 2026-10-13
**Brief:** `spec/briefs/009.md` § "Decision — PDF text-layer library" — continues handoffs 116–117. Dev run, Sonnet 5.5.

## Changes
- **CREATE `lib/extraction-fetch.ts`** — `fetchPagesForIdentifier({doi?, pmid?})`: `resolveFulltext` (OA only, never paywalled) → https-only download (30 s timeout, 25 MB cap via `content-length` and actual size) → `%PDF` magic check → `pdfToPages`. Returns `{ok:true, pages, source}` or a typed `reason`: `no_open_access | not_pdf | download_failed | too_large | no_text_layer | unreadable_pdf`. Dependencies injectable for tests.
- **CREATE `lib/extraction-fetch.test.ts`** — 8 tests (resolver/fetch/parser stubbed).
- **EDIT `app/api/extract/route.ts`** — body now accepts `doi` or `pmid` as an alternative to `pages`/`text`. If pages/text are supplied they win (unchanged path). Identifier failures return **422** `{status:"manual", reason, error}` — never a guess.

## Behavior / claims
A caller can extract straight from an identifier when an open-access PDF with a text layer exists; otherwise the study is routed to manual. HTML-only OA, scanned PDFs (no OCR), and paywalled records → `manual`. Nothing new is `verified`; fetch behavior against real hosts is unexercised (all tests stub network); AC5 stays `claimed`.

## Gate results
- `npm run lint`: 0 errors / 3 pre-existing warnings.
- `npm test`: 980 pass / 12 fail (992) — documented pre-existing baseline; 0 new failures.
- `npm run build`: succeeded.

## Deferred
Real-PDF fixture test of `pdfToPages`; HTML/XML full-text (PMC/Europe PMC) page source; rate limiting; truncation continuation; result cache; redirect-target host allow-listing (currently any https URL returned by the OA chain, following redirects); tester AC5 run on ≥3 ketamine/TRD trials; review UI.

## Possibly stale wiki pages
[[Data Extraction]] (identifier input now supported; `/api/extract` contract adds `doi`/`pmid` and 422 manual), [[Roadmap & Status]] (PDF→text-layer + doi/pmid input no longer deferred), [[Full-Text Retrieval]] (consumed by extraction).
