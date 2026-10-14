# Handoff 121 — Data extraction: PDF upload to `/api/extract` (Brief 009, "Next slice — extraction from a user-uploaded PDF", part 1)

**Date:** 2026-10-14
**Brief:** `spec/briefs/009.md` § "Next slice (operator session, 2026-10-13)"; motivated by validation 011 (only 30% of the truth set has OA XML). Dev run, Sonnet 5.5.

## Changes
- **EDIT `app/api/extract/route.ts`** — accepts `multipart/form-data` with `file` (PDF) and `targets` (JSON string), alongside the existing JSON body. Same session auth (checked first, so anonymous uploads get 401), reuses `MAX_PDF_BYTES` (25 MB → 413) and a `%PDF` magic check (→ 400). Bytes go through the existing `pdfToPages` and then the unchanged 4-check gate. Image-only/unreadable PDFs return 422 `{status:"manual", reason:"no_text_layer"|"unreadable_pdf"}`, same shape as the identifier path. The "need pages/text/doi/pmid" refine moved from the zod schema into the handler so an upload alone is valid.
- **EDIT `app/api/extract/route.test.ts`** — 5 new tests (upload success + disclosure, non-PDF → 400, scanned → 422 `no_text_layer`, empty targets → 400, unauthenticated upload → 401). `pdfToPages` is mocked there; its own behavior stays covered by `lib/extraction-pdf.test.ts`.

## Behavior / claims
`POST /api/extract` (multipart) extracts from a user-supplied PDF text layer; no OCR, no DB write. Unit-tested with stubs only; **not exercised against a real PDF or live Gemini**. No new `verified` values; AC5 stays `claimed`.

## Gate results
- `npm run lint`: **4 errors in `spec/validation/011-harness.test.ts`** (`no-explicit-any`, tester-owned file; not touched by this run) + 3 pre-existing warnings. 0 errors in files touched here. The tester/dev should fix the harness typing.
- `npm test`: 993 pass / 12 fail (1006) — the 12 are the documented pre-existing baseline; +5 new passing tests.
- `npm run build`: succeeded.

## Deferred
- Back-matter unit dropping (Acknowledgements, Footnotes, COI) in `jatsToPages`.
- Live AC5 run (7 OA papers via XML + Pattanaseri PDF fixture) — tester task.
- Upload UI; reuse of full-text bucket upload handling (none shared this run — route validates directly).
- Real Pattanaseri XML fixture; `locator` surfaced in `ExtractedValue`; continuation turns.

## Possibly stale wiki pages
[[Data Extraction]] (new multipart input), [[Roadmap & Status]] (PDF upload now shipped for `/api/extract`), [[Full-Text Retrieval]].
