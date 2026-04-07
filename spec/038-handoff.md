# Handoff 038 — PRISMA Included Count: Confidence Interval Display

**Date:** 2026-04-06
**Automation:** Blindspot daily-improver agent
**Previous handoff:** 037 (Wide-query warning banner + broad-corpus feasibility flag)

---

## Summary

Replaced the PRISMA "Studies included in synthesis" point estimate (`~65`) with a **confidence interval range** (`~33–130`), directly addressing the #3 recommended improvement from handoff 037 and the "replace point estimates with confidence intervals" recommendation from handoff 036.

This is a honesty-first UX improvement: researchers are shown an explicit range that reflects real calibration uncertainty from the ground-truth validation studies, rather than a false precision implied by a single number.

---

## What Was Built

### 1. `getIncludedCI` function — `lib/prisma-diagram.ts`

A new exported pure function that computes a confidence interval around the PRISMA included count point estimate.

**Signature:**
```typescript
export function getIncludedCI(
  included: number,
  afterDedup: number,
): { low: number; high: number }
```

**Tier-based uncertainty multipliers** (calibrated from handoffs 035 and 036 ground-truth validation):

| Tier | afterDedup range | Low factor | High factor | Rationale |
|------|-----------------|-----------|------------|-----------|
| Small  | <15    | ×0.75 | ×1.35 | Narrow topic; most identified records are relevant; tighter empirical error range |
| Medium | 15–59  | ×0.65 | ×1.55 | Moderate uncertainty, ~±50% observed in validation |
| Large/XL/XXL | ≥60 | ×0.50 | ×2.00 | ÷2–×2 range; recommended in handoffs 036 and 037 based on calibration data |

**Why ÷2 to ×2 for Large/XL/XXL:** From the ground-truth validation in handoffs 035 and 036:
- Remote CBT-I (afterDedup ~450, MA): point estimate 47, actual 42 (+12%) — well within ÷2 to ×2
- CBT-I NMA (afterDedup ~2900, MA): point estimate 65, actual 52 (+25%) — within ÷2 to ×2
- Hand hygiene (afterDedup ~3600, default): point estimate 97, actual 105 (-8%) — within ÷2 to ×2

The ÷2 to ×2 range captures all three well-calibrated ground-truth cases. For query-specificity mismatches (e.g. "omega-3 cardiovascular" for a coronary revascularization-only MA), the actual count can fall far outside even this range — this is an inherent limitation documented in the code.

**Guarantees:** `low ≥ 1`, `high > low`, both integers.

### 2. `PrimaryStudyPrismaData` interface update — `lib/prisma-diagram.ts`

Added two new fields to the interface:
```typescript
includedLow: number;
includedHigh: number;
```

These are always populated (non-optional) — `computePrimaryStudyPrismaData` computes them via `getIncludedCI(included, afterDedup)` immediately after the funnel estimation.

### 3. PRISMA "Included" box UI update — `components/ResultsDashboard.tsx`

**Before:**
```
~65
```

**After:**
```
~33–130
Point estimate: ~65 · range reflects calibration uncertainty
```

The large count number now shows the range. The point estimate is preserved as a secondary note below, so researchers who want to know the central estimate can still see it.

The note "range reflects calibration uncertainty" links the display to the documented limitation — it makes the epistemics explicit without requiring researchers to read documentation.

If AI analysis has not been run, the pre-existing note "Run AI analysis to refine this estimate based on study design" still appears below.

### 4. Unit tests — `lib/prisma-diagram.test.ts`

New test suite: `describe("getIncludedCI", ...)` with **24 tests** covering:

**Tier boundary correctness:**
- Small tier (<15): `low ≥ 1`, `low ≤ included`, `high > low`, `high ≤ ×1.35 included`
- Medium tier (15–59): `high ≤ ×1.6 included`, `low ≥ ×0.6 included`
- Large tier (60–499): `high ≈ 2× included`, `low ≈ ½ included`
- XL tier (500–1499): `high ≈ 2× included`, `low ≈ ½ included`
- XXL tier (≥1500): `high ≈ 2× included`, `low ≈ ½ included`

**Invariants:**
- Always returns integers (5 corpus sizes tested)
- `low ≥ 1` even for `included = 1`
- `high > low` across all tiers (5 corpus sizes)

