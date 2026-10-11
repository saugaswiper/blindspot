# Field Report: Lessons from a Complete Systematic Review and Meta-Analysis (Ketamine/Esketamine in TRD)

**Type:** external field report (operator-supplied source, not a dev handoff or a tester validation)
**Date:** 2026-10-07
**Author:** operator (Dharmayu Desai), compiled from the second-brain project record
**Relevant pipeline stages:** protocol and feasibility · screening · full-text · **data extraction (next milestone)** · risk of bias · **meta-analysis** · PRISMA/reporting · living reviews

> **Provenance note for the librarian:** everything here comes from one real review, run end to end outside Blindspot (Covidence + a custom Python extraction tool + an R meta-analysis pipeline). It is **field evidence about the task**, not evidence about Blindspot. Nothing here moves a Blindspot claim from `claimed` to `verified`. Use it to write briefs, acceptance criteria and [[Validation Strategy]] truth sets.

---

## 1. The review in one paragraph

- **Registration:** PROSPERO CRD420261283956 (registered 2026-02-20).
- **Question:** in adults with treatment-resistant depression (TRD), does more ketamine or esketamine (higher dose, more administrations, a different route) add benefit or only harm, compared with placebo or active placebo?
- **Search:** Embase, MEDLINE and PsycINFO via Ovid, inception to 2026-02-09, English only.
- **Flow:**
  - 4,069 records identified; 1,244 duplicates removed; 535 removed by the RCT classifier.
  - 2,290 screened; 122 full texts assessed; 99 excluded.
  - **23 RCTs included (1,768 participants).**
- **Main result:** SMD −0.73 [−1.10, −0.36], I² 77%; response RR 2.47; dissociation RR 4.50.
- **Dose:** higher vs lower dose randomised within the same trial, SMD −0.15 [−0.43, 0.13], so no dose–response was found.
- **Registered design:** a network meta-analysis (NMA) with dose-response. That turned out to be infeasible (§3.2).

---

## 2. Candidate truth set for [[Validation Strategy]]

This is a fully adjudicated inclusion set, with full-text exclusion reasons and PRISMA counts. The search and the final 23 are both known, so it can serve as a recall truth set for search and screening, the same way Mitchell 2012 does now.

**Included (23), with DOIs from Covidence:**

| Study | DOI |
|---|---|
| Ahmed 2023 | 10.1016/j.jad.2023.01.005 |
| Colla 2024 | 10.1016/j.jpsychires.2024.03.002 |
| Daly 2018 | 10.1001/jamapsychiatry.2017.3739 |
| Domany 2019 | 10.1192/bjp.2018.196 |
| Fava 2020 | 10.1038/s41380-018-0256-5 |
| Galvez 2018 | 10.1177/0269881118760660 |
| Glue 2024 | 10.1038/s41591-024-03063-x |
| Ionescu 2019 | 10.1016/j.jad.2018.09.037 |
| Janik 2025 | 10.1001/jamapsychiatry.2025.1317 |
| Leal 2023 | 10.1016/j.jad.2023.02.151 |
| Loo 2016 | 10.1111/acps.12572 |
| Loo 2023 | 10.1192/bjp.2023.79 |
| Murrough 2013 | 10.1176/appi.ajp.2013.13030392 |
| Ohtani 2024 | 10.1111/pcn.13734 |
| Pattanaseri 2024 | 10.1186/s12888-024-05951-5 |
| Phillips 2020 | 10.1176/APPI.FOCUS.18206 (Focus reprint; primary publication is Am J Psychiatry 2019) |
| Shiroma 2020 | 10.1038/s41398-020-00897-0 |
| Singh 2016 (IV ketamine, dose frequency) | 10.1176/appi.ajp.2016.16010037 |
| Singh 2016 (IV esketamine) | 10.1016/j.biopsych.2015.10.018 |
| Smith-Apeldoorn 2024 | 10.1038/s41380-024-02478-9 |
| Su 2017 | 10.1038/npp.2017.94 |
| Su 2023 | 10.1093/ijnp/pyad014 |
| Zarate 2006 | 10.1001/archpsyc.63.8.856 |

**Full-text exclusions (99):**
- Abstract only: 36
- Duplicate study population: 29
- Wrong study design: 17
- Trial registration record: 7
- Wrong comparator: 3
- Wrong outcomes: 2
- Wrong patient population: 2
- Wrong intervention: 1
- Journal club article: 1
- Retracted: 1

