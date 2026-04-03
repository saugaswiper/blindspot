# Market Research Update: Blindspot Accuracy, Reliability & Improvement Opportunities
**Date:** 2026-04-03
**Prepared by:** Automated market research agent (third run)
**For:** Blindspot daily-improver agent

---

## Executive Summary

This document follows up on `spec/004-market-research.md` and `spec/008-market-research-update.md`. The focus of this iteration is **accuracy and reliability of results** — specifically:

1. The app must clearly communicate when a topic is not feasible due to insufficient evidence
2. When a topic is infeasible, the app must suggest genuinely viable alternative topics drawn from **actual API data** (not just AI conjecture)
3. New competitive intelligence and UI/UX improvements discovered since the last research run

---

## What Has Been Built (do not rebuild)

Based on reviewing spec/009 through spec/025, the following improvements from the prior market research have been implemented:

| Handoff | Feature |
|---------|---------|
| 009 | Search history dashboard |
| 010 | Onboarding tutorial / interactive first-use guide |
| 011 | Abstract preview for existing reviews |
| 012 | Deduplication count transparency + PRISMA flow diagram |
| 013 | PROSPERO + INPLASY registry check |
| 014 | AI-generated Boolean search string (integrated into gap analysis prompt) |
| 015 | "Start My Protocol" CTA with protocol generator |
| 016 | Protocol draft storage (persists across refresh) |
| 017 | Gap-type filter chips |
| 018 | Related topic suggestions (lib/related-searches.ts) |
| 019 | WCAG 2.1 AA color contrast fix |
| 020 | Modal focus trapping (WCAG SC 2.4.3) |
| 021 | Email alerts / living search (cron wiring) |
| 022 | Unsubscribe UI + dashboard alert status |
| 023 | Dark mode (full app) |
| 024 | Dark mode completion pass |
| 025 | Targeted review search (boolean query precision) |

---

## 🎯 PRIMARY FOCUS: Accuracy & Reliability of Results

### The Core Problem

Blindspot currently has two reliability gaps that undermine researcher trust:

**Problem 1 — AI still runs on insufficient evidence**
When a topic returns <3 primary studies (Insufficiency threshold in `lib/feasibility.ts`), Blindspot still sends the topic to Gemini for gap analysis. Gemini produces 6 gap dimensions and suggested review titles even when there is almost no literature to analyze. These AI suggestions are effectively hallucinated — they are not grounded in evidence because there is no evidence. Researchers who receive "High importance" gap suggestions on a topic with 2 primary studies may waste significant time pursuing a research direction that does not exist.

**Problem 2 — Suggested review topics from AI are not validated against real data**
In `lib/prompts.ts`, `buildGapAnalysisPrompt()` instructs Gemini to return `suggested_topics` each with a `pubmed_query` and a `feasibility` rating. However, these suggestions are never verified against the actual APIs. A topic marked as "high feasibility" by the AI may itself have insufficient evidence when queried. The AI's feasibility estimate is speculative; only an API query can confirm it.

---

## 🔴 HIGH PRIORITY: Accuracy & Reliability Improvements

### ACC-1 — Hard Gate: Block AI Analysis When Evidence is Insufficient

**What:** When `primaryStudyCount < 3` (the current `Insufficient` threshold in `lib/feasibility.ts`), do not invoke Gemini for gap analysis at all. Instead, show a clear, dedicated "Insufficient Evidence" screen.

**Current behavior:**
- Feasibility score shows "Insufficient"
- But the user can still click "Run AI Analysis" and get gap suggestions
- Those suggestions are generated from a literature base of 0–2 papers — effectively hallucinated

**Proposed behavior:**
- When score is Insufficient, disable the "Run AI Analysis" button entirely
- Show a dedicated callout: "⚠️ Not enough primary studies to identify meaningful gaps. A systematic review is not feasible on this exact topic."
- Immediately below, show a "Explore Related Topics" section (see ACC-2 below)
- Add a secondary message: "Consider running a scoping review to map whether primary research even exists on this question."

