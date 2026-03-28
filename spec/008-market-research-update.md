# Market Research Update: Blindspot Improvement Opportunities
**Date:** 2026-03-28
**Prepared by:** Automated market research agent (second run)
**For:** Blindspot daily-improver agent

---

## Executive Summary

This document is a follow-up to `spec/004-market-research.md`. It:
1. Tracks which improvements from the original market research have been implemented
2. Reports new competitive intelligence from web searches conducted today
3. Prioritizes the remaining and newly discovered improvements for the daily-improver agent to work through

---

## Implemented Features (do not rebuild)

The daily-improver agent has already built the following from `spec/004-market-research.md`:

| # | Feature | Handoff |
|---|---------|---------|
| #2 | Shareable result links (no-auth public view) | `006-handoff.md` |
| #3 | Citation export (RIS / BibTeX) | `005-handoff.md` |
| #4 | ClinicalTrials.gov prominent display | `007-handoff.md` |

---

## Remaining Features from Original Market Research (still to build)

These are pending from `004-market-research.md`, ordered by impact/effort:

### 🔴 HIGH PRIORITY

**#1 — Search History Dashboard**
- Problem: Users lose past searches with no way to revisit or compare over time.
- Solution: A "My Searches" page listing past queries, their feasibility scores, timestamps, and links back to results.
- Effort: Low — data is already in Supabase (`search_results` table). Just needs a list-view page at `/dashboard` or `/history`.
- Impact: Very high on retention — core to making Blindspot a habit, not a one-time tool.
- Implementation notes: Fetch all `search_results` for the current user ordered by `created_at DESC`. Show: query text, feasibility score badge, primary study count, existing review count, date. Link each row to `/results/[id]`. Add a "Delete" affordance per row (soft-delete or hard-delete from Supabase). Add to the NavBar.

**#5 — PROSPERO Registry Check**
- Problem: Blindspot may surface "gaps" where a systematic review is already registered and in-progress on PROSPERO.
- New context (2026): PROSPERO updated in Feb 2025 and now shows "similar reviews" within its own UI. PROSPERO also now supports PDF protocol uploads and has faster processing. This makes the registry more complete and the check more valuable than ever.
- Also note: Researchers are now told to check PROSPERO **and** INPLASY **and** OSF before starting a review (see "New Opportunity #1" below). A PROSPERO-only check is still the highest-value starting point.
- Solution: Query the PROSPERO search endpoint (`https://www.crd.york.ac.uk/prospero/`) for the topic and surface a warning if any in-progress reviews are found.
- Effort: Medium — no official API, but the search page is scrapable via the search endpoint. Parse results for matching titles/topics.
- Impact: Very high credibility win. Prevents researchers from wasting months on a topic already being reviewed.

### 🟡 MEDIUM PRIORITY

**#6 — Email Alerts / Living Search**
- Problem: Research is continuous; users want to know when new systematic reviews publish on their saved topics.
- Solution: For saved searches, run a weekly diff against PubMed/OpenAlex and email the user if new results appear.
- Effort: Medium — cron job (can be a Vercel cron) + diff logic + email template (Resend or similar).
- Impact: High retention — transforms Blindspot from a one-shot tool into an ongoing companion.

**#7 — PRISMA Flow Diagram**
- Problem: Researchers writing review protocols need a PRISMA 2020 flow diagram documenting their search strategy.
- New context (2026): SciSpace has added an AI PRISMA flow diagram agent. Several standalone free generators now exist (prismaflowdiagramgenerator.com, Conceptviz, ESHackathon Shiny App). Blindspot already has all the numbers needed (PubMed count, OpenAlex count, deduplicated count, included reviews count). Building this natively keeps users in Blindspot rather than bouncing to external tools.
- Solution: After a search, generate a PRISMA 2020-compliant flow diagram as an inline SVG showing: records identified from databases (PubMed + OpenAlex), duplicates removed, records screened, records included. Export as SVG/PNG.
- Effort: Medium — pure SVG generation using the counts already stored. No new API calls needed.
- Impact: High institutional credibility — journals and Cochrane expect PRISMA diagrams.

**#8 — AI-Generated Boolean Search String**
- Problem: After identifying a gap, researchers need a formal Boolean search string to run in PubMed/Embase.
- New context (2026): AI-generated Boolean strings are now mainstream — PubMed.ai, ChatGPT, and several tools offer this. A 2025 PMC study found AI-generated strings have "moderate overlap" with expert-crafted strings but are not yet sufficient alone. The differentiator for Blindspot: use the PICO elements already collected to generate a structured MeSH-aware Boolean string, which is more systematic than free-text AI approaches.
- Solution: Add a "Generate Search String" button on the results page that calls Gemini with the query + PICO fields and returns a PubMed-formatted Boolean string (with MeSH terms and free-text synonyms). Display in a copyable code block.
- Effort: Medium — prompt engineering + UI. Gemini is already integrated.
- Impact: High practical value — researchers need this immediately after gap identification.

