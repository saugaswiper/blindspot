# Handoff 114 — Lint gate restored: ignore nested `.claude/**` worktrees

**Date:** 2026-10-13
**Brief:** none directly — repairs the `npm run lint` hard gate that handoffs 112–113 reported as failing. Unblocks the remaining brief 009 slices (2c-ii part 2). Dev run, Sonnet 5.5.

## Changes
- **EDIT `eslint.config.mjs`** — added `".claude/**"` to `globalIgnores`. ESLint was descending into `.claude/worktrees/*`, which are full copies of the repo, producing 13,428 problems (1,082 errors) that were not in the real tree. Real source is unaffected by the ignore.

## Behavior
No runtime change. `npm run lint` now reports **0 errors, 3 warnings** (HeroSourceLogos `<img>`, `spec/validation/006-harness.mjs` unused var, `007-harness.mjs` unused var — all pre-existing).

## Gate results
- `npm run lint`: 0 errors / 3 warnings (was 1,082 errors).
- `npm test`: 962 pass / 12 fail (974) — the documented pre-existing baseline of 12 failures; 0 new failures. (+1 pass vs handoff 113 is the test added alongside the `/api/extract` auth commit 54bca98.)
- `npm run build`: succeeds.

## Notes
- Commit 54bca98 (require signed-in user on `/api/extract`) landed without its own handoff; it resolves the auth item deferred in handoff 113. Rate-limiting remains undone.
- No methodology claims changed; AC5 for brief 009 stays `claimed`.

## Deferred (unchanged)
- Brief 009 slice 2c-ii part 2: PDF → per-page text-layer step, `doi/pmid` input, truncation continuation, result cache; tester AC5 run on ≥3 ketamine/TRD trials.
- The 12 pre-existing failing tests.

## Possibly stale wiki pages
[[Roadmap & Status]] (lint gate no longer failing; `/api/extract` now auth-gated), [[Data Extraction]] (auth requirement).
