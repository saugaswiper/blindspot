# Market Research: Blindspot Competitive Landscape & Improvement Opportunities
**Date:** 2026-03-28
**Prepared by:** Automated market research agent

---

## What Blindspot Is

Blindspot is a free web app for researchers who want to identify genuine systematic review opportunities. It:
- Searches PubMed + OpenAlex for existing systematic reviews on a topic
- Counts primary studies to gauge evidence base size
- Runs AI (Gemini 2.0 Flash) gap analysis across 6 dimensions: population, methodology, outcome, geographic, temporal, theoretical
- Produces feasibility scores (High / Moderate / Low / Insufficient)
- Suggests specific review titles and study designs
- Exports results as PDF or emails a formatted report
- Is completely free, no credit card required

Target users: academic researchers, PhD students, systematic reviewers, evidence synthesis teams.

---

## Competitive Landscape

### Direct Competitors

| Tool | Price | Key Strength | Key Weakness |
|------|-------|--------------|--------------|
| **Elicit** | Free–$780/mo | 138M papers, 99.4% extraction accuracy, up to 5,000 papers per review, PRISMA-style workflow | Expensive paid tiers; primarily for paper screening, not gap identification |
| **SciSpace** | Freemium | AI research gap finder, thematic analysis, Google Scholar integration | General-purpose, not specialized for systematic review feasibility |
| **ResearchRabbit** | Free (freemium since Nov 2025) | Visual citation networks, 270M paper database | Better for discovery than gap analysis; no feasibility scoring |
| **Scite.ai** | Paid | Smart citations (supported/contradicted/mentioned), 187M articles | Citation analysis, not systematic review planning |
| **Anara** | Freemium | 2M+ researchers, Q&A over uploaded literature | Requires uploading your own papers; not discovery-first |
| **Covidence** | Paid (institutional) | PRISMA flow diagrams, team collaboration, Cochrane-approved | Expensive; for screening phase, not topic selection |
| **Litmaps** | Freemium | Citation network visualization, reference gaps | Visual exploration, not structured gap analysis |
| **ResGap** | Unknown | Trends (salient/emergent/waning topics) | Limited gap-type taxonomy |
| **ChatGPT Deep Research** | $20/mo (Plus) | Broad internet research, up to 30 min autonomous runs | Not specialized; no PubMed/OpenAlex integration |
| **Consensus** | Freemium | Evidence-based answers with citations | Answer retrieval, not systematic review planning |

### Blindspot's Differentiators vs. Competitors

1. **Only tool that combines**: topic-level gap identification + feasibility scoring + study design recommendation in one workflow
2. **Completely free** — Elicit charges $120–$780/year for systematic review features
3. **6-dimension gap taxonomy** — more structured than competitors' generic "gaps"
4. **PICO form support** — structured input for clinical researchers
5. **One-click AI analysis** — no complex setup or multi-step workflow required

---

## Key Market Trends (2025–2026)

1. **AI in evidence synthesis is booming**: Cochrane, the gold standard for systematic reviews, is actively piloting AI-assisted evidence gap maps and building the RAISE initiative (Responsible AI in Evidence Synthesis). This validates Blindspot's core approach.

2. **OpenAlex coverage is superior**: A 2025 study showed OpenAlex has 98.6% coverage vs PubMed at 93.0% for a systematic review benchmark set. Blindspot is already leveraging both, which is a genuine strength.

3. **PRISMA compliance is now expected**: Journals and institutions expect PRISMA flow diagrams. Tools that generate them (Covidence) win institutional buy-in. Blindspot doesn't generate PRISMA outputs.

4. **Living evidence and alerts are a differentiator**: ResearchRabbit and Elicit offer research alerts for new publications. Researchers want to monitor topics over time, not just run one-time searches.

5. **Team collaboration is a growing need**: As institutional reviews and grant-funded research teams grow, tools need multi-user features. Most Blindspot sessions are single-user.

6. **Integration with PROSPERO is unmet**: No tool currently checks the PROSPERO registry (international register of systematic reviews in progress) automatically. This creates false-positive "gaps" when a review is already registered but not published.

---

## Top Improvement Opportunities (Prioritized)

### 🔴 HIGH PRIORITY — Quick wins that significantly improve core value

**1. Search History Dashboard**
- Problem: Users lose their past searches; there's no way to revisit or compare results over time.
- Solution: Add a "My Searches" page showing past queries, their feasibility scores, and links to results.
- Effort: Low (data already in Supabase; just needs a list view UI)
- Impact: High — dramatically improves retention and repeat usage

**2. PROSPERO Registry Check**
- Problem: Blindspot may surface "gaps" where a systematic review is already registered in PROSPERO (the international prospective register of systematic reviews in progress, ~100k+ entries).
- Solution: Query the PROSPERO API or scrape PROSPERO search results for the topic and show "⚠ A review may already be in progress" if matches found.
- Effort: Medium (PROSPERO has a search endpoint; parse results)
- Impact: Very high — prevents researchers from pursuing topics already being reviewed; adds major credibility

**3. Shareable Result Links (No-Auth)**
- Problem: Sharing results requires the recipient to sign up.
- Solution: Generate a public read-only URL for any result that works without login (with a small banner "Sign up to run your own searches").
- Effort: Low (toggle public flag in Supabase RLS; update results page)
- Impact: High — viral distribution; each share is a growth opportunity

**4. Citation Export (RIS/BibTeX)**
- Problem: After finding existing systematic reviews, users need to import them into Zotero, Mendeley, or EndNote.
- Solution: Add "Export references" button on the Existing Reviews tab that generates a .ris or .bib file from the found reviews.
- Effort: Low (format the existing review data into RIS format)
- Impact: Medium-High — removes a significant workflow friction point