---

## New Improvement Opportunities (Discovered Today)

These are not in `004-market-research.md` and represent fresh opportunities based on today's research.

### 🔴 HIGH PRIORITY (New)

**NEW-1 — INPLASY Registry Check (alongside PROSPERO)**
- What: INPLASY (International Platform of Registered Systematic Review and Meta-analysis Protocols) is a growing registry that is now explicitly recommended alongside PROSPERO for pre-registration checks. Libraries and researchers are instructed to check PROSPERO, INPLASY, AND OSF before starting a new review.
- Why now: In the 2025 update to PROSPERO, researchers were directed to these multiple registries, making a single-registry check insufficient for credibility.
- Solution: When implementing the PROSPERO check (#5 above), also query INPLASY (`https://inplasy.com/`) for matching registered reviews. Display both results together under a "Registry Check" section.
- Effort: Low incremental addition to the PROSPERO check feature.
- Impact: High — makes the registry check more complete and future-proof.

**NEW-2 — Onboarding Tutorial / Interactive First-Use Guide**
- What: No competitor has good onboarding for first-time systematic reviewers. Blindspot's target users (PhD students, new researchers) often don't know what a PICO framework is or how to interpret a feasibility score.
- Evidence: UX research in 2025-2026 shows research democratization is accelerating — 70% of product/design teams now do their own research, and academic tools are seeing similar patterns with non-expert users entering systematic review workflows.
- Solution: Add a short 3-step interactive tour (using a library like Shepherd.js or a simple custom implementation) that triggers on first login: (1) explains the search box + PICO toggle, (2) explains feasibility scores, (3) shows the gap analysis tab. Dismissable, with a "Take the tour" link in the footer. Also add a persistent "?" help icon in the NavBar.
- Effort: Low-Medium — UI-only, no backend changes.
- Impact: High activation rate improvement — users who understand the tool on first use are far more likely to return.

### 🟡 MEDIUM PRIORITY (New)

**NEW-3 — Abstract Preview for Existing Reviews**
- What: When users see the list of existing systematic reviews, they must click out to PubMed/DOI to read the abstract. This breaks flow.
- Solution: Add expandable abstract rows (click row to expand inline abstract) in the Existing Reviews tab. Abstracts are already fetched and stored in the database from the PubMed/OpenAlex pipeline — just not displayed inline.
- Effort: Low — data already in DB, purely a UI change to `ResultsDashboard.tsx`.
- Impact: Medium — significantly reduces friction for users evaluating existing reviews.

**NEW-4 — Deduplication Count Transparency**
- What: The search pipeline deduplicates between PubMed and OpenAlex by normalized title, but users never see how many duplicates were removed. This is both a trust signal and required data for the PRISMA flow diagram (#7).
- Solution: Store `deduplication_count` in `search_results` (the number of records that appeared in both sources and were merged). Display it in the search stats header as "N duplicates removed." This also unblocks the PRISMA diagram generation.
- Effort: Low — the dedup logic is already in place in `app/api/search/route.ts`; just need to count and store it.
- Impact: Medium — builds trust; also unblocks PRISMA diagram feature.

**NEW-5 — Dark Mode**
- What: Researchers work in low-light environments late at night. Dark mode is now a baseline expectation for developer and researcher tools. Elicit, ResearchRabbit, and most competitors support dark mode.
- Solution: Implement via Tailwind's `dark:` variant + `next-themes` (or CSS `prefers-color-scheme`). The app uses a dark navy color scheme already; a true dark mode would invert the background/card contrast.
- Effort: Medium — requires touching most component files for `dark:` variants.
- Impact: Medium — quality-of-life improvement that signals product maturity.

**NEW-6 — "Start My Protocol" CTA After Gap Found**
- What: After finding a viable gap and deciding to pursue a systematic review, the researcher's next step is writing a protocol for PROSPERO registration. No tool currently bridges this gap in the workflow.
- Solution: Add a "Start Protocol" button on the Gap Analysis tab that generates a structured protocol outline (topic, rationale, PICO, proposed methods, search strategy) as a downloadable `.docx` or copyable Markdown block. Content is AI-generated from the gap analysis already run.
- Effort: Medium — Gemini is already integrated; prompt engineering + formatting.
- Impact: High workflow value — closes the loop from "found a gap" to "starting my review." Unique feature no competitor offers.

### 🟢 LOWER PRIORITY (New)

**NEW-7 — Keyboard Shortcuts for Power Users**
- What: Frequent users (PhD students running multiple searches per week) benefit from keyboard shortcuts: `R` to run analysis, `D` to download PDF, `1/2/3` to switch tabs, `S` to share.
- Effort: Low — `useEffect` + `keydown` listener.
- Impact: Low-Medium — improves power-user retention.

**NEW-8 — Accessibility Audit (WCAG 2.1 AA)**
- What: Universities and research institutions often require WCAG 2.1 AA compliance for tools used in academic workflows. This affects color contrast, keyboard navigation, ARIA labels, and focus management.
- Solution: Run an automated audit (axe-core) and fix violations. Key areas likely needing fixes: color contrast on gray text, focus trapping in modals, ARIA roles on the tab components.
- Effort: Low-Medium.
- Impact: Medium-High for institutional adoption.

---

## Competitive Intelligence Update (as of March 2026)

| Development | Implication for Blindspot |
|-------------|--------------------------|
| **Elicit launched a public API (March 3, 2026)** — search 138M+ papers, generate reports | Elicit is now developer-friendly; could be embedded in academic workflows. Blindspot should move faster on unique features (PROSPERO check, protocol generation) to widen its niche. |
| **Elicit added Research Agents (Dec 2025)** — autonomous competitive landscape + broad topic exploration | Elicit is expanding from screening into earlier-stage research discovery, which overlaps with Blindspot's niche. Differentiation on feasibility scoring + PROSPERO check becomes more important. |
| **Elicit added multi-tab search + Clinical Trials (Jan 2026)** | Elicit is integrating ClinicalTrials.gov — Blindspot just built this feature (#4). Good timing; continue differentiating on gap analysis depth. |
| **Cochrane selected Laser AI + Nested Knowledge for RAISE initiative** | Cochrane is actively validating AI in evidence synthesis. Positioning Blindspot as "Cochrane-compatible" and referencing the RAISE initiative in copy could boost institutional credibility. |
| **PROSPERO added "similar reviews" feature (Feb 2025)** | PROSPERO itself now surfaces similar in-progress reviews. Users who go to PROSPERO will see this; Blindspot should surface the same data so users don't need to leave. |
| **SciSpace launched PRISMA flow diagram agent** | A major competitor now generates PRISMA diagrams. Blindspot should build #7 soon. |
| **INPLASY growing as a PROSPERO alternative** | The systematic review registration landscape is fragmenting across PROSPERO, INPLASY, and OSF. A multi-registry check is now the right approach. |

---

## Recommended Build Order for Daily Improver

Based on effort/impact analysis and competitive urgency:

1. **Search history dashboard** (#1) — low effort, highest retention impact, no competitor has this built into gap-finding tools
2. **Deduplication count transparency** (NEW-4) — low effort, unblocks PRISMA diagram, builds trust
3. **Abstract preview for existing reviews** (NEW-3) — low effort, immediate UX win
4. **Onboarding tutorial** (NEW-2) — medium effort, high activation impact
5. **PRISMA flow diagram** (#7) — medium effort, now data is ready (with dedup count), competitive urgency (SciSpace has it)
6. **PROSPERO + INPLASY registry check** (#5 + NEW-1) — medium effort, high credibility, very unique feature
7. **AI-generated Boolean search string** (#8) — medium effort, high practical value, PICO-aware is differentiator
8. **"Start My Protocol" CTA** (NEW-6) — medium effort, unique workflow closure feature
9. **Email alerts / living search** (#6) — medium effort, high long-term retention
10. **Dark mode** (NEW-5) — medium effort, product maturity signal
11. **Keyboard shortcuts** (NEW-7) — low effort, power user retention
12. **Accessibility audit** (NEW-8) — medium effort, institutional adoption enabler

---

## Notes for Daily Improver

- The `node_modules` cross-platform issue (macOS modules on Linux arm64) blocks `npm test` and `npm run build`. This is a pre-existing blocker that requires deleting `node_modules` + `package-lock.json` and re-running `npm install` on the Linux machine.
- All pending Supabase migrations (#003 and #004) must be applied in Supabase Dashboard before deploying the shareable links and ClinicalTrials features built in `006-handoff.md` and `007-handoff.md`.
- Gemini 2.0 Flash is already integrated in `lib/gemini.ts` — new AI features should reuse this client.
- The PICO form fields are stored in the `searches` table — leverage them for the Boolean string generator and protocol generator features.
