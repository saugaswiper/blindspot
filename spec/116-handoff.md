# Handoff 116 — Data extraction: PDF → text-layer pages helper (Brief 009, slice 2c-ii part 2b-i)

**Date:** 2026-10-13
**Brief:** `spec/briefs/009.md` § "Decision — PDF text-layer library" — continues handoff 115. Dev run, Sonnet 5.5.

## Changes
- **EDIT `package.json` / `package-lock.json`** — add `unpdf@1.8.1` (exact pin, per the brief's decision).
- **CREATE `lib/extraction-pdf.ts`** — `pdfToPages(bytes)`: per-page text via `extractText(..., { mergePages: false })`; returns `{ok:true, pages}` (1-based, blank pages dropped but numbering kept) or `{ok:false, reason: "no_text_layer" | "unreadable_pdf"}`. No OCR.
- **CREATE `lib/extraction-pdf.test.ts`** — 3 tests (unpdf mocked): numbering, image-only → `no_text_layer`, parse error → `unreadable_pdf`.

## Behavior / claims
Library helper only; **not yet wired** into `/api/extract`. Tests mock `unpdf`, so behavior on real PDFs is unexercised. Nothing new is `verified`; AC5 stays **`claimed`**.

## Gate results
- `npm run lint`: 0 errors / 3 pre-existing warnings.
- `npm test`: 970 pass / 12 fail (982) — documented pre-existing baseline; 0 new failures.
- `npm run build`: succeeded.

## Deferred (brief 009 slice 2c-ii part 2b-ii+)
- Fetch PDF bytes from the `resolveFulltext` URL (OA only) and add `doi`/`pmid` input to `/api/extract`; map `no_text_layer` to a `manual` response.
- A real-PDF fixture test of `pdfToPages`.
- Rate-limiting, truncation continuation, result cache; tester AC5 run on ≥3 ketamine/TRD trials.

## Possibly stale wiki pages
[[Data Extraction]] (PDF helper + unpdf dependency), [[Roadmap & Status]] (brief 009 slice 2c-ii part 2b-i), [[Architecture]]/stack page listing dependencies.