**Why this matters (research-backed):**
- The Cochrane Handbook notes that a systematic review with zero included studies is methodologically valid but only justifies a conclusion of "no evidence." Gap analysis from near-zero evidence is speculation, not synthesis.
- A 2025 study in Journal of Clinical Epidemiology found AI tools in evidence synthesis require human oversight precisely because AI cannot distinguish "no evidence" from "evidence of absence."
- Preventing AI generation on Insufficient topics also reduces Gemini API costs and improves response time for valid searches.

**Implementation notes:**
- In `app/api/analyze/route.ts`, check `primaryStudyCount` before calling Gemini. If < 3, return a structured error: `{ error: "insufficient_evidence", primaryStudyCount, message: "..." }`
- In `components/ResultsDashboard.tsx`, detect this response and render the Insufficient Evidence UI instead of the gap analysis panel.
- The "Low" feasibility case (3–5 studies) should still allow AI analysis but include a prominent disclaimer: "Based on limited evidence (N studies). Results should be interpreted with caution."

---

### ACC-2 — Data-Grounded Alternative Topic Suggestions (API-Verified)

**What:** When a topic is Insufficient (or Low), suggest genuinely viable alternative topics that have actually been queried against PubMed/OpenAlex and confirmed to have sufficient evidence.

**The problem with the current approach:**
The existing `lib/related-searches.ts` generates related topic suggestions using AI (Gemini). These are purely language-model suggestions — the app does not verify that the suggested topics have sufficient studies. A researcher could click a "related topic" and get another Insufficient result.

**Proposed approach:**
1. When the main search returns Insufficient or Low feasibility, run a secondary "topic broadening" step:
   a. Extract the core concepts from the user's query (already done by `buildQueryString()`)
   b. Generate 4–6 candidate broadened/adjacent queries using one of two approaches:
      - **OpenAlex Topics hierarchy**: Query the OpenAlex `/works` endpoint with the original query, retrieve the top result's `primary_topic`, then fetch sibling topics at the same `subfield` level from the OpenAlex `/topics` endpoint. These sibling topics represent adjacent, evidence-rich research areas in the same field.
      - **PubMed MeSH expansion**: Use the NCBI E-utilities `esearch` endpoint with the query to retrieve MeSH terms, then query for broader/narrower/related MeSH terms using the NCBI MeSH API (`einfo` + `efetch`).
   c. For each candidate alternative query, run a lightweight PubMed count query (using the existing `searchPubMed` infrastructure in `lib/pubmed.ts`)
   d. Keep only alternatives that return ≥ 6 primary studies (Moderate threshold)
   e. Sort by study count, descending
2. Display the top 3–4 verified alternatives as clickable cards showing: alternative query text, study count, feasibility badge

**Why this is significantly better than current approach:**
- Every suggestion is backed by real data — the user sees "47 studies found" next to each suggestion
- Eliminates the trust-destroying experience of clicking a "related topic" and landing on another Insufficient result
- Uses the OpenAlex topics hierarchy which is specifically designed for this kind of research navigation (4,500 topics in domain > field > subfield > topic hierarchy)
- PubMed's MeSH hierarchy is the gold standard for medical/clinical concept navigation

**OpenAlex Topics API reference:**
- Endpoint: `https://api.openalex.org/topics?search=<query>` returns matching topics with `id`, `display_name`, `subfield`, `field`, `domain`, `works_count`
- Endpoint: `https://api.openalex.org/topics?filter=subfield.id:<id>` returns all topics in the same subfield
- The `works_count` field on each topic gives a real-time count of papers in that area
- This is free, no API key required (though polite_pool email header is recommended)

**Implementation notes:**
- New file: `lib/topic-broadening.ts` — exports `findFeasibleAlternativeTopics(query: string, originalCount: number): Promise<AlternativeTopic[]>`
- This function queries OpenAlex topics API, gets sibling topics, then verifies study counts via PubMed
- The function should return results within ~3 seconds (2–3 parallel PubMed calls)
- New UI: `components/InsufficientEvidencePanel.tsx` — renders when feasibility is Insufficient/Low, shows the alternatives panel

