# Handoff 130 — Brief 015 slice 1: Set B fetch + loader + held-out manifest

## Addresses
`spec/briefs/015.md` (realistic screening benchmark, Cochrane Set B). Brief 013 is on `main` (handoff 129), so the dependency holds. Only brief scope items 1–3 shipped. Nothing is measured; no AC is verified.

## Changes
- `scripts/fetch-chan2025-setb.ts`: downloads the Mendeley zip to `~/.cache/blindspot/chan2025/` (outside git), verifies sha256 `649d8933…e48d3`, extracts to `x/`. Idempotent. `--from <local zip>` fallback. No bot-check bypass. Run: `npx tsx scripts/fetch-chan2025-setb.ts`.
- `lib/screening-benchmark-setb.ts`: `parseCsv` (index-sliced RFC 4180), `splitTagged`, `parseSetBReview` → `{ reviewId, protocol:{title,objectives,criteria}, records:[{id,title,abstract|null,label}] }`, `reviewIdFromFile`. Throws on a missing column.
- `lib/screening-benchmark-setb.test.ts`: 10 tests; unit tests use a synthetic fixture. Two cache-dependent tests (skipped without the cache): all 22 review IDs match the manifest and each has includes and criteria; no committed file under `models/` or `spec/benchmarks/` contains a record title or abstract prefix (brief AC7 hygiene test).
- `models/heldout/chan2025-setb.json`: 22 CD IDs, dataset DOI, sha256, licence, citation. Phase 2 must not train on these, including other versions of the same CD number.

## Dataset layout found (brief asked to document)
The zip was downloaded here and the sha256 matched the brief (106,458,488 bytes). It holds 22 files, `CDnnnnnn_data_cleaned.csv`, one per review.
- Columns: unnamed row index, `Publication Year`, `Author`, `Review_data`, `Title_Abstract`, `included`.
- `Review_data` is the review's protocol text, repeated on every row, tagged `[RTI] title [BG] background [OBJ] objectives [SEL] selection criteria`. All 22 carry all four tags, so the protocol cold start (condition C) has real input.
- `Title_Abstract` is `[TIT] … [ABS] …`. An empty abstract leaves `[ABS]` blank (loader maps to `null`).
- **Labels are include/exclude only** (`included` True/False). There is **no "excluded at full text" level**.
- Size and imbalance (records / includes): 690/14 (CD011218) up to 49,162/133 (CD014715). Median review about 3,100 records; includes 6–133, so prevalence is roughly 0.2–3.7%.
- Records without abstract: CD011218 16/690, CD013377 390/5,955, CD014715 912/49,162 (others not counted yet).
- No DTA flag column exists in the data. The DTA slice will need an external list or a heuristic on `[RTI]`/`[SEL]`; not done.

## Perf note
The first parser (per-char string concatenation) ran out of memory on the 49k-row review. The index-slicing rewrite parses it in about 0.6 s.

## Deferred (brief 015 scope items 4–6, AC1–AC8)
`scripts/benchmark-setb.ts` (conditions A–E), `spec/benchmarks/015-setb-scorecard.{json,md}`, stopping-rule runs, robustness slices, the Gemini capped sample, the Chan 2025 comparison row, latency recording. The `.gitignore` edit was not needed (cache is under `~/.cache`). The `spec/benchmarks/` directory does not exist yet. Next run: the harness for conditions A and B plus the metrics (brief 015 item 4).

## Gates
- `npm run lint`: 0 errors (3 pre-existing warnings).
- `npm test`: 1040 pass, 12 fail (the same 12 pre-existing failures), 18 skipped.
- `npx tsc --noEmit`: clean. `npm run build`: succeeds.

## Stale wiki pages
Roadmap & Status and Screening Model Plan (brief 015 slice 1 shipped; dataset layout above); ML Layer (held-out manifest exists at `models/heldout/chan2025-setb.json`).
