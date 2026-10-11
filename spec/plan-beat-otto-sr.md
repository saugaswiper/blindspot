# Plan: Beat Otto-SR

**Date:** 2026-10-11
**Type:** strategy plan (operator-requested). It orders future briefs. It is not a brief itself, and it moves no claim from `claimed` to `verified`.
**Reference target:** Otto-SR, the preprint "Automation of Systematic Reviews with Large Language Models" (Bobrovitz et al., medRxiv 2025.06.13.25329541; ISPOR 2026 poster).

---

## 0. What "beat" means

Otto-SR's published bar, from the developers' own validation (not independently replicated):

| Metric | Otto-SR | Dual human reviewers |
|---|---|---|
| Screening sensitivity | 96.7% | 81.7% |
| Screening specificity | 97.9% | 98.1% |
| Data-extraction accuracy | 93.1% | 79.7% |
| Cochrane reproduction | 12 reviews, median 0 wrongly excluded, 114 vs 64 eligible studies found | — |

**We beat Otto-SR when both of these hold:**

1. **Match its accuracy** on a benchmark built the same way (reproducing Cochrane reviews), reported per stage and against the same comparators.
2. **Beat it on what its paper can't show:**
   - **0 falsely `verified` values.** Every extracted number is backed by evidence on its page, so a fabricated number cannot pass.
   - **Full provenance.** Every inclusion, extracted value and risk-of-bias judgement links to the source page, and the user can see where the full text came from.
   - **The parts of a review around Otto-SR's scope:** feasibility before registration, predicting whether a network meta-analysis is possible, a protocol with explicit decisions plus a deviation tracker, and living updates.
   - **Cost and time per review**, published, so others can reproduce them.

**Honesty rule:** we can't run Otto-SR ourselves, so every comparison is against its *published* figures on a *different* review set. Say that every time. Never claim "beats Otto-SR" until the benchmark in Phase 0 runs.

---

## 1. Phase 0: Build the scoreboard first

Without a benchmark, "beat" is only a slogan. This comes before any new pipeline work.

**Brief 010 — Otto-bench harness.** Build `scripts/otto-bench/` and `spec/validation/otto-bench/`.
- **Truth sets:**
  - The **ketamine/TRD review**. It has 23 included studies, 99 full-text exclusions with reasons, and pooled estimates (`spec/field-report-ketamine-trd.md` §2).
  - **5 Cochrane intervention reviews of RCTs** whose "Characteristics of included/excluded studies", "Data and analyses" (per-trial numbers) and RoB tables are public. Mitchell 2012 can be the 6th. Cochrane's per-trial analysis data is the extraction truth set: the numbers come with the correct answer attached.
- **Metrics per stage:**
  - Screening: sensitivity and specificity at title/abstract and at full text.
  - Extraction: accuracy per value, plus the falsely `verified` rate.
  - Risk of bias: agreement per domain (κ).
  - Pooled-estimate reproduction: difference from the Cochrane estimate, and whether significance agrees.
  - Cost in $ and wall-clock time.
- **Output:** one scoreboard markdown table that every later brief re-runs and appends to. A stage that has no code yet scores "n/a". That's fine: the empty table is the roadmap.

---

## 2. Phase 1: Unblock the foundation

Each item is one brief or ops task. Run them in this order.

| # | Item | Why it matters for beating Otto-SR |
|---|---|---|
| 011 | **Import RIS/NBIB/CSV** (`lib/import.ts`, `app/api/import`), deduplicated with `lib/study-id.ts` | Real reviews search Ovid/Embase. Otto-SR's Cochrane runs began from the reviews' own searches. Import lets us start from the same records instead of competing on PubMed recall. |
| 008 | **EuropePMC pagination** (brief already written) | Brings our own search closer to the ≥95% recall bar; it's at 80% today. |
| ops | **Set `OPENALEX_API_KEY` in Vercel (CRIT-1)**, and restore the loop's CLI login | Without the key, two source chains (search and full text) are degraded. Without the login, the loop can't run briefs. |
| 012 | **Get the test suite back to green** (15 pre-existing failures) | Benchmark regressions are invisible while the baseline is red. |

---

## 3. Phase 2: Screening parity

