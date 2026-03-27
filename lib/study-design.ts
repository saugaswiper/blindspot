import type { FeasibilityResult, StudyDesignRecommendation } from "@/types";

// Base type without the confidence field — used internally before alignment
type BaseRecommendation = Omit<StudyDesignRecommendation, "confidence">;

const METHODOLOGY_LINKS = [
  { label: "Cochrane Handbook", url: "https://training.cochrane.org/handbook" },
  { label: "PRISMA 2020", url: "https://www.prisma-statement.org/" },
  { label: "JBI Manual", url: "https://jbi-global-wiki.refined.site/space/MANUAL" },
  { label: "PROSPERO Registration", url: "https://www.crd.york.ac.uk/prospero/" },
];

const SCOPING_LINKS = [
  { label: "JBI Scoping Review Manual", url: "https://jbi-global-wiki.refined.site/space/MANUAL" },
  { label: "PRISMA-ScR Checklist", url: "https://www.equator-network.org/reporting-guidelines/prisma-scr/" },
  { label: "PROSPERO Registration", url: "https://www.crd.york.ac.uk/prospero/" },
];

/**
 * Internal: pure decision-tree that maps feasibility data to a base recommendation.
 * No alignment checks, no confidence field.
 */
function _buildRecommendation(feasibility: FeasibilityResult): BaseRecommendation {
  const { score, primary_study_count: count, existing_review_status } = feasibility;

  // Umbrella review — multiple existing reviews available
  if (existing_review_status !== "novel" && count >= 10) {
    return {
      primary: "Umbrella Review",
      rationale:
        "Multiple systematic reviews already exist on this topic. An umbrella review synthesizing existing systematic reviews would provide a higher-level evidence summary.",
      steps: [
        "Register your protocol on PROSPERO and define eligibility criteria for systematic reviews (not primary studies).",
        "Search databases for systematic reviews and meta-analyses on the topic; screen titles/abstracts then full texts.",
        "Assess methodological quality of included reviews using AMSTAR-2.",
        "Extract and tabulate results (effect sizes, heterogeneity, quality ratings) across reviews.",
        "Summarise the evidence landscape, highlight agreements and conflicts between reviews, and grade overall certainty using GRADE.",
      ],
      example_paper: {
        citation: "Fusar-Poli P, et al. (2017). Deconstructing pretest risk enrichment to optimize prediction of psychosis in individuals at clinical high risk. JAMA Psychiatry, 74(12), 1228-1237.",
        url: "https://doi.org/10.1001/jamapsychiatry.2017.2307",
      },
      alternatives: [
        {
          type: "Systematic Review with Meta-Analysis",
          rationale: "If existing reviews are outdated, a new meta-analysis incorporating recent studies may be more impactful.",
        },
      ],
      methodology_links: METHODOLOGY_LINKS,
    };
  }

  // Insufficient evidence
  if (score === "Insufficient") {
    return {
      primary: "Primary Research Needed",
      rationale:
        "Fewer than 3 primary studies were found on this topic. There is not enough evidence to conduct any type of systematic review. Original research studies should be conducted first.",
      steps: [
        "Conduct a targeted search to confirm the evidence gap is genuine and not a search artefact.",
        "Consider a scoping review to formally map and report the gap to the research community.",
        "Design a primary study (RCT, cohort, or observational) to begin generating evidence.",
        "Register the primary study on ClinicalTrials.gov or equivalent before data collection.",
      ],
      example_paper: {
        citation: "Munn Z, et al. (2018). Systematic review or scoping review? Guidance for authors when choosing between a systematic review and scoping review approach. BMC Medical Research Methodology, 18(1), 143.",
        url: "https://doi.org/10.1186/s12874-018-0611-x",
      },
      alternatives: [
        {
          type: "Scoping Review",
          rationale:
            "A scoping review could map the very limited existing evidence and make a case for why primary research is needed.",
        },
      ],
      methodology_links: SCOPING_LINKS,
    };
  }

  // Low evidence — scoping review
  if (score === "Low") {
    return {
      primary: "Scoping Review",
      rationale: `Only ${count} primary studies were found. A scoping review is the most appropriate design as it maps available evidence without requiring the homogeneity needed for meta-analysis. Follow the JBI Manual for Scoping Reviews and the PRISMA-ScR reporting checklist.`,
      steps: [
        "Define a broad research question using PCC (Population, Concept, Context) rather than PICO.",
        "Register your protocol and search at least three databases plus grey literature.",
        "Two reviewers independently screen titles/abstracts, then full texts; resolve conflicts by consensus.",
        "Extract data using a charting form (author, year, study design, population, key findings).",
        "Synthesise results narratively — report the volume, nature, and distribution of evidence, and identify gaps for future primary research.",
      ],
      example_paper: {
        citation: "Arksey H & O'Malley L. (2005). Scoping studies: towards a methodological framework. International Journal of Social Research Methodology, 8(1), 19-32.",
        url: "https://doi.org/10.1080/1364557032000119616",
      },
      alternatives: [
        {
          type: "Rapid Review",
          rationale:
            "If time or resources are limited, a rapid review using a single reviewer and limited databases is a viable option.",
        },
      ],
      methodology_links: SCOPING_LINKS,
    };
  }

  // Moderate evidence — systematic review with narrative synthesis
  if (score === "Moderate") {
    return {
      primary: "Systematic Review (Narrative Synthesis)",
      rationale: `${count} primary studies were found, but the evidence base may be too heterogeneous for statistical pooling. A systematic review with narrative synthesis using the SWiM reporting guideline is recommended. Follow PRISMA 2020.`,
      steps: [
        "Register on PROSPERO and write a protocol defining your PICO question, databases, and inclusion criteria.",
        "Search at least 3 databases (PubMed, Embase, CENTRAL) plus trial registries; document searches with a PRISMA flow diagram.",
        "Dual-screen titles/abstracts and full texts; extract data and assess risk of bias with RoB 2 or ROBINS-I.",
        "Group studies thematically and synthesise findings narratively, explaining why statistical pooling was not appropriate.",
        "Report using the SWiM (Synthesis Without Meta-analysis) guideline and grade evidence certainty with GRADE.",
      ],
      example_paper: {
        citation: "Campbell M, et al. (2020). Synthesis without meta-analysis (SWiM) in systematic reviews: reporting guideline. BMJ, 368, l6890.",
        url: "https://doi.org/10.1136/bmj.l6890",
      },
      alternatives: [
        {
          type: "Systematic Review with Meta-Analysis",
          rationale:
            "If the studies use comparable designs and outcome measures, meta-analysis may be feasible — assess after full-text screening.",
        },
        {
          type: "Scoping Review",
          rationale: "If the primary goal is mapping the evidence landscape rather than answering a specific question.",
        },
      ],
      methodology_links: METHODOLOGY_LINKS,
    };
  }

  // High evidence — meta-analysis
  return {
    primary: "Systematic Review with Meta-Analysis",
    rationale: `${count} primary studies were found, providing a strong evidence base. A systematic review with meta-analysis is recommended if study designs and outcome measures are sufficiently homogeneous. Follow the Cochrane Handbook and PRISMA 2020 reporting guidelines.`,
    steps: [
      "Register on PROSPERO; write a protocol specifying PICO, databases, statistical approach, and planned subgroup analyses.",
      "Search at least 3 major databases plus grey literature; two reviewers independently screen and select studies.",
      "Extract outcome data and assess risk of bias using RoB 2 (for RCTs) or ROBINS-I (for observational studies).",
      "Pool effect sizes using a random-effects model (DerSimonian-Laird); quantify heterogeneity with I-squared and tau-squared.",
      "Report with PRISMA 2020; assess publication bias via funnel plot and Egger's test; grade evidence with GRADE.",
    ],
    example_paper: {
      citation: "Moher D, et al. (2009). Preferred Reporting Items for Systematic Reviews and Meta-Analyses: The PRISMA Statement. PLOS Medicine, 6(7), e1000097.",
      url: "https://doi.org/10.1371/journal.pmed.1000097",
    },
    alternatives: [
      {
        type: "Systematic Review (Narrative Synthesis)",
        rationale:
          "If studies are too heterogeneous for statistical pooling after full-text screening, use narrative synthesis with the SWiM guideline.",
      },
      {
        type: "Umbrella Review",
        rationale: "If multiple existing systematic reviews already cover subtopics, an umbrella review may be more impactful.",
      },
    ],
    methodology_links: METHODOLOGY_LINKS,
  };
}

