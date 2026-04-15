# Market Research Update: Accuracy, Reliability & New Opportunities
**Date:** 2026-04-15
**Prepared by:** Automated market research agent (fourth run)
**For:** Blindspot daily-improver agent
**Previous market research:** spec/026-market-research.md (last accuracy-focused run)

---

## Executive Summary

This document is the fourth market research run. It covers:

1. **A confirmed code gap**: The ACC-2 alternative topics panel does not show for `Low` feasibility — only for `Insufficient`. This contradicts the original spec and is the highest-priority accuracy fix.
2. **New accuracy/reliability improvements** based on April 2026 research and fresh web searches.
3. **New competitive intelligence** since the March 2026 run.
4. **A complete status audit** of everything built in handoffs 027–043.

The primary focus requested for this iteration: *"accuracy and reliability of results — the program should say if an idea is not possible if there are not enough studies and it is important to suggest other systematic review topics that may be related which are more feasible (based on actual data from APIs)."*

---

## Status Audit: What Has Been Built (do not rebuild)

Based on reviewing handoffs 027–043, all items from `spec/026-market-research.md` have been implemented:

| Handoff | Feature |
|---------|---------|
| 027 | ACC-1: Hard gate — blocks AI analysis when <3 primary studies |
| 028 | ACC-3: AI confidence badge tied to review count |
| 028–029 | ACC-4: AI-suggested topics verified against PubMed real counts |
| 029 | Feasibility count accuracy fixes + zero-study guard |
| 030 | UI-2: "Why This Score?" feasibility explainer |
| 030 | NEW-2: Study count trend (↑ Growing / → Stable / ↓ Declining) |
| 031 | UI-1: Per-database study count breakdown (PubMed · OpenAlex · Europe PMC) |
| 032 | ACC-2: Data-grounded alternative topics via OpenAlex taxonomy + PubMed verification |
| 033 | NEW-1: Persistent PROSPERO indicator in summary header |
| 034 | UI-3: Stale cache warning + refresh prompt |
| 035–036 | PRISMA screening ratio calibration (incl. XL/XXL tiers for broad queries) |
| 037 | Wide-query warning banner + broad-corpus feasibility flag |
| 038 | PRISMA included-study confidence interval (range instead of point estimate) |
| 039 | NEW-3: Boolean query passthrough in simple search box |
| 040 | Boolean badge in search history + expandable syntax hints panel |
| 041 | Low-evidence disclaimer banner + dashboard PROSPERO badge + Boolean count |
| 042 | Per-gap Low-confidence badge (◔) + dashboard sort control |
| 043 | Per-gap Moderate-evidence badge (◑) + extracted `getPerGapBadgeConfig` helper |

---

## 🔴 CONFIRMED CODE GAP: ACC-2 Never Shows for Low Feasibility

### The Issue

`components/ResultsDashboard.tsx` renders `InsufficientEvidencePanel` only when:
```ts
if (feasibilityScore === "Insufficient" && !gapAnalysis) {
  return <InsufficientEvidencePanel primaryStudyCount={primaryStudyCount} query={query} />;
}
```

For `Low` feasibility (3–5 studies), only the amber disclaimer banner is shown (added in handoff 041). The alternative topics panel — with API-verified suggestions — is **never shown** for Low.

### Why This Matters

`spec/026-market-research.md` ACC-2 explicitly states:
> "When the main search returns **Insufficient or Low** feasibility, run a secondary 'topic broadening' step..."

A researcher with 4 primary studies sees a Low feasibility result, the AI gap analysis runs (with `◔ Low confidence` badges per 042), the amber disclaimer banner, but **no concrete suggestions for better adjacent topics**. This leaves them with caveated AI output but no alternative paths — a trust gap that the spec intended to close.

### Fix (ACC-2 Completion — LOW EFFORT, HIGH IMPACT)

**Option A** — The simplest fix: render `AlternativesSection` inside the existing amber disclaimer banner for `Low` feasibility. After the banner text, add:

```tsx
{feasibilityScore === "Low" && query && (
  <div className="mt-4">
    <AlternativesSection query={query} primaryStudyCount={primaryStudyCount} />
  </div>
)}
```

The `AlternativesSection` component is already exported from `InsufficientEvidencePanel.tsx` and fetches from `/api/alternatives`. No new API route needed.