---

### ACC-3 — AI Confidence Level Tied to Study Count

**What:** Add a visible confidence indicator to the AI gap analysis showing how many studies the AI actually analyzed (not just "found").

**Background:**
- `buildGapAnalysisPrompt()` sends up to 20 existing reviews to Gemini (`reviews.slice(0, 20)`)
- The gap analysis quality degrades significantly when fewer studies are available
- Currently all gap analyses look identical regardless of whether they're based on 2 reviews or 200

**Proposed behavior:**
- Add a confidence badge to the gap analysis header:
  - `≥ 20 reviews analyzed` → "High Confidence"
  - `10–19 reviews analyzed` → "Moderate Confidence"
  - `5–9 reviews analyzed` → "Low Confidence"
  - `< 5 reviews analyzed` → "Very Low Confidence — interpret with caution"
- The badge should be visually distinct (color-coded, with a tooltip explaining the confidence system)
- Store `reviews_analyzed_count` in the `search_results` table alongside `gap_analysis`

**Implementation:**
- In `app/api/analyze/route.ts`, before calling Gemini, count `existingReviews.slice(0, 20).length` and pass it back in the response
- The confidence level is purely derived from this count — no additional AI call needed
- In `components/ResultsDashboard.tsx`, add the badge to the Gap Analysis tab header

---

### ACC-4 — Verify AI-Suggested Topics Before Display

**What:** Before showing AI-generated suggested review topics in the Gap Analysis tab, automatically run a lightweight feasibility check on each suggested topic's `pubmed_query` field.

**Background:**
- The gap analysis prompt in `lib/prompts.ts` asks Gemini to return `suggested_topics` with a `pubmed_query` and `feasibility` estimate
- Gemini's `feasibility` rating is a guess — it has no access to real study counts
- A user may see "CBT for insomnia in nursing home residents" with `feasibility: "high"` but if queried, it may return 0 studies

**Proposed behavior:**
- After receiving the Gemini response, run PubMed count queries for each suggested topic's `pubmed_query` (up to 5 parallel requests)
- Override Gemini's feasibility estimate with the actual API-based score using the same thresholds as `lib/feasibility.ts`
- Mark any suggested topic with < 3 studies as "Insufficient" with a note: "AI suggested this gap but insufficient primary research was found to support a systematic review at this time."
- Sort suggested topics by actual study count, not Gemini's guess

**Implementation:**
- In `app/api/analyze/route.ts`, after receiving the Gemini JSON, add a post-processing step that runs PubMed queries for each `suggested_topics[].pubmed_query`
- Use `Promise.allSettled()` for parallel execution (max 5 concurrent PubMed calls)
- Add `actual_study_count` and `verified_feasibility` fields to the `SuggestedTopic` type in `types/index.ts`
- In `components/ResultsDashboard.tsx`, display the verified count next to each suggestion and use `verified_feasibility` for the badge color

---

### ACC-5 — Explicit "No Systematic Review Possible" State

**What:** When the overall feasibility is Insufficient AND no viable alternative topics are found, show a definitive terminal state rather than empty UI.

**Current behavior:**
- User sees Insufficient score + empty gap analysis
- The UI looks broken/incomplete

**Proposed behavior:**
- Clear heading: "No systematic review is currently feasible on this topic"
- Explanation: "Blindspot searched PubMed, OpenAlex, and 3 other databases and found [N] primary studies. A minimum of 3 studies is needed for even a scoping review. The evidence base for this topic does not yet exist in the published literature."
- Two clear next-step options:
  1. "Try a broader topic" (with a search box pre-filled with a broader version of their query)
  2. "Explore related topics" (link to the alternative topics panel from ACC-2)
- Optional: "Consider registering a primary research study instead — this gap has no evidence base yet." with a link to ClinicalTrials.gov registration

---

## 🟡 MEDIUM PRIORITY: UI/UX Improvements

### UI-1 — Per-Database Study Count Breakdown

