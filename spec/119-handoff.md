# Handoff 119 — Data extraction: JATS XML → page units (Brief 009, "prefer Europe PMC full-text XML", slice 1 of 2)

**Date:** 2026-10-13
**Brief:** `spec/briefs/009.md` § "Decision — prefer Europe PMC full-text XML over publisher PDFs" (follows handoff 118). Dev run, Sonnet 5.5.

## Changes
- **CREATE `lib/extraction-xml.ts`** — `jatsToPages(xml): TextPage[]`. Pure, no network, no new dependency (tag-stripping tokenizer). Each top-level `<body>` `<sec>` (nested secs folded in) and each `<table-wrap>` becomes its own numbered unit in document order, carrying a human `locator` (section title, or the table `<label>`, e.g. "Table 2"). Table rows are one per line, cells joined by ` | `, so numbers stay adjacent to their labels. Entities decoded (incl. numeric `&#x2013;`). No `<body>` → `[]`.
- **EDIT `lib/extraction-pages.ts`** — `TextPage` gains optional `locator?: string` (absent for PDF pages; backward compatible).
- **CREATE `lib/extraction-xml.test.ts`** — 5 tests on a trimmed Pattanaseri 2024 Day-10 MADRS fixture: unit order/locators, row/cell order, entity decoding, source-presence finds 12.55 and 17.22 in the table unit, SE 2.64 vs CI 6.70–18.09 fails consistency (→ `check`).

## Behavior / claims
Library only: nothing calls `jatsToPages` yet. No new `verified` values. The fixture is hand-trimmed from the brief's recorded values, **not** the real 101 KB Europe PMC XML — real-document behavior is unexercised. AC5 stays `claimed`.

## Gate results
- `npm run lint`: 0 errors / 3 pre-existing warnings.
- `npm test`: 985 pass / 12 fail (997) — documented pre-existing baseline; 0 new failures.
- `npm run build`: succeeded.

## Deferred (next slice)
`fetchPagesForIdentifier` wiring: PMCID resolution (Europe PMC search by DOI/PMID) → `/rest/{PMCID}/fullTextXML` → `jatsToPages`, PDF second, else `manual`; new `publisher_challenge` reason when HTML is returned for a PDF URL; real-XML fixture; surfacing `locator` in `ExtractedValue` provenance; tester AC5 run.

## Possibly stale wiki pages
[[Data Extraction]] (new XML page source, library-only), [[Roadmap & Status]] (HTML/XML full-text source now partially shipped), [[Full-Text Retrieval]].
