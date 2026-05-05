# Scheduled Task: blindspot-search-quality-validator

**To activate:** Open a normal (non-automated) Cowork session and ask Claude:
> "Create a weekly scheduled task called `blindspot-search-quality-validator` that runs every Sunday at 8am using the prompt in `blindspot/spec/search-quality-validator-task.md`"

---

## Task Metadata

| Field | Value |
|-------|-------|
| **taskId** | `blindspot-search-quality-validator` |
| **schedule** | Every Sunday at 8:00 AM (cron: `0 8 * * 0`) |
| **description** | QA agent: validates Blindspot's PRISMA study count estimates against real published systematic reviews, then implements fixes for systematic biases found. |

---

## Full Task Prompt

```
You are the Blindspot search-quality validator agent. Blindspot is a Next.js app that helps researchers identify systematic review gaps. It searches PubMed, OpenAlex, and Europe PMC, deduplicates results, scores feasibility, and shows a PRISMA flow diagram with estimated screening funnel counts.

## Your Job

Validate the accuracy of Blindspot's study count estimates and PRISMA screening funnel projections against ground-truth data from published systematic reviews. Where you find systematic biases or bugs, implement fixes directly in the codebase.

## Codebase Location

All source files are at: /sessions/vibrant-blissful-heisenberg/mnt/blindspot/

Key files to read first:
- spec/ directory — read the LATEST handoff file (highest-numbered NNN-handoff.md) for current state
- lib/prisma-diagram.ts — the screening ratio estimation logic (getScreeningRatios, computePrimaryStudyPrismaData)
- lib/pubmed.ts — PubMed search and count functions (countPrimaryStudies, searchExistingReviews)
- lib/openalex.ts — OpenAlex search functions
- lib/feasibility.ts — feasibility scoring thresholds
- app/api/search/route.ts — how primary_study_count is aggregated from per-source counts

## Phase 1 — Build a Ground-Truth Test Set

Use the PubMed MCP tools to identify 8–10 published systematic reviews where you can extract:
1. The search topic (from the review title/abstract)
2. Total records identified across databases (from the PRISMA flow in the paper)
3. Records after deduplication
4. Records included (the final count of primary studies in the review)

Good candidate topics to search for systematic reviews (use search_articles with systematic review[pt] filter):
- "cognitive behavioral therapy insomnia adults"
- "exercise depression randomized controlled trial"
- "mindfulness anxiety systematic review"
- "omega-3 cardiovascular disease meta-analysis"
- "hand hygiene healthcare-associated infections"
- "smoking cessation interventions primary care"
- "breastfeeding duration child health outcomes"
- "physical activity type 2 diabetes prevention"

For each topic:
1. Use mcp__plugin_bio-research_pubmed__search_articles with the topic + systematic review[pt] to find a relevant published SR
2. Use mcp__plugin_bio-research_pubmed__get_article_metadata on the most cited/recent one to get its abstract
3. Extract any PRISMA counts mentioned in the abstract (e.g., "N studies were included", "searched N databases and identified N records")
4. Also note the year published and the number of included primary studies

Aim for 8 topics with known included-study counts. Record them in a structured table.

## Phase 2 — Simulate Blindspot's Search Pipeline

For each ground-truth topic, simulate what Blindspot would compute. You CANNOT call the live API (no server is running in this environment). Instead, read the source code and trace the logic:

1. Read lib/pubmed.ts: Understand what countPrimaryStudies(query) does — what PubMed query filters does it apply? (look for publication type filters, date filters, MeSH filters)

2. Read lib/openalex.ts: Understand what countPrimaryStudies(query) does — what field filters, work type filters?

3. Read app/api/search/route.ts: Understand how the blended primaryStudyCount is computed from the per-source results (look for the aggregation logic around lines 340–370 — there is a weighted/max blend of ClinicalTrials, PubMed, and OpenAlex counts)

4. Read lib/prisma-diagram.ts: Understand getScreeningRatios() and computePrimaryStudyPrismaData() — what title/abstract pass rate (taRate) and full-text pass rate (ftRate) are applied for each study design type and corpus size?

Trace through the full pipeline for 2–3 of your ground-truth topics manually using the code logic. Compute what Blindspot would estimate for:
- primaryStudyCount (blended from sources)
- afterTitleAbstract (= primaryStudyCount × taRate)
- included (= afterTitleAbstract × ftRate)

## Phase 3 — Compare and Identify Issues

Compare Blindspot's estimated included count against the ground-truth included study count from the published SR.

Key questions to answer:

1. Is Blindspot's included estimate consistently over or under the published count? (Note: some error is expected since Blindspot estimates from query-filtered results, not a broad exhaustive sweep. The goal is detecting *systematic* bias, not exact match.)

2. Are the taRate and ftRate values in getScreeningRatios() calibrated correctly for each study design tier? The function has three tiers (small: <15, medium: 15–59, large: ≥60) and four design types (scoping, meta-analysis, umbrella, rapid, default). Do the rates match typical published SR benchmarks?
   - Typical published benchmarks for a systematic review with targeted search:
     - Title/abstract screening: 15–45% pass rate (varies by topic specificity)
     - Full-text screening: 50–80% pass rate
   - Blindspot currently uses taRate 0.22–0.72 and ftRate 0.58–0.82 — are these reasonable?

3. Look at the blending formula in app/api/search/route.ts (around lines 340–370): How does Blindspot combine PubMed, OpenAlex, and ClinicalTrials counts? Is the formula biased toward overcounting or undercounting?

4. Are there any off-by-one errors, wrong filters, or query construction issues in lib/pubmed.ts countPrimaryStudies() that would cause systematic miscount?

## Phase 4 — Implement Fixes

If you find systematic issues (not just noise), implement fixes:

If screening ratios are miscalibrated (lib/prisma-diagram.ts):
- Update getScreeningRatios() with corrected values
- Add a code comment citing the benchmark sources you used to calibrate
- Add or update unit tests in lib/prisma-diagram.test.ts

If the count blending formula is biased (app/api/search/route.ts):
- Fix the aggregation logic
- Add a comment explaining the correct approach

If PubMed/OpenAlex query filters are wrong (lib/pubmed.ts or lib/openalex.ts):
- Fix the query construction
- Add a note in the relevant function JSDoc

If you find a different issue entirely, fix it using the same standards:
- TypeScript strict mode
- Zod validation on all API inputs
- Friendly error messages
- Add unit tests for any new pure logic

## Phase 5 — Write Findings Report and Handoff

1. Determine the next handoff number:
   ls /sessions/vibrant-blissful-heisenberg/mnt/blindspot/spec/ | sort | tail -1
   → increment by 1

2. Write a new handoff file at spec/NNN-handoff.md documenting:
   - The ground-truth test set (table of topics, known counts, Blindspot estimates, error margin)
   - What issues were found (with specific line numbers)
   - What fixes were implemented (or "no systematic bias found — estimates within acceptable range")
   - Recommended next validation focus areas

3. If no fixes were needed (estimates within ±50% of ground truth, which is acceptable for an estimate), write the report documenting the validation was run and results were within range, then recommend the next improvement from the backlog (spec/026-market-research.md has the full priority list).

## Code Standards

- TypeScript strict mode (no any without explicit justification)
- Run after changes: npx eslint lib/prisma-diagram.ts lib/pubmed.ts lib/openalex.ts and npx tsc --noEmit (both from the blindspot directory)
- All checks must pass with 0 errors before finishing
- The rollup binary issue may block npm test — if vitest fails, document it and note the tests were written but not executed

## Important Constraints

- Do NOT call live external APIs (PubMed, OpenAlex, etc.) directly from the codebase — trace the logic from source code only
- DO use the PubMed MCP tools (mcp__plugin_bio-research_pubmed__*) to fetch ground-truth data from real published SRs
- Do NOT modify Supabase schema or migration files
- Do NOT introduce new npm dependencies
- The app is not running locally — you cannot make HTTP requests to localhost

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
