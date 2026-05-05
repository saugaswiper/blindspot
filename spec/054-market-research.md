# Market Research Update: Accuracy, Reliability & New Opportunities
**Date:** 2026-05-03
**Prepared by:** Automated market research agent (fifth run)
**For:** Blindspot daily-improver agent
**Previous market research:** spec/044-market-research.md (April 2026)

---

## Executive Summary

This document is the fifth market research run. It covers:

1. **A confirmed breaking infrastructure bug**: OpenAlex changed its API authentication on February 13, 2026 — the old `mailto=` polite pool is discontinued. All OpenAlex API calls in Blindspot currently use `OPENALEX_EMAIL` / `mailto=`, which will fail with 409 errors once the 100 free test credits run out. This is the **highest priority fix** in this document.

2. **Two confirmed carry-forward items from handoff 053** that were recommended but not yet built: Scopus count in the UI source breakdown and PICO pre-fill on the results page.

3. **INPLASY registry gap**: Referenced in OSF registry comments as "PROSPERO + INPLASY alone" — but INPLASY is never actually queried. The three-registry coverage is PROSPERO + OSF, not PROSPERO + INPLASY + OSF as implied.

4. **New accuracy/reliability improvements** based on May 2026 research and fresh web searches.

5. **Competitive intelligence update**: Cochrane has finalized its AI platform study selections (Laser AI and Nested Knowledge); SciSpace continues adding workflow features; PRISMA-AI extension is in active development.

The **primary focus** for this iteration remains: *"accuracy and reliability of results — the program should say if an idea is not possible if there are not enough studies, and it is important to suggest other systematic review topics that may be related which are more feasible (based on actual data from APIs)."*

---

## Status Audit: What Has Been Built (do not rebuild)

All items from `spec/044-market-research.md` are confirmed implemented:

| Handoff | Feature |
|---------|---------|
| 044 | NEW-6: Supabase search telemetry table + insertions |
| 045 | Search quality validation run 3 (no systematic bias) |
| 046 | ACC-2 Completion: AlternativesSection shown for Low feasibility |
| 046 | ACC-6: OSF Registry Check (3rd largest registry) |
| 047 | NEW-4: RAISE compliance `/about` page |
| 048 | ACC-8: Date-Filtered Feasibility Mode (minYear dropdown) |
| 049 | ACC-7: OpenAlex semantic search fallback for alternative topics |
| 050 | NEW-7: Multi-Topic Comparison Panel (Research Notebook) |
| 051 | NEW-5: Zotero Direct Export via `zotero://` URI protocol |
| 051 | PREF-1: Persist dashboard sort preference via cookie |
| 051 | ACC-9: minYear scope shown in feasibility explanation text |
| 052 | PICO-1: PICO fields stored in `searches` table on insert |
| 053 | Scopus (Elsevier) integration as 5th search source |
| 053 | True ID-based deduplication (replaces fixed 0.75 factor) |

---

## 🔴 CRITICAL BUG: OpenAlex API Key Migration (CRIT-1)

### The Issue

On **February 13, 2026**, OpenAlex discontinued the `mailto=` polite pool system. All API requests now require an API key. Without one, requests receive **100 free test credits, then 409 errors**.

Blindspot's `lib/openalex.ts` still uses:
```ts
const EMAIL = process.env.OPENALEX_EMAIL ?? "";
// ...
if (EMAIL) url.searchParams.set("mailto", EMAIL);
```

The `.env.local` file has `OPENALEX_EMAIL=19dbd1@queensu.ca` — a value that no longer provides any rate-limit benefit and will not prevent 409 errors after the free credits are exhausted.

**`lib/topic-broadening.ts` has the same pattern:**
```ts
const EMAIL = process.env.OPENALEX_EMAIL ?? "";
// ... (same mailto= usage)
```

### Impact

Every OpenAlex-dependent feature will silently fail or throw errors once credits run out:
- Primary study count (used for feasibility scoring)
- Existing review search
- Alternative topics (ACC-2 + ACC-7 semantic fallback)
- ID-based deduplication (`fetchPrimaryStudyIds`)
- Study trend computation

### Fix

**Step 1:** Get a free OpenAlex API key at `https://openalex.org/settings/api` (takes ~30 seconds).

**Step 2:** Update `.env.local` and `.env.example`:
```env
# Remove:
OPENALEX_EMAIL=19dbd1@queensu.ca

# Add:
OPENALEX_API_KEY=<your-key-here>
```