**Option B** — More complete: extend `InsufficientEvidencePanel` to accept `feasibilityScore` and show a modified header for Low vs. Insufficient, then render it for both tiers. This creates a unified "evidence guidance" component.

Option A is recommended — lower risk, no component restructuring.

**Where to add:** In `components/ResultsDashboard.tsx`, inside the `GapsTab` or in the results summary area, after the Low-evidence amber banner (line 1526 region). The alternatives call is async with a skeleton loader so it doesn't block the page render.

**Message to show:** The header label for Low should differ from Insufficient:
- Insufficient: "Insufficient Evidence — not enough studies for a systematic review"
- Low: "Limited Evidence — related topics with stronger evidence bases"

---

## 🔴 HIGH PRIORITY: New Accuracy & Reliability Improvements

### ACC-6 — OSF Registry Check (Third Major Registry)

**What:** The Open Science Framework (OSF) is now the **third largest systematic review registry** after PROSPERO. A 2026 meta-research study (Frontiers, 2026) identified 37,849 registered SR protocols across registries:
- PROSPERO: 31,960 entries
- OSF Registries: 2,960 entries ← currently unchecked
- INPLASY: 2,370 entries ← already checked
- Research Registry: 349 entries
- protocols.io: 210 entries

Blindspot currently checks PROSPERO + INPLASY (handoff 013). Adding OSF closes a real coverage gap — particularly important for social science, psychology, education, and public health research, where PROSPERO's health focus may not apply and OSF is the primary registration venue.

**API:** OSF has a free open API:
- Search registrations: `https://api.osf.io/v2/registrations/?q=<query>&filter[category]=software`
- No authentication required for read access
- Returns JSON with title, description, date_registered, and URL fields

**Implementation:**
- Add `searchOSFRegistrations(query: string): Promise<RegistryMatch[]>` to `lib/registry.ts` (alongside the existing PROSPERO and INPLASY functions)
- Update the registry check route (`app/api/registry/route.ts` or similar) to run all three in parallel
- Surface OSF results in the existing registry panel in `ResultsDashboard.tsx`
- The persistent PROSPERO badge in the summary header (handoff 033) should be extended to a "Registry" badge showing the highest-risk match across all three registries

**Effort:** Low — OSF's API is simple and the existing registry infrastructure accepts new sources easily.

---

### ACC-7 — OpenAlex Semantic Search for Alternative Topics (ACC-2 Upgrade)

**What:** OpenAlex launched **semantic vector search** in February 2026 — finding papers by meaning rather than keywords. This is now in beta at `https://api.openalex.org/works?q=<query>&mode=semantic`. The existing ACC-2 alternative topics implementation uses the OpenAlex topics taxonomy (hierarchy-based sibling topics). This works well for topics that map cleanly to the taxonomy, but fails for:
- Interdisciplinary topics that span multiple subfields
- Clinical topics phrased in patient-facing language (not MeSH)
- Emerging research areas not yet assigned stable taxonomy positions

**Proposed upgrade:** In `lib/topic-broadening.ts`, after the primary taxonomy-based search, add a secondary semantic search step:
1. Query `https://api.openalex.org/works?q=<query>&mode=semantic&per_page=20`
2. Extract `primary_topic` from the top 5–10 semantically related works
3. Deduplicate against taxonomy-found topics
4. Run PubMed count verification (reuse existing logic)
5. Merge results, showing up to 5 alternatives total

Since semantic search is in beta and "not recommended for sensitive production workflows," it should be a **secondary fallback** — only used when taxonomy-based search returns fewer than 3 alternatives. The UI should not indicate which method found each suggestion (irrelevant to researchers).

**Effort:** Low-Medium — `lib/topic-broadening.ts` needs a new secondary query path. The verification and display logic is already built.

**Impact:** High — directly improves the specific focus area: "suggest other systematic review topics that may be related which are more feasible (based on actual data from APIs)."

---

### ACC-8 — Date-Filtered Feasibility Mode (Recency Filter)

**What:** The current primary study count reflects all-time publication history. For some topics, this is misleading:
- "Telemedicine for chronic disease management" — thousands of studies, but most pre-2020 before widespread adoption
- "mRNA vaccine immunogenicity" — most relevant studies are post-2021
- "Machine learning in radiology" — a 2015 study and a 2024 study have very different relevance

The trend feature (handoff 030) shows ↑/↓ direction but doesn't help researchers who want to assess feasibility **only within a relevant time window**.