**What:** The current study count shows a single aggregated number (e.g., "127 primary studies found"). Users can't tell how many came from PubMed vs OpenAlex vs Europe PMC.

**Why it matters:**
- A 2025 study (Journal of Clinical Epidemiology) found OpenAlex had 98.6% recall vs PubMed's 93.0% for systematic review benchmarks — but OpenAlex's recall dropped from 96% to 94% in March 2025 due to closed access abstract removal
- Researchers need to know which databases contributed to have confidence in the count
- Deduplication count is now stored (handoff 012) — the per-database breakdown completes the transparency picture

**Implementation:** In `app/api/search/route.ts`, already tracking counts per source. Surface them in a small expandable detail under the main study count: "PubMed: 67 · OpenAlex: 81 · Europe PMC: 43 · Deduplicated total: 127"

---

### UI-2 — "Why This Score?" Explainer for Feasibility

**What:** Add a "?" icon next to the feasibility score that opens a tooltip/popover explaining the scoring methodology.

**Content for the explainer:**
- "Blindspot scores feasibility based on the number of primary studies in this area:"
- High (11+ studies): Strong evidence base for systematic review or meta-analysis
- Moderate (6–10 studies): Feasible for systematic review with narrative synthesis
- Low (3–5 studies): Consider a scoping review first
- Insufficient (<3 studies): Not enough evidence — primary research may be needed
- "Scores are based on real-time database queries, not AI estimation."

This directly addresses researcher concern about AI hallucination — clarifying that the feasibility score is data-driven, not AI-generated.

---

### UI-3 — Stale Cache Warning

**What:** Blindspot caches search results (see `lib/cache.ts`). A researcher returning to a 3-month-old result sees the old study counts as if they're current.

**Proposed:** Show a subtle "Last updated [date]" on the results page. If the result is older than 30 days, show a "Refresh" button that re-queries the APIs with the same parameters and updates the cache.

**Impact:** Directly relevant to accuracy — literature changes constantly; a cached count of "5 studies" may now be "12 studies."

---

## 🟢 LOWER PRIORITY: New Features

### NEW-1 — "Is This Review Already in Progress?" Persistent Indicator

**What:** The PROSPERO check (built in handoff 013) shows a one-time result. Researchers want a persistent indicator visible on the results summary (not buried in a tab).

**Solution:** Show a pinned badge on the result summary card: "PROSPERO: No match found" or "⚠ PROSPERO: 2 possible matches" — always visible without navigating to a tab.

### NEW-2 — Study Count Trend (Is the Field Growing?)

**What:** A static study count doesn't tell you if the field is growing (new gap emerging) or shrinking (paradigm dying). A growing field has more primary research being published recently.

**Solution:** When querying PubMed, run two sub-queries: (1) all time, (2) last 3 years. Show a trend indicator: "↑ Growing (38% of studies published in last 3 years)" or "→ Stable" or "↓ Declining." This gives researchers crucial context on whether a gap is emerging or historical.

**API feasibility:** PubMed's `datetype=pdat&mindate=2022&maxdate=2026` parameters support date-filtered counts with no extra cost. Easy to add to `lib/pubmed.ts`.

### NEW-3 — Boolean Search Operator Support in Simple Search Box

**What:** From handoffs 023 and 024, this is the #1 listed remaining feature. Let users type `AND`, `OR`, `NOT`, `"phrases"` directly in the simple search box. Parse client-side and build the structured query before API call.

**Implementation:** Parse the `TopicInput.tsx` field for uppercase boolean operators and quoted phrases. Existing `lib/boolean-search.ts` likely already has parsing logic.

---

## Competitive Intelligence Update (April 2026)