**Traps that make it a good stress test:**
- Two different "Singh 2016" papers with identical author and year.
- A reprint (Phillips 2020 in *Focus*) of a 2019 primary paper.
- Many secondary analyses of the same trials, recorded as 29 "duplicate population" exclusions. Examples:
  - Feeney 2021 re-analyses Fava 2020.
  - Ballard 2015 and Alexander 2023 re-analyse Zarate 2006.
  - Araujo-de-Freitas 2021 re-analyses Correia-Melo 2020.
- One study excluded late (George 2017) because 1 of its participants had bipolar depression. Covidence and the analysis disagreed (23 vs 24) until this was reconciled.

---

## 3. Protocol and feasibility lessons → [[Feasibility Scoring]], protocol generator, PROSPERO export

### 3.1 Protocol ambiguity forced post hoc decisions
- **Adjunct use:** the exclusion "ketamine given as an adjunct", read literally, excluded most eligible trials, because nearly all TRD trials keep the patient's existing antidepressant. It had to be reinterpreted:
  - a stable, continued antidepressant is allowed;
  - a newly started antidepressant is excluded (TRANSFORM-type designs).
- **Comparator:** the uploaded protocol never defined acceptable comparators. A rule was set post hoc: placebo or active placebo only, so head-to-head trials and trials against ECT or antidepressants were excluded. Both decisions had to be declared as deviations.
- **Time point:** the protocol said "closest to 1 week". The final analysis instead used each trial's own primary endpoint. This changed the inputs (Fava 24 h → day 3; Pattanaseri day 31 → day 10) but barely moved the pooled result (−0.75 → −0.73). Both choices need to be pre-specified, with the other run as a sensitivity analysis.
- **Inconsistent registration documents:** the PROSPERO record and the uploaded protocol disagreed on AI use ("person/machine combination" vs "AI will not be employed"), on certainty grading ("not assessed" vs "CINeMA where feasible") and on reporting bias.
- **Implications for Blindspot:**
  - A protocol generator should force explicit fields for comparator rules, the definition of "adjunct/background therapy", the primary time-point rule, and AI use.
  - It should keep every exported registration document consistent.
  - A **deviation tracker** (registered → done → reason) is needed at write-up. It was assembled by hand here (14 items).

### 3.2 A registered NMA became infeasible: predict it before registration
- Most dose/route/schedule "nodes" were represented by a **single trial**, so the network was too sparse for an NMA or a dose-response NMA. The analysis fell back to pairwise meta-analysis, plus within-trial dose comparisons and exploratory dose meta-regression.
- **Implication for Blindspot:** [[Feasibility Scoring]] could estimate *network connectivity* (trials per node, how many trials compare 2 or more nodes) from the screened set **before** someone registers an NMA. That would have prevented this deviation.

### 3.3 A scale-conversion pitfall
- The registered plan was to convert HAM-D to MADRS with the Heo equation. That equation maps **endpoint** scores, not **change** scores, so SMDs were used instead and re-expressed in MADRS points via a pooled reference SD (Cochrane Handbook 15.5.3.2).
- **Implication for Blindspot:** a conversion feature must check that the score type it is given matches the equation's.

---

## 4. Data-extraction lessons → brief for the next milestone ("verifiable citations")

These come from building and running an extraction tool on about 34 trial PDFs.

### 4.1 Verification design: the model reads, deterministic checks decide
A value was marked `verified` only when four independent checks all passed:
1. **Source-presence gate.** The number appears character for character in that page's own text layer. Matching covers reading-order text, layout text **and parsed table grids**. A fabricated number cannot pass this check.
   - A number spelled out in words ("forty-two") is flagged separately, not treated as a fabrication.
   - A number found on a different page is `wrong_page`, not `not_in_source`. Mis-citation and fabrication are different failures.
2. **Two passes with different framings** (a cell-by-cell transcriber vs a target-hunting meta-analyst) must agree. Disagreements are recorded as `conflict:<field>` and **never averaged**.
3. **Internal consistency:**
   - SE ≈ CI width / 3.92
   - SD ≈ SE·√n
   - % ≈ events/total
   - mean inside its CI
   - CI limits in the right order
   - n ≤ number randomised
4. **Range check:** the value is possible for the instrument (e.g. MADRS 0–60).

Anything that fails a check goes to `check` (a human reads it). Anything the tool refuses goes to `manual`.

### 4.2 Show the evidence, not just the number
- Each extracted number was shown beside a **cropped image of the PDF strip it came from**, so a human could verify a value in seconds.
- The review UI grouped rows by *why* they were flagged, and grouped rows that share one answer. For example, a paper's sign convention is one "flip all" decision, not 37 separate ones.
- Decisions are stored by row identity, so they survive re-extraction.
- Human-reviewed rows are labelled `human`, never `verified`.

