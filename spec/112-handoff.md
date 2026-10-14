# Handoff 112 — Data extraction: async model passes (Brief 009, slice 2c-i)

**Date:** 2026-10-13
**Brief:** `spec/briefs/009.md` — continues handoff 111 (orchestrator). Dev run, Sonnet 5.5.

## Changes
- **CREATE `lib/extraction-passes.ts`** — model-backed passes for the gate: two framings
  (cell-by-cell transcriber, target-hunter), prompt builder, `scopePages` (excludes pages opening
  with a References/Bibliography heading; 60k-char cap), `parseReply` (truncated or malformed
  model output → `value: null` → `manual`, never a guessed number), `createModelPass`, and
  `callGeminiExtraction` (live Gemini 2.5 Flash, temp 0, `MAX_TOKENS` → truncated). Model call is
  injected (`ModelCaller`), so everything but the fetch is unit-tested. `EXTRACTION_PROMPT_VERSION`
  exported for a future cache key.
- **EDIT `lib/extraction.ts`** — `ExtractionPass` may return a Promise; added
  `extractOutcomesAsync` (same gate/dispositions). Sync `extractOutcomes` unchanged, throws if
  handed an async pass. Verification logic untouched.
- **CREATE `lib/extraction-passes.test.ts`** — 5 tests, incl. a fabricated model number via the
  async path → `check`/`not_in_source` (AC1), and an agreeing present value → `verified`.

## Behavior / claims
Nothing new is `verified`. AC5 (false-`verified` rate on ketamine/TRD trials) stays **`claimed`**:
the live caller has never been run against real papers.

## Gate results
- `npx vitest run lib/extraction`: 61/61 pass (5 new).
- `npm test`: 958 pass / 12 fail — the documented pre-existing baseline; 0 new failures.
- `npx eslint` on touched files: clean. `tsc` shows no errors in extraction files.
- `npm run build`: compiled successfully.
- `npm run lint` (whole repo): fails on pre-existing errors/warnings in unrelated files and `spec/validation/*.mjs` (1082 errors); none in touched files.

## Deferred — slice 2c-ii
- `POST /api/extract` route and PDF → per-page text-layer step (`resolveFulltext` returns a URL
  only, so no page text exists yet — this is the real blocker for end-to-end use).
- Continuation turns for truncated output; versioned result cache.
- Tester AC5 run on ≥3 ketamine/TRD trials.

## Possibly stale wiki pages
[[Data Extraction]] (async passes + Gemini caller exist), [[Roadmap & Status]] (brief 009 slice 2c-i).