**Step 3:** In `lib/openalex.ts`, change:
```ts
const EMAIL = process.env.OPENALEX_EMAIL ?? "";
// ...
if (EMAIL) url.searchParams.set("mailto", EMAIL);
```
to:
```ts
const OPENALEX_API_KEY = process.env.OPENALEX_API_KEY ?? "";
// ...
if (OPENALEX_API_KEY) url.searchParams.set("api_key", OPENALEX_API_KEY);
```

Apply the same change in `lib/topic-broadening.ts`.

**Step 4:** Add `OPENALEX_API_KEY` to Vercel environment variables.

**Note:** The API remains free. The key is required only for authentication, not for paid access. The rate limits are credit-based (mapped more closely to actual costs per endpoint).

**Effort:** Trivial (10-minute change). **Risk if unaddressed:** OpenAlex calls will silently fail, making feasibility scores based only on PubMed and other sources — significantly degrading accuracy.

---

## 🔴 HIGH PRIORITY: Confirmed Carry-Forward Items from Handoff 053

### UI-5 — PICO Pre-fill Display on Results Page

**What:** PICO fields are now stored in the `searches` table (PICO-1, handoff 052). Handoff 053 explicitly recommended: *"PICO pre-fill on results page — PICO fields are now stored; surface them in a collapsible 'Search parameters' row on the results header."*

**Why it improves accuracy:** Researchers running a PICO-mode search need to see their PICO elements alongside results to verify the search parameters. Without display, the stored PICO data is invisible and unused by the researcher — wasting the work done in handoff 052.

**Implementation:**
- In `app/results/[id]/page.tsx`, `SELECT` `pico_population`, `pico_intervention`, `pico_comparison`, `pico_outcome` from the `searches` join (already available via `searches (query_text, pico_population, pico_intervention, pico_comparison, pico_outcome)`)
- Pass them as props to `ResultsDashboard`
- Add a collapsible `<details>` row in the results header (below the search query title) that shows the four PICO elements as labeled pills when at least one is non-null
- If none are non-null (plain-text search), don't render the row at all

**Effort:** Low — data is already stored; purely a UI display change.

---

### UI-6 — Scopus Count in Source Breakdown Card

**What:** Scopus was integrated as the 5th source in handoff 053, and `scopus_count` is now stored in `search_results`. Handoff 053 explicitly recommended: *"Scopus count in UI source breakdown — The per-source breakdown card (UI-1) could show Scopus alongside PubMed/OpenAlex/EuropePMC once `scopus_count` is populated."*

**Implementation:**
- In `ResultsDashboard.tsx`, in the per-source breakdown section (UI-1), add a Scopus row alongside PubMed / OpenAlex / EuropePMC
- Use `SOURCE_STYLES["Scopus"]` badge styling (add indigo palette: `bg-indigo-50 text-indigo-700 border-indigo-200`)
- Show `—` when `scopus_count` is null (pre-migration or API unavailable)

**Effort:** Low.

---

## 🔴 HIGH PRIORITY: INPLASY Registry Gap

### ACC-11 — INPLASY Registry Check

**What:** The OSF registry comment in `lib/osf-registry.ts` states the check *"closes the coverage gap left by PROSPERO + INPLASY alone"* — implying INPLASY is already checked. **It is not.** Searching the entire codebase finds no `inplasy` function or API call. INPLASY (International Platform of Registered Systematic Review and Meta-analysis Protocols) has 2,370+ registered protocols as of 2026, making it the #2 registry by volume after PROSPERO.

**Why this matters for accuracy:** A researcher may see no PROSPERO or OSF match and assume their topic is unregistered, when an active INPLASY registration exists. INPLASY is particularly used in East Asian academic contexts (China, South Korea, Japan) and medical topics.

**API:** INPLASY has a web search endpoint: `https://inplasy.com/?s=<query>` — no formal API, but a JSON endpoint exists at `https://inplasy.com/wp-json/wp/v2/posts?search=<query>&per_page=5`. Alternatively, use their `https://inplasy.com/search/<query>/` page with HTML parsing.

**Implementation:**
- Add `lib/inplasy.ts` with `searchINPLASY(query: string): Promise<number>` — similar pattern to `lib/osf-registry.ts`
- Use the WordPress REST API endpoint at `https://inplasy.com/wp-json/wp/v2/posts?search=<query>&per_page=5` and extract `x-wp-total` from response headers for the count
- Run in parallel with PROSPERO and OSF in `app/api/search/route.ts`
- Store as `inplasy_count` in `search_results` (new Supabase migration)
- Surface in the registry panel in `ResultsDashboard.tsx` alongside PROSPERO + OSF