**Proposed behavior:**
- Add a "Publication period" dropdown to the PICO/search form: All time | Last 5 years | Last 10 years | Last 20 years | Custom range
- When selected, add `datetype=pdat&mindate=<year>&maxdate=2026` to the PubMed query and an equivalent `from_publication_date:<year>` filter to OpenAlex
- The feasibility score and study count update accordingly
- The period filter is stored in `search_results` alongside the query

**Why it improves accuracy:** A topic with 5 studies since 2020 has very different feasibility from one with 5 total studies spread over 40 years. The recency filter makes the feasibility score actionable for researchers who care about current evidence (i.e., most of them).

**Implementation:** `lib/pubmed.ts` countPrimaryStudies() accepts an optional `minYear?: number` parameter. `lib/openalex.ts` accepts `fromYear?: number`. `components/PICOForm.tsx` or `components/TopicInput.tsx` adds the dropdown. Low-effort PubMed change, moderate UI work.

**Effort:** Medium.

---

## 🟡 MEDIUM PRIORITY: New Features

### NEW-4 — RAISE Compliance Disclosure Page

**What:** Cochrane released RAISE 3 in June 2025 — "Guidance on selecting & using AI evidence synthesis tools." It specifies that AI tools must disclose how AI is used, what data sources are queried, accuracy limitations, and how human oversight is maintained. In March 2026, Cochrane released additional guidance on AI use in different types of reviews.

Universities and institutional systematic reviewers are increasingly required to justify AI tool selection. A brief "Methodology" or "How Blindspot Works" page that:
- Documents which databases are searched (PubMed, OpenAlex, Europe PMC, Semantic Scholar, ClinicalTrials.gov)
- Explains the feasibility scoring thresholds and their Cochrane basis
- Describes where Gemini is used (gap analysis) and where it is NOT used (feasibility scoring — which is data-driven)
- Notes the PRISMA calibration approach and confidence interval methodology
- States the human oversight requirement (AI is advisory; researchers must verify)

**Implementation:** A simple `/methodology` or `/about` page (or expandable modal). Static content, no API calls. Link from the footer and from the "Why This Score?" popover.

**Impact:** High institutional trust signal. Tools that can produce RAISE compliance documentation are preferred by universities. No competitor in Blindspot's niche currently offers this.

**Effort:** Low — static page, no code changes to the analysis pipeline.

---

### NEW-5 — Zotero Direct Export

**What:** SciSpace launched native Zotero integration in their 2026 update. Blindspot already has RIS/BibTeX export (built in handoff 005). Adding a **one-click "Add to Zotero"** button using the Zotero Web API would be a direct competitive response and is more frictionless than file download + manual import.

**Implementation:**
- Zotero Web API: `https://api.zotero.org/users/<userId>/items` — requires user OAuth or API key
- Simpler alternative: Use the Zotero connector's clipboard-based import (the Zotero browser connector watches the clipboard for JSON-LD bibliographic data)
- Simplest: Generate a Zotero-compatible RIS file and link to the Zotero import endpoint directly (some Zotero versions support URL-based import)

The cleanest approach is generating a `.ris` download (already works from handoff 005) and adding a "Save to Zotero" button that uses the existing export and opens `zotero://import` with the file path or content.

**Effort:** Low (existing RIS export infrastructure; Zotero import is well-documented).

---

### NEW-6 — Supabase Search Telemetry

**What:** Strongly recommended as #1 next step in handoff 043. Log `afterDedup`, `tier`, `included`, and `primaryStudyCount` per real search to a `search_telemetry` table. After 50+ searches, validate whether the PRISMA confidence intervals calibrated in handoffs 035–038 match real-world included counts.

This is a pure accuracy infrastructure investment — the PRISMA screening ratios are currently calibrated against external published SR benchmarks. Real Blindspot usage data would allow calibration against the actual queries and topics users run.

**Implementation:**
- New Supabase table: `search_telemetry (id, search_id, primary_study_count, after_dedup, prisma_tier, feasibility_score, created_at)`
- No new UI
- Insert in `app/api/search/route.ts` after the primary count is computed
- Analysis: a simple `SELECT AVG(primary_study_count), tier, COUNT(*)` query after 50 entries will show distribution by tier

**Effort:** Low. **Impact:** Critical long-term accuracy foundation.