/**
 * Internal: computes recommendation confidence based on how clearly the evidence
 * count falls within (rather than at the boundary of) a feasibility tier.
 *
 * Score thresholds:  <3 = Insufficient | 3–5 = Low | 6–10 = Moderate | ≥11 = High
 * Boundary counts (±1 of each threshold) carry moderate uncertainty.
 */
function _computeConfidence(count: number): "high" | "moderate" | "low" {
  // Counts that sit at or immediately adjacent to score thresholds
  const BORDERLINE_COUNTS = [2, 3, 5, 6, 10, 11];
  return BORDERLINE_COUNTS.includes(count) ? "moderate" : "high";
}

/**
 * Builds a study design recommendation from feasibility data, then applies
 * three alignment guards and assigns a confidence level.
 *
 * Alignment guards (in priority order):
 *  1. Meta-analysis recommended but primary_study_count < 10 → downgrade to Narrative Synthesis
 *  2. Umbrella Review recommended but existing_review_status === "novel" → downgrade to score-appropriate recommendation
 *  3. Scoping Review recommended but primary_study_count ≥ 15 → keep but add upgrade note
 *
 * Confidence:
 *  - "low"      — alignment guard fired (edge case or data inconsistency)
 *  - "moderate" — count sits at a threshold boundary (±1)
 *  - "high"     — count clearly within a tier, no alignment needed
 */