**Effort:** Low — follows the exact same pattern as OSF registry (handoff 046).

---

## 🟡 MEDIUM PRIORITY: New Accuracy & Reliability Improvements

### ACC-12 — Gemini Gap Analysis Input Freshness Indicator

**What:** The Gemini gap analysis prompt includes existing reviews fetched at search time — but the analysis result is cached permanently in `search_results.gap_analysis`. If a topic is searched again 6 months later, the displayed gap analysis is based on the original search's review set, which may be stale. Researchers have no way to know when the underlying AI analysis was generated.

**Proposed behavior:**
- Add `gap_analysis_generated_at` timestamp column to `search_results` (set on first AI analysis run in `app/api/analyze/route.ts`)
- In `ResultsDashboard.tsx`, show a small "Analysis generated on [date]" note near the AI confidence badge
- If the analysis is older than 6 months, show a "Refresh analysis" button that clears `gap_analysis` (setting it back to null) and re-triggers `app/api/analyze/route.ts`

**Why it improves accuracy:** The existing cache-freshness warning (handoff 034) handles the search result cache (primary study count, existing reviews list). But `gap_analysis` is never refreshed — even when the search result itself gets refreshed. This closes that loop.

**Effort:** Low-Medium.

---

### ACC-13 — Study Design Confidence Calibration for Low-Count Ranges

**What:** The `recommendStudyDesign()` function in `lib/study-design.ts` maps feasibility scores to recommended review types. For topics near thresholds (e.g., exactly 6 or exactly 11 studies), the recommendation "flips" sharply: 10 studies → "Scoping Review" but 11 studies → "Systematic Review / Meta-Analysis." This binary flip is methodologically appropriate but can be jarring and misleading.

**Proposed improvement:** For topics within ±2 of a threshold boundary (e.g., 9–13 studies near the Moderate/High boundary, or 4–7 near the Low/Moderate boundary), add a brief "borderline" note to the study design rationale:
> *"With 10 primary studies, this topic is near the Moderate/High boundary. If additional studies are found during your search, a full systematic review may be feasible."*

This requires no API changes — it's a pure `lib/study-design.ts` text enhancement using the already-available `primary_study_count`.

**Effort:** Trivial — a string interpolation change in `study-design.ts`.

---

### ACC-14 — Verify AI-Suggested Topic Titles Against PubMed MeSH Vocabulary

**What:** Gemini generates suggested review titles like *"Cognitive Behavioral Therapy for Insomnia in Elderly Patients with Comorbid Anxiety"*. The `pubmed_query` field is already verified (ACC-4), but the **title** is not checked against PubMed MeSH vocabulary. Occasionally Gemini invents non-standard terminology (e.g., "Neuro-psychological intervention" instead of "Neuropsychological intervention"), which could mislead researchers when they formulate their own searches.

**Proposed improvement:**
- After generating the gap analysis, extract the key noun phrases from each suggested title
- Run a lightweight MeSH lookup using PubMed's `esuggest` endpoint: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=mesh&term=<phrase>&retmax=1`
- If a phrase returns 0 MeSH results and 0 PubMed title results, flag it with a small `⚠ Non-standard term` badge on the suggested topic card
- No changes to the feasibility score; purely an informational indicator

**Effort:** Low — `lib/pubmed.ts` already has the `esearch()` helper; this is a new lightweight call. The UI badge is a small addition to the suggested topic card in `ResultsDashboard.tsx`.

**Impact:** Directly supports the accuracy goal — prevents researchers from starting with a poorly-formed search query.

---

### ACC-15 — Cross-Source Confidence Score (Triangulation Quality Indicator)

**What:** Blindspot now queries 5 sources (PubMed, OpenAlex, EuropePMC, Semantic Scholar, Scopus). The ID-based deduplication (handoff 053) computes a `dedupFraction` from up to 800 sampled IDs. But the UI never surfaces how consistent the sources are. A topic where all 5 sources return similar counts is more confidently measured than one where PubMed says 5 and OpenAlex says 500.

**Proposed metric:** Compute a cross-source coefficient of variation (CV = std_dev / mean) across source counts. Show it as a "Source agreement" indicator on the primary study count row:
- CV < 0.3 → ✓ Sources agree
- CV 0.3–0.8 → ~ Sources vary (interpret with caution)
- CV > 0.8 → ⚠ High source disagreement (check broad query warning)

