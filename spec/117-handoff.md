# Handoff 117 — Data extraction: ASCII-hyphen range separator in source-presence gate (Brief 009)

**Date:** 2026-10-13
**Brief:** `spec/briefs/009.md` (real-PDF smoke test, case (b)); closes the limitation documented in validation 010 §4.3 / handoff 110. Dev run.

## Changes
- **EDIT `lib/extraction-source.ts`** — `numericTokens` regex: a `-` directly after a digit is a range separator, not a sign (`(?:(?<!\d)-)?`). "6.70-18.09" now yields 6.70 and 18.09 (previously 6.70 and −18.09, so a real CI bound was falsely `not_in_source`). Hyphen after whitespace/punctuation is still a negative sign.
- **EDIT `lib/extraction-source.test.ts`** — 2 tests: range separator recognised; negative sign preserved and −18.09 not fabricated from "6.70-18.09".
- **EDIT `spec/validation/010-harness.test.ts`** — the E2 case asserted the old limitation (4 NOT found in "2-4"); flipped to assert the fix. Tester-authored file edited minimally because the behavior it pinned was intentionally changed; tester should re-review.

## Behavior / claims
Removes a false `not_in_source` on real values in ASCII-hyphen CIs/ranges. Tradeoff: "−4" written tight after a digit (e.g. "3-4" meaning 3 and −4) is read as a range; accepted, as it errs toward finding the number, and the page-level gate cannot fabricate a value absent from the text. Nothing new is `verified`; AC5 stays `claimed`.

## Gate results
- `npm run lint`: 0 errors / 3 pre-existing warnings.
- `npm test`: 972 pass / 12 fail (984) — documented pre-existing baseline; 0 new failures.
- `npm run build`: succeeded.

## Deferred
Brief 009 slice 2c-ii part 2b-ii (fetch OA PDF bytes + `doi`/`pmid` input on `/api/extract`, real-PDF fixture test), rate limiting, tester AC5 run.

## Possibly stale wiki pages
[[Data Extraction]] (hyphen limitation no longer applies), validation 010 limitation note.