### 🟡 MEDIUM PRIORITY — Meaningful expansions

**5. Email Alerts / Monitoring ("Living Search")**
- Problem: Research is continuous. Users want to know when new systematic reviews are published on their saved topics.
- Solution: For saved searches, send a weekly email digest if new PubMed/OpenAlex results appear since last check.
- Effort: Medium (cron job + diff logic + email template)
- Impact: High — transitions Blindspot from single-use to ongoing tool; big retention driver

**6. PRISMA Flow Diagram**
- Problem: Researchers writing review protocols need to document their search strategy including a PRISMA-style count of records identified/screened/included.
- Solution: After a search, generate a simple PRISMA 2020 flow diagram (as SVG or printable HTML) showing: records identified from PubMed (N), from OpenAlex (N), duplicates removed (N), records screened (N), included (N).
- Effort: Medium
- Impact: High — makes Blindspot outputs usable in actual review protocols; major credibility boost

**7. ClinicalTrials.gov Prominent Integration**
- Problem: The footer disclaimer mentions "Trial counts via ClinicalTrials.gov" but this data doesn't appear prominently in the results.
- Solution: Add a "Ongoing Trials" metric to the summary header and a mini-section showing active trials, which indicate gaps being actively filled.
- Effort: Low (data may already be available; just needs UI)
- Impact: Medium — important context for clinical researchers

**8. Confidence Score for Gap Analysis**
- Problem: All AI-generated gaps are presented equally, with only high/medium/low importance. Researchers can't tell how confident the AI is.
- Solution: Add an overall AI confidence score (e.g., "Based on N abstracts analyzed") and per-gap confidence indicators.
- Effort: Low (extract from Gemini response; update prompt to return confidence)
- Impact: Medium — increases trust in the AI output

**9. Gap Type Filtering / User Weighting**
- Problem: A methodologist cares about methodological gaps; a global health researcher cares about geographic gaps. Currently all are presented equally.
- Solution: Let users toggle which gap dimensions to emphasize before running analysis, or sort gaps by dimension.
- Effort: Low (UI filtering; minimal backend change)
- Impact: Medium

**10. "Similar Searches" / Related Topic Suggestions**
- Problem: Users often don't know what adjacent topic might have better gap potential.
- Solution: After showing results, surface 3–5 related topic suggestions (e.g., "CBT insomnia" → suggest "CBT insomnia pediatric", "CBT insomnia elderly") for easy pivot.
- Effort: Low-Medium (can be AI-generated from the gap analysis already produced)
- Impact: Medium — increases engagement and discovery

### 🟢 LOWER PRIORITY — Strategic / longer-term

**11. Team/Collaboration Features**
- Problem: Research teams need to share and comment on results.
- Solution: Allow sharing results with team members, adding notes/comments to gaps, and assigning gap topics to team members to investigate.
- Effort: High
- Impact: High long-term — enables institutional/team adoption

**12. PROSPERO Registration Export**
- Problem: After finding a viable gap, researchers need to register their review in PROSPERO before starting.
- Solution: Generate a pre-filled PROSPERO registration draft from the Blindspot report (topic, rationale, methods).
- Effort: Medium-High
- Impact: High — closes the loop from "found a gap" to "starting my review"

**13. Cochrane Library Integration**
- Problem: Cochrane reviews are the gold standard but Blindspot retrieves them via OpenAlex/PubMed metadata, which may be incomplete.
- Solution: Add direct Cochrane Library search via their API for more authoritative systematic review discovery.
- Effort: Medium
- Impact: Medium — improves completeness and credibility for clinical users

**14. Search Strategy Builder / Export**
- Problem: After identifying a topic, researchers need to build a formal Boolean search strategy for their actual systematic review.
- Solution: Use the AI to generate a draft Boolean search string (PubMed/Embase format) based on the query and PICO elements.
- Effort: Medium (prompt engineering + UI)
- Impact: High — highly practical output that researchers immediately need

---

## Key Personas to Target

1. **PhD Student** — Time-poor, needs to justify their dissertation topic. Values: free, fast, credible. Key need: proof that a gap exists + shareable link to show advisor.
2. **Clinical Researcher** — Evidence synthesis for grant applications. Values: PRISMA compliance, PROSPERO check, institutional credibility.
3. **Systematic Review Team Lead** — Coordinating 2–5 reviewers. Values: team sharing, saved searches, export formats.
4. **Evidence Synthesis Librarian** — Supporting researchers at universities. Values: methodology resources, PRISMA, citation export.

---

## Positioning Opportunity

Blindspot is uniquely positioned as the **"starting point"** of the systematic review lifecycle — helping researchers decide *what* to review before they invest months in the actual review. No competitor owns this exact niche:
- Elicit, Covidence, and Rayyan own the "conducting the review" phase
- ResearchRabbit and Connected Papers own the "exploring the literature" phase
- **Blindspot can own "should I do this review at all?"**

The clearest differentiation to lean into: **Feasibility scoring + PROSPERO check + AI gap analysis = evidence-based review topic selection**. This is a workflow no competitor offers end-to-end.

---

## Recommended Next Features (Ordered by Impact/Effort)

1. Search history dashboard (low effort, high retention impact)
2. Shareable result links (low effort, high growth impact)
3. RIS/BibTeX citation export (low effort, immediate workflow value)
4. ClinicalTrials.gov prominent display (low effort, already partially built)
5. PROSPERO registry check (medium effort, high credibility impact)
6. Email alerts / living search (medium effort, high retention)
7. PRISMA flow diagram (medium effort, high institutional credibility)
8. AI-generated Boolean search string (medium effort, high practical value)
