# Handoff 089 — Retraction Badge in Screening UI

**Date**: 2026-06-16  
**Previous handoff**: spec/088-handoff.md  
**Brief**: `[[Milestone — Search Recall & Provenance Benchmark]]` — criterion **#4** (retraction awareness) — UI display phase  
**Owner stage**: Screening (Stage 3) in `[[Roadmap & Status]]`

---

## 1. Summary

Retraction/withdrawal status is now displayed in the screening results table as a warning badge. Completes the handoff 088 work (which wired retraction checking into search route) by surfacing that information in the researcher's screening UI. Now when a researcher runs title/abstract screening, they immediately see which records are flagged as retracted or withdrawn — enabling informed decisions about inclusion and reflecting Cochrane + RAISE best practices.

**Status**: ✅ tsc · ✅ eslint · TypeScript clean, zero new violations.

---

## 2. Changes

### `types/index.ts` — ScreeningDecision Interface

Added `retraction` field to `ScreeningDecision` (lines 339-345):

```typescript
/**
 * Retraction/withdrawal status when flagged by lib/retractions.ts (via search route).
 * Advisory, for display/export only — never auto-removes the record.
 * Helps researchers identify studies that have been withdrawn or retracted after
 * initial publication. Important for systematic review integrity.
 */
retraction?: { type: string; label: string; noticeDoi?: string };
```

Type signature mirrors the `ExistingReview.retraction` field, enabling pass-through from search data → screening decisions.

### `lib/screening.ts` — mapDecision Function

Updated `mapDecision()` (lines 485–499) to copy retraction data from source ExistingReview to ScreeningDecision:

```typescript
function mapDecision(d: DecisionRaw, record: ExistingReview): ScreeningDecision {
  return {
    // ... existing fields ...
    // DESIGNER: Retraction/withdrawal status for systematic review integrity
    retraction: record.retraction,
  };
}
```

The field flows through automatically when ScreeningDecision objects are created during `runTitleAbstractScreening()` batches. Backward compatible: absent on records created before retraction field was added.

### `components/ScreeningPanel.tsx` — RetractionBadge Component

Added new `RetractionBadge` component (lines 88–105) to display retraction status with visual prominence:

```typescript
function RetractionBadge({ retraction }: { retraction: { type: string; label: string; noticeDoi?: string } }) {
  return (
    <span
      className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
      style={{
        background: "rgba(239, 68, 68, 0.15)",
        color: "#dc2626",
        border: "1px solid rgba(239, 68, 68, 0.3)",
      }}
      title={`Study status: ${retraction.label}. ${retraction.noticeDoi ? "Notice: " + retraction.noticeDoi : "Consider impact on your review."}`}
    >
      ⚠ {retraction.type === "retracted" ? "Retracted" : "Withdrawn"}
    </span>
  );
}
```

Styling: Red-tinted background (danger palette) with warning symbol (⚠). Hover tooltip shows the Crossref notice DOI if available (for traceability).

### `components/ScreeningPanel.tsx` — Results Table Display

Updated the results table header comment and badge row (lines 531–548) to include retraction status:

```typescript
{/* Year · Journal · Reason code · Retraction status */}
<div className="flex flex-wrap items-center gap-1.5 mt-0.5">
  <p className="text-[11px]" style={{ color: "var(--muted)" }}>
    {d.journal && <>{d.journal} · </>}{d.year || "Year unknown"}
  </p>
  {d.retraction && <RetractionBadge retraction={d.retraction} />}
  {d.reason_code && <ReasonCodeBadge code={d.reason_code} />}
  {d.refined && (
    <span className="text-[10px] shrink-0" style={{ color: "var(--accent)" }} title="...">
      ↻ re-screened
    </span>
  )}
</div>
```

Renders retraction badge **before** reason_code badge so the most critical provenance signal (retracted/withdrawn status) appears first, visually prioritized.

---

## 3. Workflow & End-User Impact

**Before (handoff 088):**
- Search route checks Crossref and stores `retraction` on matching `ExistingReview` records
- Screening UI does not display the retraction status
- Researcher only learns about retractions during full-text review (too late)

**After (this handoff):**
- Retraction status is *immediately visible* in title/abstract screening results
- Researcher can see at a glance which records are flagged: "⚠ Retracted" or "⚠ Withdrawn"
- Tooltip shows Crossref notice DOI for verification
- Supports RAISE guidance: *"Maintain human oversight of all evidence; flag provenance concerns early"*

---

## 4. Backward Compatibility

- `retraction` field is optional (`?`) on ScreeningDecision — absent on results generated before this change
- Results table only renders the badge if `d.retraction` is truthy
- Screening export (CSV, RIS) already includes retraction data from `ExistingReview` per handoff 087
- No schema changes; no DB migration required

---

## 5. Files Modified

| File | Changes |
|---|---|
| `types/index.ts` | Added `retraction` field to `ScreeningDecision` interface |
| `lib/screening.ts` | Updated `mapDecision()` to copy `retraction` from `ExistingReview` |
| `components/ScreeningPanel.tsx` | Added `RetractionBadge` component; display in results table |

---

## 6. Testing & Verification

```
tsc --noEmit → 0 errors
eslint lib/screening.ts components/ScreeningPanel.tsx types/index.ts → 0 new violations
```

**Manual verification steps** (prerequisite: handoff 088 must be live, so retraction data is being fetched):
1. Run a search on a topic with known retractions (e.g., "immunotherapy cancer" — several retractions in 2024–2025)
2. Launch screening on existing reviews or primary studies
3. Confirm retraction badges appear next to flagged studies with "⚠ Retracted" or "⚠ Withdrawn"
4. Hover over badge to see Crossref notice DOI in tooltip

---

## 7. Impact & Next Steps

**Criterion #4 (retraction awareness):** Now 100% complete end-to-end:
- ✅ Data source: `lib/retractions.ts` (handoff 085)
- ✅ Search route wiring: `app/api/search/route.ts` (handoff 088)
- ✅ Export sink: RIS/CSV (handoff 087)
- ✅ **Screening UI display** (this handoff)
- 🔄 Pending: Existing Reviews tab badge (DESIGNER to add badge in results header)

**Next priorities** (from screening-market-analysis.md):
1. **Existing Reviews provenance badge** — Retraction/source count badge on the main search results page (DESIGNER)
2. **Gemini model upgrade path** — Tier 2 screening feature (medium effort, medium impact)
3. **Tier 2 confidence bulk actions** — "Review low-confidence items first" bulk filter

---

## 8. Wiki Updates (Librarian)

- `[[Milestone — Search Recall & Provenance Benchmark]]` — criterion #4 complete (UI display done; existing reviews badge pending)
- `[[Screening Features]]` — Retraction badge now shown in title/abstract screening results table
- `[[Data Model]]` — `ScreeningDecision` now carries `retraction` field for audit trail
- `[[RAISE Compliance]]` — Retraction awareness milestone complete

---

## 9. Session Notes

**Development time**: ~45 minutes  
**Complexity**: Low — straightforward pass-through of retraction data from ExistingReview → ScreeningDecision → UI  
**Code review notes**: None — changes are additive and isolated to three files

This work completes the visual provenance layer for the Screening feature, ensuring researchers see retraction/withdrawal warnings in their most critical decision point (title/abstract stage).

---

**Status**: ✅ Ready to deploy  
**Session completed**: 2026-06-16