export function recommendStudyDesign(feasibility: FeasibilityResult): StudyDesignRecommendation {
  const { primary_study_count: count, existing_review_status } = feasibility;
  const base = _buildRecommendation(feasibility);

  // ── Guard 1: Meta-analysis but fewer than 10 primary studies ──────────────
  if (base.primary === "Systematic Review with Meta-Analysis" && count < 10) {
    const narrativeFeasibility: FeasibilityResult = { ...feasibility, score: "Moderate" };
    const narrative = _buildRecommendation(narrativeFeasibility);
    return {
      ...narrative,
      confidence: "low",
      rationale:
        narrative.rationale +
        ` (Alignment note: meta-analysis was downgraded to narrative synthesis — only ${count} primary ${count === 1 ? "study was" : "studies were"} found; at least 10 are needed for reliable statistical pooling.)`,
    };
  }

  // ── Guard 2: Umbrella review but topic appears novel (no existing reviews) ─
  if (base.primary === "Umbrella Review" && existing_review_status === "novel") {
    // Re-derive the appropriate recommendation now that umbrella is excluded
    const fallbackFeasibility: FeasibilityResult = { ...feasibility, existing_review_status: "novel" };
    const fallback = _buildRecommendation(fallbackFeasibility);
    return {
      ...fallback,
      confidence: "low",
      rationale:
        fallback.rationale +
        " (Alignment note: umbrella review was overridden — no existing systematic reviews were identified, indicating this is a novel research area.)",
    };
  }

  // ── Guard 3: Scoping review but evidence base may already support more ─────
  if (base.primary === "Scoping Review" && count >= 15) {
    return {
      ...base,
      confidence: "low",
      rationale:
        base.rationale +
        ` Note: with ${count} primary studies identified, a systematic review with narrative synthesis may already be feasible — consider upgrading after completing initial evidence mapping.`,
    };
  }

  // ── No alignment needed — derive confidence from threshold proximity ───────
  return {
    ...base,
    confidence: _computeConfidence(count),
  };
}