### 4.3 Hard rules from the reviewer, worth making product defaults
- **No values estimated from figures.** Data that exists only in a figure is flagged "author contacted" and is not digitised.
- **No conversion during extraction.** SE→SD and endpoint→change conversions belong in the analysis, each with a Cochrane Handbook citation (6.5.2 for SDs, Table 6.5.a for combining groups). They must not be folded silently into the extracted data.
- **Any calculated value is disclosed** before use. Only exact transformations are allowed silently. Any step that doesn't follow Cochrane guidance is flagged.
- **Two passes of one model are not dual independent extraction.** Don't claim it. Declare AI-assisted extraction as a protocol deviation or disclosure (consistent with the RAISE stance in [[Mission & Vision]]).

### 4.4 Model failure modes seen in production
- **Truncated output that looked valid.** A truncated reply once parsed as a valid **empty** read, which silently made a whole paper's rows single-pass. Fixes:
  - pick the richest balanced JSON candidate;
  - treat an empty read as an error and never cache it;
  - warn loudly when only one pass survives.
- **Turn budget.** A one-turn limit killed a whole paper mid-JSON. Fixes:
  - allow continuation turns;
  - parse partial output instead of discarding it;
  - degrade to single-pass rather than aborting.
- **Scope creep.** The transcriber tried to transcribe adverse-event and demographic tables too. Scoping it to efficacy outcomes, with a cap on findings per paper, fixed this.
- **Matching rows across passes.** Near-identical labels looked like different rows ("Ketamine (N=47)" vs "Ketamine"). Fixes:
  - a loose key that strips "(N=…)" and bins the time point;
  - **dose digits are kept**, so 0.5 and 0.2 mg/kg stay separate arms.
- **Reference lists polluted the prompt.** Detecting bibliography pages (density of "et al" and numbered citations) keeps them out.
- **Cache invalidation.** Cache model passes on (file hash, pages, pass, model, prompt version), and bump the version when a prompt changes.

### 4.5 Real errors that only the checks or human review caught
- **Wrong-day SEs:** Pattanaseri 2024's change SDs were built from the wrong day's SEs (copied from day 1 or day 3). Found while building the R pipeline and fixed in the workbook.
- **Implausible SD:** Ahmed 2023 has an implausibly small SD (2.44) and is the largest outlier (g −2.94, studentized residual −3.45). Without it the pooled SMD is −0.62.
- **Real data that looks like a sign error:** in Pattanaseri 2024 the control arm improved more than ketamine at the primary endpoint (−17.2 vs −12.6). The paper's own tables confirm it. A checker must not "correct" a genuine null or reversed result.
- **Unit-of-analysis error:** an early version counted a shared control group twice across dose arms. It was fixed by combining arms or modelling covariance (§5).

### 4.6 Study identity and deduplication → Study grouping stage (🔶 partial)
- **Trial registration numbers (NCT, UMIN, ACTRN) are the reliable linkage key.** Three genuine overlapping samples were found that way.
- Two trials from the same group sharing one registration number (George 2017 / Loo 2016) were nonetheless independent samples.
- **Same author and year needs a stable suffix** (A/B) tied to the Covidence record number, because bylines alone don't tell the papers apart.
- **Reprints and secondary analyses** need "keep the primary report" logic.
- **One source of truth for inclusion.** Keep a single register (study → included yes/no → reason → which analyses it feeds). Covidence (23) and the analysis (24) drifted apart until George 2017 was reconciled.
- **Not every included study feeds every analysis.** 7 of the 23 contributed no usable symptom data:
  - figure-only data;
  - crossover trials without SDs;
  - within-person dose titration;
  - an enrichment/withdrawal design.

---

## 5. Meta-analysis lessons → long-term differentiator

