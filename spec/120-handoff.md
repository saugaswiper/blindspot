# Handoff 120 — Data extraction: Europe PMC XML-first identifier fetch (Brief 009, "prefer Europe PMC full-text XML", slice 2 of 2)

**Date:** 2026-10-13
**Brief:** `spec/briefs/009.md` § "Decision — prefer Europe PMC full-text XML over publisher PDFs" (follows handoffs 118, 119). Dev run, Sonnet 5.5.

## Changes
- **EDIT `lib/extraction-fetch.ts`** — `fetchPagesForIdentifier` now tries Europe PMC first: search by DOI or PMID → PMCID (must match `^PMC\d+$`) → `/rest/{PMCID}/fullTextXML` → `jatsToPages` (handoff 119). Any failure/empty XML falls through to the existing OA-PDF path unchanged. XML results return `source = { source: "europepmc", oa_status: "green", content_type: "html" }`. New failure reason `publisher_challenge`: returned when the body fetched from a PDF URL is HTML (`<!doctype html` / `<html`) — the bot-check seen in handoff 118; no bypass attempted. Other non-PDF bodies remain `not_pdf`.
- **EDIT `lib/extraction-fetch.test.ts`** — Europe PMC calls stubbed to 404 by default (PDF path tests unchanged); replaced the old HTML→`not_pdf` test with `publisher_challenge`; added non-PDF/non-HTML → `not_pdf`, XML-preferred (resolver not called), and XML-404 → PDF fallback tests.
- `app/api/extract/route.ts` untouched: it already passes `fetched.reason` through in the 422 `manual` response, so `publisher_challenge` surfaces automatically.

## Behavior / claims
`POST /api/extract { doi | pmid }` now extracts from Europe PMC JATS XML when the study has an OA PMCID, otherwise from an OA PDF, else `manual`. Fetch logic is unit-tested only with stubs; **not exercised against live Europe PMC or the real 101 KB Pattanaseri XML**. No new `verified` values; AC5 stays `claimed`.

## Gate results
- `npm run lint`: 0 errors / 3 pre-existing warnings.
- `npm test`: 988 pass / 12 fail (1000) — documented pre-existing baseline; 0 new failures.
- `npm run build`: succeeded.

## Deferred
Real Pattanaseri XML fixture + live smoke test; surfacing `locator` in `ExtractedValue` provenance (types/UI); tester AC5 run on the ketamine/TRD truth set; continuation turns.

## Possibly stale wiki pages
[[Data Extraction]] (identifier input now XML-first), [[Full-Text Retrieval]], [[Roadmap & Status]] (doi/pmid input and HTML/XML source now shipped; `publisher_challenge` reason).