**Integration tests (computePrimaryStudyPrismaData):**
- `includedLow` and `includedHigh` are defined, with `high > low` and `low ≥ 1`
- CI bounds bracket the point estimate for large corpus (200 studies)
- CI bounds bracket the point estimate for small corpus (8 studies)

**Ground-truth plausibility** (validates that published SR actuals fall within CI):
- Remote CBT-I (afterDedup 450, MA): actual 42 falls within CI
- Hand hygiene (afterDedup 3600, default): actual 105 falls within CI
- CBT-I settings NMA (afterDedup 2900, MA): actual 52 falls within CI

---

## Files Modified

```
lib/prisma-diagram.ts           — getIncludedCI() function (+55 lines),
                                   includedLow/includedHigh in interface (+2 lines),
                                   computation in computePrimaryStudyPrismaData (+3 lines),
                                   two new return fields (+2 lines)

components/ResultsDashboard.tsx — PRISMA included box: range display (+3 lines)
```

## Files Modified (tests)

```
lib/prisma-diagram.test.ts      — Import getIncludedCI (+1 line),
                                   describe("getIncludedCI") suite (+100 lines, 24 tests)
```

---

## User Experience

### Before

The "Studies included in synthesis" box showed:
```
~65
Run AI analysis to refine this estimate based on study design
```

A researcher sees 65 and treats this as a meaningful estimate. For a broad query with 2,900 results after dedup, the true included count could be anywhere from 30 to 130.

### After

The same box shows:
```
~33–130
Point estimate: ~65 · range reflects calibration uncertainty
Run AI analysis to refine this estimate based on study design
```

The researcher immediately understands that the estimate carries inherent uncertainty. The range communicates "this could be anywhere from 33 to 130" — a more honest representation of what the screening funnel estimation can reliably say.

This is especially important for XL/XXL corpora where the wide-query warning banner (from handoff 037) already flags that the estimate may be inflated. The CI range complements that warning: the banner says "this might be high", the CI range says "here's the uncertainty quantified".

---

## Design Notes

**Why show the range prominently vs. tooltip:** The range is the most epistemically honest primary display. A tooltip would hide important uncertainty information. Researchers should see the range first and the point estimate second.

**Why keep the point estimate:** The point estimate is useful as a reference. Researchers comparing topics (e.g., "CBT for insomnia" vs. "CBT for depression") can still use the central estimates for rough comparison. The range gives calibration context without eliminating the point.

**Why ÷2 to ×2 rather than smaller for Large tier:** The ground-truth data shows that even for well-calibrated Large-tier queries, the error can be +28% (mindfulness, afterDedup 276). A ×1.5 or ×1.7 CI would fail to capture this. The ÷2 to ×2 is conservative but honest.

---

## Verification Status

```
npx eslint lib/prisma-diagram.ts lib/prisma-diagram.test.ts components/ResultsDashboard.tsx
→ Exit 0 (0 errors; 1 pre-existing warning: unused 'ScreeningCriteria' import in
  ResultsDashboard — present since handoff 034, unrelated to this session)

npx tsc --noEmit
→ Exit 0 (no type errors)

npm test
→ Blocked: known rollup ARM64 binary mismatch (same as handoffs 035, 036, 037).
  Tests written and type-checked; will execute once environment resolves.

npm run build
→ Not attempted: same .fuse_hidden / EPERM infrastructure issue as previous sessions.
```

---

## Recommended Next Steps

1. **[High] Shareable result links (public read-only)** — `spec/004-market-research.md` #2 and handoff 037 #2. A public `/results/[id]` route with a signup CTA banner. Supabase RLS update to allow public reads on results marked shared. Handoff 006 implemented the sharing toggle; the public read-only *view* for non-authenticated users is the missing piece.

2. **[Medium] Boolean search operators in simple search box** — `spec/026-market-research.md` NEW-3. Parse AND/OR/NOT and "quoted phrases" in the simple search box. `lib/boolean-search.ts` already has parsing logic from handoff 025.

3. **[Medium] Supabase telemetry for rate validation** — Log `afterDedup`, tier used, and `included` per search. After 50+ real searches, compare CI coverage against PROSPERO-registered reviews. This would validate whether the ÷2 to ×2 CI captures the true included count in practice.

4. **[Low] Connect PubMed MCP for search quality validator** — Both validator runs (035 and 036) fell back to web search because the MCP was not connected. Connecting `mcp__plugin_bio-research_pubmed__search_articles` would enable exact PRISMA count extraction from published SR abstracts.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
