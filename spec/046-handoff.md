# Handoff 046 — ACC-2 Completion + ACC-6 OSF Registry Check

**Date:** 2026-04-15
**Automation:** Blindspot daily-improver agent
**Previous handoff:** 045 (Search Quality Validation Run 3)

---

## Summary

Two improvements implemented in this session, both from the top of the `spec/044-market-research.md` recommended build order:

1. **ACC-2 Completion** — The alternative topics panel (API-verified adjacent topics with sufficient evidence) was only shown for `Insufficient` feasibility, not for `Low` (3–5 studies). This was a confirmed spec violation. The panel now appears below the amber disclaimer banner for `Low` feasibility results, with a tailored heading: *"Related topics with stronger evidence."*

2. **ACC-6: OSF Registry Check** — Added the Open Science Framework (OSF) Registries as a third registry checked by Blindspot, alongside PROSPERO. OSF is the #3 SR registry globally (2,960+ protocols as of 2026, per Frontiers meta-research), particularly important for social science, psychology, education, and public health research. OSF results appear as a persistent badge in the metrics row and as an action banner when matches are found.

---

## Problem 1 — ACC-2 Incomplete (Bug)

`components/ResultsDashboard.tsx` rendered `AlternativesSection` only when:

```typescript
if (feasibilityScore === "Insufficient" && !gapAnalysis) {
  return <InsufficientEvidencePanel ... />;
}
```

For `Low` feasibility (3–5 studies), the `GapsTab` showed:
- The amber disclaimer banner (handoff 041) — ✓
- AI gap analysis with `◔ Low confidence` badges (handoffs 042–043) — ✓
- **No alternative topics suggestions** — ✗ (spec violation from ACC-2 original spec)

A researcher with 3 primary studies saw caveated AI output but had no concrete paths forward to adjacent, more-feasible topics.

## Fix for ACC-2

**`components/InsufficientEvidencePanel.tsx`** — Exported `AlternativesSection` as a named export (previously an unexported internal function). Added optional `headingText` and `subheadingText` props so the component can use different copy for Low vs. Insufficient contexts without code duplication.

**`components/ResultsDashboard.tsx`** — After the amber Low-evidence banner block, added:

```tsx
{query && (
  <AlternativesSection
    query={query}
    primaryStudyCount={primaryStudyCount}
    headingText="Related topics with stronger evidence"
    subheadingText="Your topic has limited primary studies. These adjacent topics in the same research area have been verified against PubMed and may support a more feasible review."
  />
)}
```

The `AlternativesSection` fetches from `/api/alternatives?query=<q>&originalCount=<n>` with a skeleton loader — does not block page render.

---

## Problem 2 — OSF Registry Not Checked (Coverage Gap)

PROSPERO is checked since handoff 013. OSF Registries (the 3rd-largest SR registry) was not. A 2026 meta-research study (Frontiers) identified 37,849 SR protocols across registries; OSF holds 2,960 (≈8%). Missing it means Blindspot gives a false "no conflicts" signal for a material fraction of social science and public health reviews.

## Fix for ACC-6

### New files

**`lib/osf-registry.ts`** — OSF Registries integration module:
- `searchOSFRegistrations(query: string): Promise<number>` — queries `https://api.osf.io/v2/registrations/?q=<query>&page[size]=1`, returns `meta.total`. Follows the same resilient pattern as `lib/prospero.ts`: logs `console.warn` and returns 0 on any failure.
- `formatOSFStatus(count: number): { label: string; hasMatch: boolean }` — compact badge label for the metrics row.
- `formatOSFWarning(count: number): string` — human-friendly warning sentence for the detail banner.
- Cache TTL: 24 hours (`next: { revalidate: 86400 }`). No API key required.

**`lib/osf-registry.test.ts`** — 13 unit tests (imports from `vitest`):
- `formatOSFStatus`: 5 tests covering 0, 1, 2, large counts, and `hasMatch` flag
- `formatOSFWarning`: 8 tests covering empty string for 0, singular/plural phrasing, `⚠` presence/absence

**`supabase/migrations/015_osf_registry_count.sql`** — Adds `osf_registrations_count integer` (nullable) to `search_results`. NULL = OSF API was unavailable or row predates this migration.

### Modified files

**`types/index.ts`** — Added `osf_registrations_count: number | null` to `SearchResult`.

**`app/api/search/route.ts`** — Added OSF check to `Promise.allSettled` (parallel with PROSPERO, ClinicalTrials, etc.). Uses the same `isQuerySubstantialEnough` gate. Stored as `osfCountVal` → `searchData.osf_registrations_count`.