---

### NEW-7 — Multi-Topic Comparison Panel ("Research Notebook")

**What:** Researchers — especially PhD students choosing a dissertation topic — run 5–10 Blindspot searches across candidate topics and want to compare them side-by-side. Currently they must navigate between individual result pages.

Inspired by SciSpace's 2026 Notebook feature, Blindspot could add a "Compare" mode to the search history dashboard (built in handoff 009):
- Check-boxes on dashboard search cards
- "Compare selected" button opens a side-by-side table: Topic | Feasibility | Study Count | Trend | PROSPERO | Date
- Max 4 topics compared at once (readability)
- Export comparison as PDF or share as a public link

**Effort:** Medium — the data is already in `search_results`; the UI is new.
**Impact:** High for the PhD student persona — this is a workflow they currently do manually in spreadsheets.

---

## 🟢 LOWER PRIORITY: Remaining Backlog & Small Improvements

### From handoff 043 recommended next steps (carry forward):

1. **[Medium] Persist dashboard sort preference** — Store chosen sort order in Supabase `user_preferences` or a cookie. Researchers who always want "High feasibility first" should not need to click the sort link each visit.

2. **[Low] Moderate feasibility top-of-tab notice (optional)** — A mild informational callout (blue, not amber) for Moderate results. Design decision: probably not needed given the per-gap badges (043), but worth A/B testing.

3. **[Low] Animate badge appearance on tab switch** — Subtle stagger fade-in for per-gap badges when the Gaps tab is activated. Draws attention to the new badges.

### From original backlog (still unbuilt):

4. **Team/Collaboration Features** — Shared workspaces, commenting on gaps, role-based access. High long-term value for institutional adoption; currently owned by Covidence and Rayyan. Medium-High effort.

5. **PROSPERO Registration Export** — Generate a pre-filled PROSPERO/INPLASY/OSF protocol draft from the gap analysis. Closes the workflow loop from "found a gap" to "registered my review." Medium effort.

---

## Competitive Intelligence Update (April 2026)

| Development | Implication for Blindspot |
|-------------|--------------------------|
| **OpenAlex launched semantic vector search (Feb 2026)** — beta, `?mode=semantic` | Use for ACC-7 (alternative topic suggestions). Not yet reliable enough for primary feasibility scoring. |
| **OpenAlex now indexes 250M+ papers** | Coverage update — search infrastructure handles this transparently, but update the "How Blindspot Works" page copy. |
| **OpenAlex now offers usage-based pricing** | The free tier with polite pool (`mailto=` header) continues to work. Monitor for rate limit changes. |
| **SciSpace 2026: Zotero integration + Research Notebooks** | Direct competitive pressure on workflow features. Blindspot should add Zotero export (NEW-5) and comparison view (NEW-7). |
| **Cochrane RAISE 3 published June 2025** | Institutions now expect RAISE compliance documentation. Build NEW-4 (methodology disclosure). |
| **OSF registry: 2,960 SR protocols (3rd largest, 2026 meta-research)** | ACC-6 (OSF check) closes a real coverage gap — particularly for social sciences. |
| **Cochrane AI platform study: interim results mid-2026** | Laser AI + Nested Knowledge being evaluated. Blindspot's pre-selection / feasibility-scoring niche remains distinct from their screening-phase focus. |
| **OpenAlex utility for SRs (2025 PMC study)**: 96% recall, but 3–4 records lost in March 2025 due to closed-access abstract removal | Blindspot should note OpenAlex coverage limitations in the methodology disclosure (NEW-4). The per-database count breakdown (031) already helps transparency. |
| **RAISE guidance: AI tools must disclose limitations** | Supports NEW-4 (methodology page). Should mention that Gemini gap analysis is advisory and that feasibility scoring is fully data-driven. |

---

## Recommended Build Order for Daily Improver

Priority order based on the stated focus (accuracy/reliability + feasible alternatives):

1. **ACC-2 Completion — Extend alternative topics panel to Low feasibility** — Confirmed code gap. Very low effort (add `AlternativesSection` component into the existing amber banner for Low). Very high impact on the exact feature requested: showing API-verified alternatives when evidence is insufficient. This is a bug fix, not a new feature.

2. **ACC-6 — OSF Registry Check** — Low effort, closes a real coverage gap in the "is this already being reviewed?" question. OSF is now the #3 registry with 2,960 entries; missing it means missing ~9% of registered protocols outside PROSPERO+INPLASY.