**Why it matters:** High disagreement often indicates the query is too broad (triggering OpenAlex's massive coverage while PubMed is specific). The wide-query warning (handoff 037) already handles some of this, but the CV gives a quantitative signal.

**Effort:** Low — all source counts are already available in the search result row. Pure computation + display.

---

## 🟡 MEDIUM PRIORITY: New Features

### NEW-8 — Living Systematic Review Detection

**What:** "Living systematic reviews" (LSRs) are continuously updated reviews that incorporate new evidence as it emerges. They are increasingly common in clinical research (BMJ, Cochrane, and Campbell all have LSR programs). A researcher who identifies a "gap" may not realize an LSR already covers that gap with rolling updates.

**How to detect:** Search for the phrase `"living systematic review"` or `"living review"` in the title/abstract alongside the topic query. PubMed supports this: add `"living systematic review"[tiab]` to the query. PROSPERO also flags LSRs in their registration status.

**Implementation:**
- In `lib/pubmed.ts`, add `countLivingReviews(query: string): Promise<number>` — appends `AND "living systematic review"[tiab]` to the existing review query
- Run in parallel with other searches in `app/api/search/route.ts`
- If count > 0: show an informational banner in `ResultsDashboard.tsx`: *"[N] living systematic review(s) found on this topic — these are continuously updated and may already address the gaps identified."*
- This is an informational indicator, not a feasibility gate

**Effort:** Low — `lib/pubmed.ts` already has `countSystematicReviews()`; this is a simple variant.

**Impact:** High for clinical researchers who may otherwise invest months in a gap that a living review is already addressing.

---

### NEW-9 — Evidence Gap Map (EGM) Visualization Tab

**What:** Evidence Gap Maps (EGMs) are an established evidence synthesis output: an intervention×outcome matrix where cells are filled based on study density. The 2024 Cochrane systematic review of EGM methodology shows that matrix/bubble-plot designs are now the dominant format (surpassing bubble plots since 2019). Blindspot's gaps tab shows cards — adding an optional matrix view would let researchers see the "shape" of the evidence in one view.

**Proposed implementation:**
- Add a "Map" tab alongside Reviews / Gaps / Design / PRISMA in `ResultsDashboard.tsx`
- The matrix has rows = gap dimensions (Population, Methodology, Outcome, Geographic, Temporal, Theoretical) and columns = feasibility tiers (High / Moderate / Low / None)
- Each cell shows the count of suggested topics at that dimension × feasibility intersection
- Clicking a cell filters the Gaps tab to show only those gaps (same toggle logic as existing dimension filters)

This is pure client-side rendering from already-loaded data — no new API calls.

**Effort:** Low-Medium (SVG/table rendering only; data is already loaded).

---

### NEW-10 — PRISMA-AI Extension Compliance Checkbox

**What:** A PRISMA-AI extension is in active development (as of early 2026, based on announcements from the PRISMA group). It will require AI-assisted systematic reviews to explicitly report: which AI tools were used, at which stages, what prompts were used, and how AI outputs were validated. Blindspot's protocol generator already creates a protocol template — extending it with a PRISMA-AI checklist section would future-proof outputs for when the extension is finalized.

**Implementation:**
- Add a "PRISMA-AI Checklist" section to the generated protocol (in `lib/prompts.ts` `buildProtocolPrompt()`)
- The section lists the AI-assisted steps Blindspot performs (gap analysis via Gemini, feasibility scoring via data APIs) with checkboxes for researchers to fill in their validation steps
- Reference: PRISMA-AI extension (in development) + Cochrane RAISE 3

**Effort:** Low — a static text addition to `buildProtocolPrompt()`.

---

### NEW-11 — Semantic Scholar Rate-Limit Hardening

**What:** Semantic Scholar has been progressively tightening its rate limits. In 2026, unauthenticated users share a 5,000 requests/5-minute pool. Key requests from free email domains can no longer be approved. The current `lib/semanticscholar.ts` makes bare requests with no retry logic or exponential backoff — a rate limit hit causes a hard failure that propagates to the search result.

**Proposed fix:**
- Add exponential backoff with 3 retries to `lib/semanticscholar.ts` for 429 (Too Many Requests) responses
- If all retries fail, log the failure and return 0 (graceful degradation) rather than propagating an error
- In `ResultsDashboard.tsx`, if `semantic_scholar_count` is null (failed), show `—` in the source breakdown card rather than `0` (to distinguish "not found" from "API unavailable")

**Effort:** Low (retry wrapper + graceful null handling).

---

## 🟢 LOWER PRIORITY: Remaining Backlog

### From handoff 053 (carry-forward, not yet noted in a market research doc):

1. **[Low] Apply Supabase migrations 015 + 016 to production** — `osf_registrations_count` and `scopus_count` columns. The fallback handles it gracefully but these should be applied.

2. **[Low] Scopus API key rotation plan** — The `ELSEVIER_API_KEY` is hardcoded in `.env.local`. Add a note to the About/Methodology page that Scopus coverage requires an institutional Elsevier subscription and note the key's expiry date if known.

3. **[Medium] Team / Collaboration features** — Shared workspaces, commenting on gaps, role-based access. High long-term value for institutional adoption. Covidence and Rayyan dominate here. Remains high-effort future work.

4. **[Low] Animate gap badge appearance on tab switch** — Subtle stagger fade-in when the Gaps tab is activated. Low-effort polish.

---

## Competitive Intelligence Update (May 2026)

| Development | Implication for Blindspot |
|-------------|--------------------------|
| **Cochrane AI Platform Study finalized (Laser AI + Nested Knowledge selected, ~48 submissions)** | These tools focus on post-retrieval screening, not pre-retrieval gap analysis. Blindspot's feasibility-scoring niche remains distinct. No competitive overlap. |
| **PRISMA-AI extension in active development (PRISMA Group, 2026)** | Build NEW-10 (PRISMA-AI checklist in protocol generator) to be ready when extension is finalized. |
| **OpenAlex API now requires API keys (Feb 13, 2026)** — email polite pool discontinued | **CRITICAL BUG** — fix CRIT-1 immediately. Free key at `openalex.org/settings/api`. |
| **OpenAlex now hosts 60M+ open-access PDFs with bulk download CLI** | Not immediately actionable, but opens possibility of abstract-level full-text search for gap analysis (future feature). |
| **Semantic Scholar: key requests from free email domains no longer approved** | Apply for an API key with institutional email before rate limits tighten further. Add exponential backoff (NEW-11). |
| **SciSpace 2026: real-time collaboration + customizable templates** | Blindspot lacks multi-user collaboration (high-effort). Template customization for PICO forms could be a lower-effort response. |
| **EGM methodology: matrix design now dominant format (2024 Cochrane SR)** | Build NEW-9 (Evidence Gap Map tab). The matrix design resonates with how systematic reviewers think about their field. |
| **3ie, Campbell, and IARC all use interactive EGMs for policy work** | Validates NEW-9 as a feature that would appeal to institutional/policy-focused users. |
| **JMIR 2026 scoping review: 388 AI evidence synthesis tools identified** | Crowded market at the screening/extraction phase; Blindspot's pre-selection / feasibility niche remains underserved. |

---

## Recommended Build Order for Daily Improver

Priority order based on the stated focus (accuracy/reliability + feasible alternative suggestions) plus confirmed bugs:

1. **CRIT-1 — OpenAlex API Key Migration** ← HIGHEST PRIORITY. Confirmed breaking change (Feb 13, 2026). Update `lib/openalex.ts` and `lib/topic-broadening.ts` to use `api_key=` instead of `mailto=`. Add `OPENALEX_API_KEY` to env. Get free key from `openalex.org/settings/api`. 10-minute fix, critical to prevent data quality degradation.

2. **UI-5 — PICO Pre-fill on Results Page** ← Carry-forward from handoff 053 (explicitly recommended). Data already stored (PICO-1). Low-effort display change in `app/results/[id]/page.tsx` + `ResultsDashboard.tsx`.

3. **UI-6 — Scopus Count in Source Breakdown Card** ← Carry-forward from handoff 053 (explicitly recommended). `scopus_count` already stored. Add indigo-palette badge alongside existing PubMed/OpenAlex/EuropePMC entries.

4. **ACC-11 — INPLASY Registry Check** ← Coverage gap: INPLASY (2,370+ protocols, #2 registry) is commented as "already covered" but never actually queried. Low effort, follows the exact OSF pattern (handoff 046). Create `lib/inplasy.ts`.

5. **NEW-11 — Semantic Scholar Rate-Limit Hardening** ← Risk mitigation. Tightening rate limits mean unhandled 429s may be causing silent failures. Add retry + exponential backoff + graceful null return.

6. **ACC-13 — Borderline Study Count Note in Study Design** ← Trivial effort. Prevents the sharp recommendation "flip" from being jarring for topics exactly at a threshold boundary.

7. **ACC-12 — Gap Analysis Freshness Indicator + Refresh Button** ← Completes the cache-freshness loop (handoff 034 handled search results; this handles the AI analysis). Medium effort but directly addresses reliability.

8. **NEW-8 — Living Systematic Review Detection** ← Low effort (one new PubMed query variant). High impact for clinical researchers who might otherwise duplicate a continuously-updated review.

9. **ACC-15 — Cross-Source Confidence Score** ← CV-based "Sources agree" indicator using already-available per-source counts. Low effort, improves result interpretation.

10. **ACC-14 — MeSH Vocabulary Check on AI-Suggested Titles** ← Low effort (reuse `esearch()`). Non-standard terminology flag prevents misleading searches.

11. **NEW-9 — Evidence Gap Map Visualization Tab** ← Medium effort. High impact for institutional users and policy researchers. Pure client-side rendering from already-loaded data.

12. **NEW-10 — PRISMA-AI Extension Checklist in Protocol** ← Low effort (static text addition to `buildProtocolPrompt()`). Future-proofs protocol output.

---

## Technical Notes for Daily Improver

**CRIT-1 (OpenAlex API Key):**
- New API key parameter: `api_key=YOUR_KEY` as a URL query param (same as `mailto=` placement)
- Both `lib/openalex.ts` and `lib/topic-broadening.ts` use `OPENALEX_EMAIL` — both must be updated
- Env variable rename: `OPENALEX_EMAIL` → `OPENALEX_API_KEY`
- After adding to Vercel env vars, the polite pool's `mailto=` can be fully removed

**UI-5 (PICO display):**
- `app/results/[id]/page.tsx` selects `searches (query_text)` — expand to `searches (query_text, pico_population, pico_intervention, pico_comparison, pico_outcome)`
- Render as a collapsible `<details>` element with `<summary>Search parameters</summary>` — matches the existing collapsible pattern used in the KeyboardShortcutsHelp component
- Only render when at least one PICO field is non-null and non-empty

**ACC-11 (INPLASY):**
- WordPress REST API: `GET https://inplasy.com/wp-json/wp/v2/posts?search=<query>&per_page=5`
- The `X-WP-Total` response header gives the full count without fetching all records
- Add `inplasy_count` column: `supabase/migrations/017_inplasy_count.sql`
- Follow the identical fallback pattern used in `lib/cache.ts` for `osf_registrations_count`

**NEW-11 (Semantic Scholar hardening):**
- Add a `withRetry(fn, maxAttempts=3)` wrapper in `lib/semanticscholar.ts` that sleeps exponentially (1s, 2s, 4s) on 429 responses
- If `semantic_scholar_count` is null in `ResultsDashboard.tsx`, show `—` (en-dash) in the source breakdown badge

**`npx tsc --noEmit` and `npx eslint`** remain the verification commands (`npm test` and `npm run build` blocked by rollup ARM64 binary mismatch per prior handoffs).

---

## Summary of Focus Area Assessment

The stated focus — "accuracy and reliability: say if an idea is not possible, suggest feasible related topics from real API data" — has been substantially implemented across handoffs 027–053. The landscape as of May 2026:

**Fully addressed:**
- Hard gate for insufficient evidence (ACC-1: <3 studies blocks AI analysis)
- InsufficientEvidencePanel with actionable paths (broader query, scoping review, primary study registration)
- AlternativesSection for both Insufficient AND Low feasibility (ACC-2 completion)
- PubMed-verified study counts on all AI-suggested topics (ACC-4)
- AI confidence badge tied to review count (ACC-3)
- OpenAlex taxonomy + semantic search fallback for alternative topics (ACC-7)
- Date-filtered feasibility to avoid misleadingly-High scores from old evidence (ACC-8)

**Remaining gaps in this focus area (addressed above):**
1. OpenAlex API is about to break (CRIT-1) — would degrade all accuracy features
2. INPLASY registry unchecked despite being the #2 registry (ACC-11)
3. AI gap analysis result is never freshness-checked or refreshable (ACC-12)
4. Border-zone study counts produce jarring design recommendation flips without explanation (ACC-13)
5. AI-suggested topic titles contain occasional non-standard terminology (ACC-14)
6. No indication of how consistent the 5 sources are with each other (ACC-15)