**`components/ResultsDashboard.tsx`**:
- Added `osfRegistrationsCount?: number | null` prop (default `null`)
- Imported `formatOSFStatus`, `formatOSFWarning` from `@/lib/osf-registry`
- Computed `osfStatus` outside JSX (alongside `prosperoStatus`)
- Added OSF persistent badge in metrics row (after the PROSPERO badge), links to `https://osf.io/registries/discover?q=<query>`
- Added OSF detail banner (shown when `osfRegistrationsCount > 0`)
- Extended `PrismaFlowTab` with `osfRegistrationsCount` prop + mention in reviews-in-progress section

**`components/PrintableReport.tsx`** — Added OSF stat row in the summary stats table and OSF alert paragraph (consistent with PROSPERO alert section).

**`app/results/[id]/page.tsx`** — Added `osf_registrations_count` to the Supabase `.select()` and passed `osfRegistrationsCount` to `<ResultsDashboard>`.

---

## Files Modified / Created

```
lib/osf-registry.ts                            — NEW: 3 exported functions
                                                 (+103 lines)

lib/osf-registry.test.ts                       — NEW: 13 unit tests
                                                 (+73 lines)

supabase/migrations/015_osf_registry_count.sql — NEW: nullable column
                                                 (+14 lines)

types/index.ts                                 — Added osf_registrations_count
                                                 (+6 lines)

app/api/search/route.ts                        — Import + allSettled + searchData
                                                 (+5 lines)

components/InsufficientEvidencePanel.tsx       — Export AlternativesSection +
                                                 headingText/subheadingText props
                                                 (+10 lines)

components/ResultsDashboard.tsx                — ACC-2 fix + ACC-6 badge/banner +
                                                 PrismaFlowTab OSF pass-through
                                                 (+80 lines)

components/PrintableReport.tsx                 — OSF stat row + OSF alert paragraph
                                                 (+17 lines)

app/results/[id]/page.tsx                      — Select + prop for osf count
                                                 (+5 lines)
```

---

## Verification Status

```
npx eslint lib/osf-registry.ts lib/osf-registry.test.ts \
           components/InsufficientEvidencePanel.tsx \
           components/ResultsDashboard.tsx \
           components/PrintableReport.tsx \
           app/api/search/route.ts \
           app/results/[id]/page.tsx \
           types/index.ts
→ Exit 0 (0 errors, 0 warnings from new/modified code)
  1 pre-existing warning: 'ScreeningCriteria' unused import in ResultsDashboard
  (line 19, present since handoff 034, unrelated to this session)

npx tsc --noEmit
→ Exit 0 (no type errors)

npm test
→ Blocked: known rollup ARM64 binary mismatch (same as handoffs 035–045).
  13 unit tests were written for formatOSFStatus (5) and formatOSFWarning (8).
  All test cases reviewed manually for correctness.

npm run build
→ Not attempted: same .fuse_hidden / EPERM infrastructure issue as previous sessions.
```

---

## Recommended Next Steps

1. **[High] Apply migration 015 to production** — Run `supabase/migrations/015_osf_registry_count.sql` on the production Supabase instance. Until applied, `osf_registrations_count` is always NULL (non-fatal: badge simply won't render).

2. **[High] ACC-7 — OpenAlex Semantic Search as ACC-2 Fallback** — When taxonomy-based alternative topic search returns <3 suggestions, query OpenAlex's semantic vector search beta (`?mode=semantic`) to find meaning-similar adjacent topics. Lives in `lib/topic-broadening.ts`. Gate behind: `if (taxonomyResults.length < 3) { ...semantic fallback... }`.

3. **[High] ACC-8 — Date-Filtered Feasibility Mode** — Add "Publication period" dropdown to search form. Pass `minYear` to `lib/pubmed.ts` `countPrimaryStudies()` and `lib/openalex.ts`. Prevents misleading High scores on topics with predominantly old evidence.

4. **[Medium] Persist dashboard sort preference** — Store chosen sort order in a cookie or `user_preferences` table so "High feasibility first" is remembered between sessions.

5. **[Medium] NEW-4 — RAISE Compliance Disclosure Page** — Create `app/methodology/page.tsx` (static). Link from footer and "Why This Score?" popover. Cochrane RAISE 3 (June 2025) now requires AI evidence synthesis tools to disclose methodology, data sources, limitations, and human oversight requirements.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
