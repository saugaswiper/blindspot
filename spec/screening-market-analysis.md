# Screening Feature: Market Analysis
*Generated June 2026 — reference for iterative improvement of `components/ScreeningPanel.tsx`, `lib/screening.ts`, and related API routes.*

---

## 1. Competitive Landscape

### Rayyan (rayyan.ai)
**Market position:** Best-in-class free tier; most popular for individual researchers and small teams.

**What they do well:**
- **AI relevance ratings (1–5 stars):** After screening ~50–100 articles the AI surfaces a ranked list so reviewers work high-probability hits first, dramatically reducing time-to-decision.
- **ResearchPilot™ AI Reviewer:** The AI joins the review as a "team member", evaluates every article against explicit I/E criteria, and returns an Include / Exclude decision with detailed reasoning per criterion — not just a verdict.
- **Conflict surfacing:** Once blind screening ends, Rayyan instantly highlights disagreements (reviewer A included, reviewer B excluded) and lets teams discuss and resolve inline.
- **Claims 50–90% time reduction** in screening when AI is trained on a seed set.

**Key UX insight:** The AI is framed as a co-reviewer, not a filter. Conflicts between the AI and humans are treated as the most important articles to re-examine.

---

### Covidence (covidence.org)
**Market position:** Cochrane-endorsed; gold standard for rigorous multi-reviewer systematic reviews.

**What they do well:**
- **Blinded dual-reviewer workflow:** Votes are hidden from each other until both reviewers have decided, preventing anchoring bias.
- **Conflict resolution queue:** Any disagreement (yes/no, or different exclusion reasons in full-text) creates a "conflicts" list that requires explicit resolution — preventing silent overrides.
- **Full-text screening with structured exclusion reasons:** At the full-text stage, each exclusion must be tagged with a PRISMA-aligned reason code (wrong population, wrong intervention, etc.), which feeds directly into the PRISMA flow diagram.
- **Speed mode:** Single-key keyboard shortcuts (y/n/m) for high-velocity screening.

**Key UX insight:** Structured exclusion reason codes are critical — they power the PRISMA flow diagram and audit trail that journals/Cochrane require.

---

### DistillerSR (distillersr.com)
**Market position:** Enterprise / pharmaceutical / regulatory; handles 675,000+ reference projects.

**What they do well:**
- **AI prioritization sorts studies by predicted relevance** before the reviewer sees them — highest-yield first.
- **Custom screening forms** with branching logic: the form asks the next question only if the previous answer warrants it (e.g., if "correct population?" = No → immediately exclude, skip all other questions).
- **Level-of-evidence tagging** at the form level — so bias risk assessment is captured during screening, not as a separate step.
- **Audit-ready trails:** Every decision, edit, and conflict resolution is timestamped and attributed — critical for FDA/HTA submissions.
- **35–50% overall review time reduction; up to 70% screening time reduction.**

**Key UX insight:** The form-level branching logic is the most underrated feature in systematic review tooling — it eliminates the need to reason through all criteria when an early criterion already determines exclusion.

---

### ASReview (asreview.nl)
**Market position:** Open-source academic tool; best-in-class active learning.

**What they do well:**
- **Active learning loop:** The model re-trains after every human decision. It starts knowing almost nothing and rapidly becomes expert at identifying relevant articles for *that specific review*.
- **Stop criterion:** ASReview estimates when it's safe to stop screening (e.g., 95% recall threshold) — reviewers don't have to screen all records.
- **Transparent ML:** Logistic regression, Naïve Bayes, SVM, CNN; TF-IDF, BERT, Doc2Vec — all configurable. Published performance benchmarks on real datasets.
- **Simulation mode:** Replays a completed review to evaluate how much work active learning would have saved.