**Brief 013 — Full-text screening stage.** After full-text retrieval, re-screen against the criteria using the full text. Each exclusion must carry a PRISMA reason code (the same codes as the ketamine set's 99 exclusions), and each decision quotes the passage that justifies it. Feed the counts into `PrismaFlowDiagram`.

**Brief 014 — Tune screening on the benchmark.**
- Title/abstract stage: maximise sensitivity, keeping the rule that "uncertain" means include.
- Try a stronger model and a 2-pass ensemble in place of single-pass `gemini-2.5-flash`, and pick whichever wins on Otto-bench.
- **Bars:** sensitivity ≥ 96.7% and specificity ≥ 95% at title/abstract; median 0 wrongly excluded studies per review.

---

## 4. Phase 3: Data extraction, the main battleground

Otto-SR's 93.1% is the headline number. We beat it on trust, by having no falsely verified values, and aim to match it on accuracy.

**Brief 015 — Full-text ingestion (needed before 009).** `lib/fulltext.ts` returns *URLs*, not text. Fetch and parse each full text into **page-indexed text plus parsed table grids**:
- PMC/EuropePMC JATS XML first. It has structured tables and no PDF parsing errors.
- PDF second, as text layer plus layout.
- Store the pages so check 1 ("the number appears on this page") has something to match against.
- **OCR fallback for scanned PDFs or ones with a broken text layer: `baidu/Unlimited-OCR`** (MIT licence, 3B MoE, outputs markdown with HTML tables plus bounding boxes; served with vLLM on a separate GPU worker, because Vercel can't host it). Rules:
  - The PDF's own text layer or the JATS XML always wins. OCR runs only when the text layer is missing or garbled.
  - A value whose *only* evidence is OCR output is capped at `check`, never `verified`. OCR is model-generated text, so a misread digit would otherwise pass check 1 as if it were in the source.
  - Use the OCR bounding boxes to locate each value on the page for the cropped-evidence UI (brief 016), even when the text layer supplied the value.

**Brief 009 — Extraction with the 4-check gate** (already written). Backend only.

**Brief 016 — Extraction review UI.** Show the cropped strip of the page beside each value. Group values by flag (`check`, `conflict`, `wrong_page`), confirm with one key, and mark human-confirmed values `human`. Save results by row so decisions survive re-extraction (adds a schema migration).

**Bars on Otto-bench:**
- **Falsely `verified` values = 0** (hard gate; it can never regress).
- Accuracy across all values ≥ 93.1%.
- At least 70% of values auto-`verified`, so humans review only the rest.
- Every value has provenance.

---

## 5. Phase 4: Risk of bias

**Brief 017 — RoB 2 assistant.** For each domain and each signalling question, give an answer plus a **verbatim supporting quote**. Check the quote with the same gate as extraction: it must appear on that page, or the answer drops to `check`. Domain judgements follow the RoB 2 algorithm deterministically rather than the model's overall impression. Produce the traffic-light plot.

**Bar:** domain-level κ against Cochrane's RoB tables at least as high as typical human inter-rater agreement for RoB 2, and 100% of judgements carry a checked quote.

---

## 6. Phase 5: Meta-analysis

**Brief 018 — Pairwise meta-analysis engine** (`lib/meta-analysis.ts`).
- Inverse-variance fixed and random effects (REML, with Hartung-Knapp-Sidik-Jonkman as an option); MD, SMD (Hedges g) and log RR/OR.
- I², τ² and a prediction interval; a forest plot.
- **Uses only `verified` or `human` values.** It logs each conversion with its Cochrane Ch 6 citation, keeping the rule that conversions happen in analysis, not extraction.
- Score-type guard: the HAM-D→MADRS equation applies to endpoint scores only (field report §3.3).

**Bar:** reproduce each Cochrane pooled estimate within ±0.05 SMD (or ±5% RR) using the same inputs, with significance agreeing in every review. Reproduce the ketamine result: SMD −0.73 [−1.10, −0.36], I² 77%.

**Brief 019 (stretch) — GRADE summary-of-findings table** built from the RoB, heterogeneity and imprecision results. Otto-SR doesn't claim this.

---

## 7. Phase 6: Differentiators Otto-SR doesn't have

| Brief | Feature | Grounding |
|---|---|---|
| 020 | **Living update.** Re-run the saved search, screen only new records, extract from them, re-pool, and show the change in the estimate | Otto-SR's "update 12 reviews" story, turned into a product feature |
| 021 | **NMA feasibility check.** From the screened set, count trials per node and the trials linking nodes, and warn *before* PROSPERO registration | The ketamine NMA became infeasible (field report §3.2) |
| 022 | **Protocol with explicit decisions plus a deviation tracker.** Force comparator, background-therapy, time-point and AI-use fields; log registered vs done vs reason | The ketamine review had 14 hand-assembled deviations (§3.1) |

---

## 8. Phase 7: Prove it

- Run the full Otto-bench (6 reviews: ketamine plus 5 Cochrane) end to end and publish the scoreboard, cost and time.
- Write it up as a methods preprint: "Verification-gated LLM extraction: zero falsely verified values across N Cochrane reproductions". Report it with PRISMA-AI / RAISE disclosures, and state openly that our two passes are AI-assisted rather than dual independent extraction.
- Only then use the words "beats Otto-SR", and only for the metrics that actually beat it.

---

## 9. Order, size and kill criteria

```
010 bench → 011 import → 008 EPMC → 012 green tests
         → 013 full-text screening → 014 screening tuning
         → 015 ingestion → 009 extraction → 016 extraction UI
         → 017 RoB 2 → 018 meta-analysis → (019 GRADE)
         → 020 living → 021 NMA feasibility → 022 protocol/deviations
         → Otto-bench full run + preprint
```

That's about 15 single-change briefs. Full-text retrieval took 3 briefs plus 3 validations, so expect roughly 2× that in total loop runs.

**Checkpoints. Stop and rethink if:**
- **After 014:** title/abstract sensitivity is below 95% on Otto-bench. Screening is then not competitive, so lean on import plus human screening and put everything into extraction.
- **After 016:** *any* falsely `verified` value appears, or auto-verified coverage is below 50%. The core idea has failed, so fix the gate before building anything on top of it.
- **After 018:** pooled estimates don't reproduce Cochrane's. Something upstream (extraction or conversion) is wrong; don't ship meta-analysis.

**Planner rule still applies:** an open FAIL in `spec/validation/*` outranks the next item in this plan.