| Development | Implication for Blindspot |
|-------------|--------------------------|
| **Elicit added strict screening criteria + up to 80 papers per report (2026)** | Elicit is deepening into SR workflow. Blindspot's differentiation must be stronger on the pre-selection / feasibility phase. ACC-2 (verified alternative topics) is a concrete differentiator. |
| **SciSpace now has 280M papers and positions as "AI Super Agent"** | Feature parity race accelerating. Blindspot's niche (SR feasibility + PROSPERO check) must be clearly communicated. |
| **ResearchRabbit acquired by Litmaps (Nov 2025)** | Consolidation in the "literature discovery" space. Blindspot's "feasibility scoring" lane remains uncontested. |
| **OpenAlex coverage dropped from 96% to 94% recall in March 2025** due to closed-access abstract removal | Blindspot should note database coverage limitations in its methodology disclosure. Per-database counts (UI-1) become more important. |
| **INPLASY growing — now second largest SR registry** | Multi-registry check (PROSPERO + INPLASY) from handoff 013 is increasingly important. Consider surfacing INPLASY results more prominently. |
| **Cochrane Rapid Reviews group published position statement on AI (2025)** | Validates the need for human oversight messaging. Blindspot's "insufficient evidence" hard gate (ACC-1) aligns with Cochrane's guidance that AI must not run unsupervised on sparse evidence. |

---

## Recommended Build Order for Daily Improver

Priority order based on impact on accuracy/reliability (the stated focus) plus effort:

1. **ACC-1 — Hard gate on AI analysis for Insufficient topics** — Medium effort, extremely high trust impact. This is the #1 accuracy fix: prevent AI from generating gap analysis on topics with <3 studies.
2. **ACC-3 — AI confidence level tied to study count** — Low effort, high trust signal. Add confidence badge derived from number of reviews analyzed.
3. **ACC-4 — Verify AI-suggested topics against real API data** — Medium effort, high reliability fix. Override Gemini's feasibility guesses with actual PubMed counts.
4. **ACC-2 — Data-grounded alternative topic suggestions** — Medium-High effort, very high value. When a topic is infeasible, suggest verified alternatives using OpenAlex topics hierarchy + PubMed count checks.
5. **ACC-5 — Explicit "No SR Possible" terminal state** — Low effort, high UX clarity. Clean up the broken-looking Insufficient UI.
6. **UI-2 — "Why This Score?" explainer** — Low effort, high trust signal. Clarify that the score is data-driven not AI-generated.
7. **NEW-2 — Study count trend (field growing/declining)** — Low effort, high insight value. Uses existing PubMed date-filtered queries.
8. **UI-1 — Per-database study count breakdown** — Low effort, transparency win.
9. **UI-3 — Stale cache warning + refresh** — Medium effort, important for accuracy of returning users.
10. **NEW-3 — Boolean search operators in simple search box** — Low-medium effort, power user feature.
11. **NEW-1 — Persistent PROSPERO indicator on summary** — Low effort, discoverability win.

---

## Technical Notes for Daily Improver

- `lib/feasibility.ts` — contains `getScore()` thresholds. The Insufficient/Low/Moderate/High cutoffs (3/6/11) are consistent with published meta-analysis methodology literature (Cochrane: 2+ for meta-analysis; research consensus: 9–10 for reliable estimates; Blindspot's 11+ is conservative and well-calibrated).
- `lib/prompts.ts` — `buildGapAnalysisPrompt()` is where the AI instructions for gap analysis live. ACC-1 prevents this from being called on Insufficient topics.
- `app/api/analyze/route.ts` — the server route where Gemini is called. ACC-1 and ACC-4 changes go here.
- `lib/pubmed.ts` — existing PubMed search infrastructure. ACC-2 and ACC-4 reuse this for verification queries.
- OpenAlex Topics API endpoint: `https://api.openalex.org/topics?search=<query>` — free, no key required, add `mailto=school.dharmayu@gmail.com` to header for polite pool access.
- `types/index.ts` — `SuggestedTopic` type needs `actual_study_count?: number` and `verified_feasibility?: FeasibilityScore` fields for ACC-4.
- The `node_modules` cross-platform issue continues to block `npm test` and `npm run build` on the Linux sandbox. Lint (`npm run lint`) and TypeScript checking (`npx tsc --noEmit`) are the reliable verification steps.