- **Use validated packages, not hand-rolled formulas.** This pipeline used R `meta` and `metafor`. The rebuild replaced a hand-coded Gleser–Olkin covariance with `metafor::vcalc()` and replaced a hand-built Egger regression with `meta::metabias()`. A continuity check (103 quantities compared against the earlier pipeline; any unexplained difference stops the run) proved the replacements matched.
- **Default model:** REML with Hartung–Knapp, plus prediction intervals. Use the ad hoc variance correction (`adhoc.hakn.ci`) when HK gives intervals that are too narrow (seen with I² = 0 harms outcomes).
- **Multi-arm trials:** combine dose arms against the shared control (Cochrane Handbook Table 6.5.a), or keep all arms and model the shared-control covariance (`vcalc`). Never count a control group twice.
- **Crossover trials:** analyse as parallel groups (conservative), with a sensitivity analysis that excludes them.
- **Dose is confounded between trials:** only *within-trial* dose comparisons are randomised. Between trials, dose comes with a different route and schedule, so their effects can't be separated. Separate within-trial from between-trial slopes.
- **Subgroup tests mislead with tiny subgroups:** the standard subgroup Q-test gave route p < 0.001, driven by 2-trial subgroups and one narrow oral trial. A multilevel model gave p = 0.48. The figure should show the defensible test.
- **Small-study test:** classic Egger is biased for SMDs. Use the Pustejovsky–Rodgers modified test (here modified p = 0.51). Different implementations of "classic" Egger gave different answers: metafor's random-effects variant gave p = 0.011, the original Egger regression in `meta` gave p = 0.18. State which implementation was used.
- **NNT/NNH:** derive from the pooled RR and the pooled control risk (`meta::nnt`, which signs results by direction, so report magnitudes).
- **Rare harms:** run a Poisson/GLMM model as a sensitivity analysis.
- **Exploratory analyses** (cumulative dose, number of infusions) are labelled post hoc. Cumulative dose correlated with time to assessment (r = 0.72), so the two could not be separated.
- **Living reviews:** a continuity check between versions, where every changed number must carry a known reason, is exactly the "what's new" diff that living reviews need. Reasons logged here included "primary endpoint switch" and "George excluded: counts only".

---

## 6. Risk of bias → RoB stage (⬜ not started)

- The **JBI** RCT appraisal tool was used (registered). Overall: 20 include, 2 "seek further information", 1 exclude (Galvez 2018).
- A risk-of-bias sensitivity analysis gave SMD −0.64. The registration required a second independent rater, which was still pending at write-up.
- **Blinding:**
  - Effects against an active placebo (midazolam, k = 8) were numerically smaller than against saline (k = 10): −0.54 vs −0.97, p = 0.20, low power.
  - Excess dissociation differed by control type (p = 0.02).
  - A risk-of-bias module for drugs with obvious subjective effects should prompt for **comparator type and functional unblinding**, not just allocation concealment.

---

## 7. Author contact → workflow feature (planned)

- Contacted authors to request missing SDs and per-arm data that existed only in figures.
- **Protocol:** two attempts about 2 weeks apart; record non-response for PRISMA. Author-supplied data is cited as "unpublished data provided by the authors on request".
- **One author did supply data** (Su 2023 responder counts by day), and it changed a sensitivity analysis.
- **Implication for Blindspot:** an author-request tracker (draft, send, follow up, outcome, PRISMA count). Outbound email stays drafted only, never sent without the user's approval.

---

## 8. Reporting → [[PRISMA Estimates]], export

- **PRISMA arithmetic must reconcile:** reports excluded + studies included = reports assessed (99 + 23 = 122). The diagram should be generated from the same inclusion register that feeds the analysis, not typed by hand. A hand-typed count drifted once (24 vs 23).
- **Figures and text must agree.** A judge-facing poster showed a figure footer (subgroup p < 0.001) that contradicted the text (p = 0.48). Generate captions and figure annotations from the same results object.
- **One font across all figures,** matching the poster (Open Sans embedded). Base R PDF devices can't embed it, so use ragg/systemfonts.
- **References:** numbered by first appearance for posters; APA 7 for the write-up. Pull the metadata (full author lists, print year vs online-first year, article numbers) from PubMed rather than retyping it. Four print years differed from PubMed's online-first year.

---

## 9. Suggested follow-ups (operator to prioritise)

| # | Suggestion | Stage | Type |
|---|---|---|---|
| 1 | Add this review as a validation truth set (§2) | Search, screening | Validation |
| 2 | Extraction brief: source-presence gate + two framed passes + consistency + range checks + PDF crop evidence (§4.1–4.2) | Extraction | Brief |
| 3 | Inclusion register as the single source of truth, driving PRISMA counts and analysis inputs (§4.6, §8) | Grouping, reporting | Brief |
| 4 | Network-connectivity check before NMA registration (§3.2) | Feasibility | Feature |
| 5 | Protocol generator: required comparator / adjunct / time-point / AI-use fields + deviation tracker (§3.1) | Protocol | Feature |
| 6 | Meta-analysis on validated packages with a continuity-check harness (§5) | Meta-analysis | Brief (long-term) |
| 7 | Author-contact tracker, draft-only (§7) | Extraction | Feature |

The underlying materials (R pipeline, extraction tool, workbook) live in the operator's second-brain vault at `~/second-brain/.claude/data/extractions/ketamine_trd_meta/` and `~/second-brain/.claude/scripts/pdfextract/`. They are not part of the Blindspot repo. Ask the operator before copying any code. The workbook contains a collaborator's material that must not be redistributed.