**Key UX insight:** A stop criterion (confidence that you haven't missed relevant studies) is something none of the commercial tools expose to users clearly. It reduces reviewer anxiety and wasted effort.

---

### SciSpace / Elicit
**What they do well:**
- Cohen's κ inter-rater agreement computed automatically after each calibration round.
- Calibration rounds: reviewers screen the same 10–20 articles first, compare results, and align on criteria before screening the full set.
- Low-probability fast-exclusion triage: bulk exclude items below a confidence threshold in one click.

---

## 2. What the Research Says (2024–2026)

### LLM performance for abstract screening
- **Sensitivity 1.000, precision 0.927, balanced accuracy 0.904** — LLMs outperform human reviewers on sensitivity (missing fewer relevant studies) in recent benchmarks (2025, *JAMIA*).
- GPT-4-class models and Gemini 1.5 Pro / Claude Sonnet 3.5 outperform earlier models significantly.
- **Key finding:** LLMs should reason through each criterion independently rather than producing a holistic judgment. Chain-of-thought (CoT) prompting ("think step by step for each criterion") significantly improves accuracy.
- **Ensemble LLMs** (majority vote across 3 models) outperform single-model screening on borderline cases.

### Responsible AI in Evidence Synthesis (RAISE guidance)
- All AI inclusion/exclusion decisions must remain subject to human review.
- Abstract screening should maximize sensitivity (err toward "include" when uncertain).
- Full-text screening can apply stricter criteria.
- **Uncertain ≠ exclude** — the standard practice is: if in doubt at title/abstract, keep for full-text.

### PRISMA compliance requirements
- Eligibility criteria must be documented in the protocol.
- The PRISMA flow diagram requires counts at each stage: identified → screened → excluded (with reasons) → assessed for eligibility → included.
- Exclusion reason codes are mandatory at the full-text stage.

---

## 3. Gap Analysis: Blindspot Screening vs. Best-in-Class

| Feature | Rayyan | Covidence | Blindspot (current) | Priority |
|---|---|---|---|---|
| Criteria suggested by AI from gap | ✗ | ✗ | ✅ | — |
| Per-criterion reasoning in AI decision | ✅ (ResearchPilot) | ✗ | ⚠ one-line reason | **High** |
| Stop/confidence threshold | ✅ (ASReview) | ✗ | ✗ | Medium |
| Structured exclusion reason codes | ✅ (full-text) | ✅ | ✗ | **High** |
| Active learning / re-rank on feedback | ✅ | ✗ | ✗ | Medium |
| Calibration round / inter-rater agreement | ✅ (SciSpace) | ✅ | ✗ | Low |
| Keyboard shortcuts for fast screening | ✗ | ✅ | ✗ | Low |
| Bulk exclude below confidence threshold | ✅ | ✗ | ✗ | Medium |
| Export decisions (CSV/RIS) | ✅ | ✅ | ✗ | **High** |
| PRISMA flow diagram integration | ✗ | ✅ | Partial (PrismaFlowDiagram exists) | **High** |
| Audit trail (who decided, when) | ✅ | ✅ | ✗ | Medium |
| "Uncertain" treated as include-pending | ✅ | ✅ | ✅ | — |
| Chain-of-thought per criterion | ✅ (ResearchPilot) | ✗ | ✅ | **High** |
| Confidence score per decision | ✅ | ✗ | ✗ | Medium |

---

## 4. Prioritized Improvements (Backlog for Iterative Agent)

### Tier 1 — High Impact, Achievable in Screening Prompt/Component

1. ✅ DONE — **Chain-of-thought per criterion:** Modify `buildScreeningPrompt` in `lib/screening.ts` so Gemini evaluates each inclusion/exclusion criterion explicitly before delivering a final verdict. The response schema should include `criterion_results: [{criterion, met: bool, note}]`. Surface these in the `ScreeningPanel` results as expandable criterion-by-criterion reasoning.

2. **Structured exclusion reason codes:** Add a `reason_code` field to `ScreeningDecision` (types/index.ts) with codes like `wrong_population`, `wrong_intervention`, `wrong_outcome`, `wrong_design`, `wrong_timeframe`, `duplicate`, `not_systematic_review`, `insufficient_data`. Prompt Gemini to assign one. Display as a badge in the results table. These feed into PRISMA flow data.

3. **Export to CSV:** Add a "Download CSV" button to `ScreeningResultsTable` that generates a CSV of decisions (title, year, journal, decision, reason_code, reason) using `downloadTextFile` (already imported in `ResultsDashboard`). Researchers always need to export screening decisions for their PRISMA flow.

4. **PRISMA flow diagram integration:** The app already has `PrismaFlowDiagram` and `computePrimaryStudyPrismaData`. Feed screening counts (`included_count`, `excluded_count`) into the PRISMA diagram's "screening" stage so the flow reflects the AI screening run.

### Tier 2 — Medium Impact

5. **Confidence score per decision:** Add a `confidence: "high" | "medium" | "low"` field to the AI response. Surface it as a visual indicator. Low-confidence decisions are the ones a human should review first.

6. **Bulk action on confidence threshold:** In the results view, add a "Review uncertain + low-confidence items" filter/action — these are the items most worth a human second look.

7. **Gemini model upgrade path:** The prompt in `lib/screening.ts` uses `gemini-2.5-flash`. Evaluate `gemini-2.5-pro` for screening (higher reasoning quality on complex criteria) as a user-selectable option or automatic fallback for large review sets.

8. **Re-run with edited criteria:** After reviewing results, let users tweak criteria and re-run. Currently the "Re-screen ↺" button resets to idle. It should pre-populate the criteria editor with the last run's criteria for incremental edits.

### Tier 3 — Lower Priority

9. **Stop criterion / sufficiency indicator:** Show the % of reviews screened and estimate whether coverage is sufficient based on the rate of includes in recent decisions (if the last N decisions are all excludes, the screening is likely complete).

10. **Calibration round:** Before screening all reviews, let a second reviewer screen the first 10 and compare decisions — surfaces criteria ambiguity early.

---

## 5. Files to Modify for Each Improvement

| Improvement | Files |
|---|---|
| Chain-of-thought per criterion | `lib/screening.ts` (prompt + schema), `types/index.ts` (ScreeningDecision), `components/ScreeningPanel.tsx` (results UI) |
| Structured exclusion reason codes | `lib/screening.ts`, `types/index.ts`, `components/ScreeningPanel.tsx` |
| Export to CSV | `components/ScreeningPanel.tsx` only |
| PRISMA flow integration | `components/ResultsDashboard.tsx`, `lib/prisma-diagram.ts` |
| Confidence scores | `lib/screening.ts`, `types/index.ts`, `components/ScreeningPanel.tsx` |
| Re-run with pre-filled criteria | `components/ScreeningPanel.tsx` only |

---

*Last updated: 2026-06-09. Refresh quarterly or after major releases from Rayyan / Covidence.*

---

## 6. Improvement Log

### 2026-06-10 — Design-system alignment + one-click verdict UX (design critique pass)

- Added semantic status tokens to `app/globals.css` (`--success`, `--danger`, `--warning`
  + `-bg` pairs, light/dark variants tuned to the warm editorial palette). The screening
  panel previously used ~30 hardcoded Tailwind palette classes and raw hexes; the
  ReasonCodeBadge had no dark-mode variant at all (contrast failure on dark surfaces).
  All decision badges, filter chips, criteria chips, confidence dots, and the criterion
  table now style through tokens.
- Fixed a latent bug: decision-tinted row backgrounds (`bg-emerald-50/40` etc.) were
  always overridden by an inline `background: var(--surface)` and never rendered; rows
  now intentionally use a colored left border on the clean surface.
- One-click verdicts: Include/Exclude/Uncertain override buttons moved from inside the
  expanded "Why?" view to row level (24px targets, `aria-pressed`), halving the cost of
  working the needs-review queue (Covidence speed-mode insight).
- Copy honesty: "Screen ~N" (counts are estimates), filter empty-state no longer says
  "reviews" when screening primary studies; 9px text bumped to 10px; panel headings now
  use the DM Serif editorial face.

### 2026-06-10 — Human-in-the-loop overrides, needs-review triage, RIS export, re-screen flow

Goal: move from "AI screening report" to "automated systematic review workflow" per RAISE
guidance (all AI decisions remain subject to human review) and the Rayyan co-reviewer model.

- **Human override per decision** (`components/ScreeningPanel.tsx`, `types/index.ts`):
  every decision row now has Include / Exclude / Uncertain verdict buttons in the expanded
  view. An override sets `human_decision` + `human_decided_at` on the `ScreeningDecision`;
  the AI's original `decision` is preserved as the audit trail and shown as "(AI said: …)".
  Counts, filters, CSV, and RIS all use the effective verdict (`human_decision ?? decision`).
  Overrides persist immediately via `/api/screening/save`.
- **Needs-review triage queue** (Tier 2 #6): a "⚠ Needs review" filter chip surfaces
  records that are uncertain or low-confidence and not yet human-verified — the human only
  works the queue that matters. A progress note tracks remaining items and flips to
  "all flagged decisions reviewed" when the queue is cleared.
- **RIS export of included studies**: "↓ RIS (included)" button exports final-included
  records via the existing `toRis` helper for Zotero/EndNote — feeds the full-text stage.
  CSV export now includes AI Decision / Human Override / Final Decision / DOI / PMID columns.
- **Re-screen with pre-filled criteria** (Tier 2 #8): "Adjust criteria & re-screen" now
  pre-populates the criteria editor with the last run's criteria; Cancel returns to the
  previous results instead of discarding them.
- **RAISE sensitivity rule** (`lib/screening.ts`): screening prompt now instructs the model
  to prefer "uncertain" over "exclude" when in doubt at title/abstract stage.
- **Model upgrade path** (Tier 2 #7): screening model is now configurable via the
  `GEMINI_SCREENING_MODEL` env var (default `gemini-2.5-flash`; set `gemini-2.5-pro` for
  harder criteria sets).

Remaining from backlog: stop criterion / sufficiency indicator (Tier 3 #9), calibration
round + inter-rater agreement (Tier 3 #10), active-learning re-ranking (Tier 2, needs
seed-label loop), keyboard shortcuts for fast screening.

### 2026-06-09 — Chain-of-thought per criterion

Updated `buildScreeningPrompt` in `lib/screening.ts` to instruct Gemini to evaluate every inclusion and exclusion criterion individually before rendering a final verdict. The JSON response schema now includes a `criterion_results` array on each decision object, with fields `criterion` (verbatim criterion text), `type` ("inclusion"|"exclusion"), `met` (bool), and `note` (one-sentence explanation). Added the matching optional field `criterion_results` to `ScreeningDecision` in `types/index.ts` (optional for backward compatibility with existing saved results). Updated `ScreeningPanel.tsx` to render a compact per-criterion breakdown table inside the expanded "Why?" view — each row shows criterion text, type badge (green/red), a ✓/✕ met indicator, and the note. This brings Blindspot's screening reasoning quality on par with Rayyan's ResearchPilot feature and implements the RAISE-recommended chain-of-thought approach shown to improve screening accuracy.
