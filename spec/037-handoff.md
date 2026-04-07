# Handoff 037 — Wide-Query Warning + Broad-Corpus Feasibility Flag

**Date:** 2026-04-06
**Automation:** Blindspot daily-improver agent
**Previous handoff:** 036 (XL/XXL corpus tier fix in `getScreeningRatios`)

---

## Summary

Two targeted follow-on improvements from handoff 036's "Recommended Next Steps" list:

1. **[High] PRISMA tab: wide-query warning banner** — When `afterDedup ≥ 1,500` (XL/XXL tier), an amber advisory banner is shown directly above the PRISMA flow diagram warning the researcher that their query is broad and the included-study estimate may be inflated.

2. **[Medium] Feasibility flag for very large corpora** — When `primaryStudyCount > 2,000`, a new advisory flag is appended to the feasibility flags array noting that the evidence base is very large, the SR effort will be resource-intensive, and the researcher should consider narrowing their PICO question.

Both changes are additive and non-breaking (no existing behaviour modified, only new UI/flag surfaced in specific edge-case conditions).

---

## What Was Built

### 1. PRISMA Wide-Query Warning Banner — `components/ResultsDashboard.tsx`

**Trigger:** `data.afterDedup >= 1500` (XL tier boundary from 036).

**Placement:** Between the PRISMA tab header section (`Proposed Primary Study Screening Flow` description) and the PRISMA flow diagram `<div>`. It appears only when the condition is met, otherwise renders nothing.

**Visual design:** Amber-tinted inline banner (matches the stale-cache warning style from 034) using `color-mix(in srgb, #f59e0b ...)` tokens for both background and border. Includes the `⚠️` emoji, bold label `Wide query detected`, the record count, and an actionable suggestion.

**Text:**
> ⚠️ **Wide query detected** — your search matched **N** records after deduplication. The estimated included-studies count assumes a focused review question and may be higher than your actual eligibility criteria will yield. Consider **narrowing your search query** for a more accurate estimate, or treat the included count as an upper bound.

**Context:** This directly addresses the known limitation documented in 036: the XL/XXL tier calibration corrects most over-estimates for moderately broad queries, but cannot bridge a topic-scope mismatch (e.g., "omega-3 cardiovascular" searched for a coronary-revascularization-only MA). The banner makes this limitation explicit to the researcher.

### 2. Feasibility Broad-Corpus Flag — `lib/feasibility.ts`

**Trigger:** `primaryStudyCount > 2,000`.

**How:** Added `primaryStudyCount` as a 4th parameter to the internal `buildFlags()` function (previously it only accepted `score`, `reviewStatus`, and `reviews`). The call-site in `scoreFeasibility()` was updated accordingly.

**Flag text:**
> Very large evidence base (N studies) — the query appears very broad. A full systematic review would be resource-intensive; consider narrowing your PICO question or planning a scoping review to map the field first.

**Score unchanged:** The feasibility score remains `"High"` for counts > 2,000 — this is correct. High primary study count is still good news for feasibility in principle. The flag is advisory context, not a downgrade. Researchers still benefit from knowing there are many studies; the flag warns them about the downstream workload.

**Rationale from 036:** "Consider adding a penalty for `primaryStudyCount > 2,000`." After reviewing the logic, a flag is preferable to a score penalty — the Cochrane-aligned scoring thresholds (High/Moderate/Low/Insufficient) are well-established and shouldn't be modified for scope warnings. A separate advisory flag preserves score integrity while surfacing the relevant caveat.

### 3. Unit Tests — `lib/feasibility.test.ts` (new file)

Created `lib/feasibility.test.ts` covering:
- `getFeasibilityScore`: boundary tests for all 4 score tiers (8 cases)
- `scoreFeasibility` standard cases: score correctness, primary_study_count echo (4 cases)
- Existing review status logic: novel / recent_exists / update_opportunity (4 cases)
- **New broad-query flag**: 6 targeted tests including:
  - Does NOT fire at exactly 2,000 (boundary exclusivity)
  - Fires at 2,001 and 5,000 (positive cases)
  - Flag text includes formatted count (e.g., "3,500")
  - Flag mentions PICO
  - Score remains High (no score penalty)
  - Flag coexists with `recent_exists` flag (multi-flag case)

---

## Files Modified

```
lib/feasibility.ts                    — Added primaryStudyCount param to buildFlags(),
                                        new >2000 broad-corpus advisory flag
components/ResultsDashboard.tsx       — Wide-query banner (afterDedup ≥ 1500) in
                                        PrimaryStudyPrismaFlow component
```

## Files Created

```
lib/feasibility.test.ts               — 22 unit tests for scoreFeasibility and
                                        getFeasibilityScore including new broad-query flag
```

---

## Verification Status

```
npx eslint lib/feasibility.ts lib/feasibility.test.ts components/ResultsDashboard.tsx
→ Exit 0 (0 errors; 1 pre-existing warning: unused 'ScreeningCriteria' import in ResultsDashboard)

npx tsc --noEmit
→ Exit 0 (no type errors)

npm test
→ Blocked: known rollup ARM64 binary mismatch (same as handoffs 035 and 036)
  Tests written and type-checked; will execute once environment resolves the binary issue.

npm run build
→ Blocked: .fuse_hidden files in .next/ directory (infrastructure EPERM issue in this session)
```

The pre-existing `ScreeningCriteria` warning in ResultsDashboard is unrelated to this session's changes — it was present before this session and is a no-op import (unused type, not a runtime issue).

---

## Recommended Next Steps

From market research and prior handoffs, ordered by effort/impact:

1. **[High] RIS/BibTeX citation export** — `spec/004-market-research.md` #3. Add "Export references (.ris)" button on the Existing Reviews tab. Low effort, immediate workflow value for Zotero/Mendeley users. No dependencies on this session's changes.

2. **[High] Shareable result links (public read-only)** — `spec/004-market-research.md` #2. A public `/results/[id]` route with a signup CTA banner. Update Supabase RLS to allow public reads on results marked shared. The stale-cache warning from 034 already gracefully handles direct `/results/[id]` access, so public sharing would compose well with it.

3. **[Medium] Add confidence interval display for included count** — Instead of "Estimated included: 65", show "~30–130" (÷2 to ×2 range for XL/XXL tier). The wide-query banner added in this session tells researchers the estimate may be inflated; showing a range rather than a point estimate would be more honest for large-corpus queries.

4. **[Medium] Supabase telemetry for rate validation** — Log `afterDedup`, tier used, `included` per search. After 50+ real searches, compare distributions against PROSPERO-registered reviews. Validates the XL/XXL rate calibration in production.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