3. **NEW-6 — Supabase Search Telemetry** — Low effort, critical for long-term accuracy validation. Without real search data, PRISMA calibration depends entirely on external benchmarks. Even 30 days of production data will improve the model.

4. **ACC-7 — OpenAlex Semantic Search as ACC-2 Fallback** — Medium effort. When the taxonomy-based search (current ACC-2) returns 0–2 alternatives, the semantic fallback kicks in to find meaning-similar adjacent topics. Directly addresses: "suggest other systematic review topics that may be related which are more feasible."

5. **ACC-8 — Date-Filtered Feasibility Mode** — Medium effort. Prevents misleading High scores on topics with old evidence bases. Pairs naturally with the existing trend indicator. High value for researchers working on modern/emerging research areas.

6. **NEW-4 — RAISE Compliance Disclosure Page** — Low effort (static content). Institutional trust signal that costs almost nothing to build. Addresses Cochrane's March 2026 guidance that AI tools must disclose methodology.

7. **NEW-5 — Zotero Direct Export** — Low effort (existing RIS infrastructure). Competitive response to SciSpace 2026 Zotero integration.

8. **NEW-7 — Multi-Topic Comparison Panel** — Medium effort. High value for PhD student persona. Data is already in `search_results`; UI is new.

9. **Persist dashboard sort preference** — Low effort carry-forward from handoff 043.

10. **Team/Collaboration Features** — High effort, high long-term value. For a later sprint.

---

## Technical Notes for Daily Improver

**Confirmed live code state (from reading source files):**
- `components/ResultsDashboard.tsx` line ~1501: `InsufficientEvidencePanel` only renders when `feasibilityScore === "Insufficient"`. The `Low` case at line ~1526 only shows the amber banner.
- `components/InsufficientEvidencePanel.tsx`: `AlternativesSection` component is already defined and exported internally. It fetches from `/api/alternatives?query=<q>&originalCount=<n>`. No new API route needed for the ACC-2 completion fix.
- `lib/topic-broadening.ts`: Handles the OpenAlex taxonomy lookup + PubMed verification. For ACC-7, add a secondary `findSemanticSimilarTopics(query)` function that queries `https://api.openalex.org/works?q=<query>&mode=semantic&per_page=20`, extracts distinct primary_topics, and verifies counts. Gate behind: `if (taxonomyResults.length < 3) { ...semantic fallback... }`.
- OpenAlex API `mailto` header: Add `school.dharmayu@gmail.com` to polite pool headers (already documented in `spec/026-market-research.md`; verify it's set in `lib/openalex.ts`).
- OSF API endpoint for registrations: `https://api.osf.io/v2/registrations/?q=<query>&embed=contributors` — free, no API key required.
- For NEW-4 (RAISE page): create `app/methodology/page.tsx` as a static Next.js page. Link from `components/NavBar.tsx` and from the "Why This Score?" popover in `ResultsDashboard.tsx`.
- Supabase telemetry (NEW-6): Create migration `supabase/migrations/NNN_search_telemetry.sql`. Insert in `app/api/search/route.ts` after primary count computed. RLS policy: users can only read their own rows; service role inserts.
- `npm test` and `npm run build` remain blocked by rollup ARM64 binary mismatch. Use `npx eslint` and `npx tsc --noEmit` for verification.

---

## Summary of Focus Area Assessment

The stated focus — "accuracy and reliability: say if an idea is not possible, suggest feasible related topics from real API data" — has been substantially addressed in handoffs 027–043 (ACC-1 through ACC-5, PRISMA calibration, confidence intervals). The main remaining gaps are:

1. **Bug**: ACC-2 alternative topics panel doesn't show for Low feasibility (3–5 studies) — only for Insufficient. This is an unintended omission that directly contradicts the original spec.
2. **Coverage gap**: OSF registry not checked despite being the 3rd largest SR registry.
3. **Quality gap in alternative topics**: The current taxonomy-based ACC-2 misses interdisciplinary adjacencies — semantic search fallback would materially improve suggestion quality.
4. **Missing recency context**: Feasibility scores don't support time-filtered counts — a crucial dimension for modern vs. historical evidence assessment.

These four items are the direct continuation of the accuracy/reliability work, and all are implementable in 1–3 development sessions.
