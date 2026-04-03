/**
 * lib/prospero-export.ts
 *
 * Converts Blindspot gap analysis and protocol draft into PROSPERO registration
 * export format. PROSPERO is the international prospective register of systematic
 * reviews: https://www.crd.york.ac.uk/prospero/
 *
 * This module generates a structured document with all required PROSPERO fields
 * based on the Blindspot analysis, allowing researchers to quickly populate
 * a PROSPERO registration form with pre-filled data.
 *
 * All functions are pure (no I/O) and suitable for unit testing.
 */

import type { GapAnalysis, StudyDesignRecommendation } from "@/types";

/**
 * PROSPERO registration structure containing all required and optional fields.
 *
 * PROSPERO fields reference:
 * https://www.crd.york.ac.uk/prospero/documents/Methodology-for-PROSPERO-registrations.pdf
 */
export interface ProsperoRegistration {
  /** Title of the systematic review */
  title: string;

  /** Rationale and objectives for the review */
  rationale: string;

  /** Primary research question */
  researchQuestion: string;

  /** Population definition (P in PICO) */
  population?: string;

  /** Intervention definition (I in PICO) */
  intervention?: string;

  /** Comparator definition (C in PICO) */
  comparator?: string;

  /** Primary outcome(s) (O in PICO) */
  outcomes: string;

  /** Study design(s) to be included */
  studyDesigns: string;

  /** Search strategy summary */
  searchStrategy: string;

  /** Boolean search string for PubMed */
  pubmedSearchString?: string;

  /** Data sources (e.g., PubMed, Embase, Cochrane) */
  dataSources: string;

  /** Language restrictions (if any) */
  languageRestrictions?: string;

  /** Publication date restrictions (if any) */
  dateRestrictions?: string;

  /** Contact details for the review team */
  contactDetails?: string;
}

/**
 * Extract key review title from gap analysis suggested topics.
 * Prioritises high-feasibility topics and uses their suggested titles.
 */
export function deriveReviewTitle(
  query: string,
  gapAnalysis: GapAnalysis | null
): string {
  // If gap analysis exists, try to use a suggested topic title
  if (gapAnalysis?.suggested_topics && gapAnalysis.suggested_topics.length > 0) {
    // Find the highest-feasibility suggested topic with a title
    const highFeasibility = gapAnalysis.suggested_topics.find(
      (t) => t.feasibility === "high" && t.title
    );
    if (highFeasibility?.title) {
      return highFeasibility.title;
    }

    // Fall back to first topic with a title
    const firstWithTitle = gapAnalysis.suggested_topics.find((t) => t.title);
    if (firstWithTitle?.title) {
      return firstWithTitle.title;
    }
  }

  // Fall back to query-derived title
  return `Systematic Review: ${query}`;
}

/**
 * Build rationale text from gap analysis.
 * Combines the query context with identified gaps to explain why a review is needed.
 */
export function buildRationale(
  query: string,
  gapAnalysis: GapAnalysis | null
): string {
  if (!gapAnalysis || !gapAnalysis.gaps || gapAnalysis.gaps.length === 0) {
    return `This systematic review will synthesize the evidence on ${query}.`;
  }

  const gapCount = gapAnalysis.gaps.length;
  const highImportanceGaps = gapAnalysis.gaps.filter(
    (g) => g.importance === "high"
  );

  let rationale = `This systematic review will examine the evidence on ${query}. `;
  rationale += `The analysis identified ${gapCount} evidence gaps, including ${
    highImportanceGaps.length
  } high-priority gaps:`;

  highImportanceGaps.slice(0, 3).forEach((gap) => {
    rationale += `\n- ${gap.description}`;
  });

  rationale +=
    "\n\nThis review will address these evidence gaps and inform clinical practice and future research.";

  return rationale;
}

/**
 * Build primary research question from query and PICO elements.
 */
export function buildResearchQuestion(
  query: string,
  pico?: {
    population?: string | null;
    intervention?: string | null;
    comparison?: string | null;
    outcome?: string | null;
  }
): string {
  if (!pico) {
    return `What is the evidence on ${query}?`;
  }

  const parts = [];
  if (pico.population) parts.push(`In ${pico.population}`);
  if (pico.intervention) parts.push(`does ${pico.intervention}`);
  if (pico.comparison) parts.push(`compared to ${pico.comparison}`);
  if (pico.outcome) parts.push(`improve ${pico.outcome}?`);

  if (parts.length > 0) {
    return parts.join(" ");
  }

  return `What is the evidence on ${query}?`;
}

/**
 * Build outcomes description from gap analysis and study design.
 */
export function buildOutcomes(
  gapAnalysis: GapAnalysis | null,
  studyDesign: StudyDesignRecommendation | null,
  pico?: { outcome?: string | null }
): string {
  const outcomes: string[] = [];

  if (pico?.outcome) {
    outcomes.push(`Primary: ${pico.outcome}`);
  }

  if (outcomes.length === 0) {
    // Fall back to gap analysis insights
    if (gapAnalysis?.gaps && gapAnalysis.gaps.length > 0) {
      const outcomeGaps = gapAnalysis.gaps.filter(
        (g) => g.dimension === "outcome"
      );
      if (outcomeGaps.length > 0) {
        return `Outcomes related to identified gaps:\n${outcomeGaps
          .slice(0, 3)
          .map((g) => `- ${g.description}`)
          .join("\n")}`;
      }
    }
    return "To be determined by review protocol";
  }

  return outcomes.join("\n");
}

/**
 * Build study design description from recommendation.
 */
export function buildStudyDesigns(
  studyDesign: StudyDesignRecommendation | null
): string {
  if (!studyDesign) {
    return "Systematic reviews of randomized controlled trials and observational studies";
  }

  const designs: string[] = [];

  if (studyDesign.primary) {
    designs.push(studyDesign.primary);
  }

  if (studyDesign.rationale) {
    designs.push(`Rationale: ${studyDesign.rationale}`);
  }

  return designs.length > 0
    ? designs.join(" | ")
    : "Study designs to be finalized in protocol";
}

/**
 * Build data sources description.
 */
export function buildDataSources(
  pubmedSearchString?: string
): string {
  const sources = [
    "PubMed",
    "Embase",
    "Cochrane Library",
    "OpenAlex",
    "Hand-searching of key journals",
  ];

  let description = `Bibliographic databases: ${sources.join(", ")}`;

  if (pubmedSearchString) {
    description += `\n\nPubMed search strategy:\n${pubmedSearchString}`;
  }

  return description;
}

/**
 * Convert gap analysis, protocol, and metadata into a PROSPERO registration object.
 *
 * @param query - The original user search query
 * @param gapAnalysis - The AI-generated gap analysis
 * @param studyDesign - The recommended study design
 * @param protocolDraft - The generated protocol text (optional, for context)
 * @param pico - PICO elements from search (optional)
 * @param booleanSearchString - PubMed Boolean search string (optional)
 * @returns ProsperoRegistration object with all fields populated
 */
export function generateProsperoRegistration(
  query: string,
  gapAnalysis: GapAnalysis | null,
  studyDesign: StudyDesignRecommendation | null,
  protocolDraft?: string | null,
  pico?: {
    population?: string | null;
    intervention?: string | null;
    comparison?: string | null;
    outcome?: string | null;
  },
  booleanSearchString?: string | null
): ProsperoRegistration {
  return {
    title: deriveReviewTitle(query, gapAnalysis),
    rationale: buildRationale(query, gapAnalysis),
    researchQuestion: buildResearchQuestion(query, pico),
    population: pico?.population || undefined,
    intervention: pico?.intervention || undefined,
    comparator: pico?.comparison || undefined,
    outcomes: buildOutcomes(gapAnalysis, studyDesign, pico),
    studyDesigns: buildStudyDesigns(studyDesign),
    searchStrategy:
      protocolDraft && protocolDraft.includes("search strategy")
        ? "See protocol draft for full search strategy"
        : "Search strategy to be finalized in protocol",
    pubmedSearchString: booleanSearchString || undefined,
    dataSources: buildDataSources(booleanSearchString || undefined),
    languageRestrictions: "English language publications",
    dateRestrictions: undefined,
  };
}

/**
 * Format a ProsperoRegistration as plain text for easy copying/export.
 *
 * This format is suitable for:
 * - Pasting into PROSPERO registration form
 * - Emailing to collaborators
 * - Importing into protocol document
 */
export function formatProsperoAsText(reg: ProsperoRegistration): string {
  const lines: string[] = [];

  lines.push("PROSPERO REGISTRATION DRAFT");
  lines.push("Generated by Blindspot Systematic Review Gap Analyzer");
  lines.push("=".repeat(60));
  lines.push("");

  lines.push("TITLE");
  lines.push("-".repeat(60));
  lines.push(reg.title);
  lines.push("");

  lines.push("RATIONALE");
  lines.push("-".repeat(60));
  lines.push(reg.rationale);
  lines.push("");

  lines.push("PRIMARY RESEARCH QUESTION");
  lines.push("-".repeat(60));
  lines.push(reg.researchQuestion);
  lines.push("");

  if (reg.population) {
    lines.push("POPULATION (P)");
    lines.push("-".repeat(60));
    lines.push(reg.population);
    lines.push("");
  }

  if (reg.intervention) {
    lines.push("INTERVENTION (I)");
    lines.push("-".repeat(60));
    lines.push(reg.intervention);
    lines.push("");
  }

  if (reg.comparator) {
    lines.push("COMPARATOR (C)");
    lines.push("-".repeat(60));
    lines.push(reg.comparator);
    lines.push("");
  }

  lines.push("PRIMARY OUTCOME(S)");
  lines.push("-".repeat(60));
  lines.push(reg.outcomes);
  lines.push("");

  lines.push("STUDY DESIGN(S)");
  lines.push("-".repeat(60));
  lines.push(reg.studyDesigns);
  lines.push("");

  lines.push("SEARCH STRATEGY");
  lines.push("-".repeat(60));
  lines.push(reg.searchStrategy);
  lines.push("");

  if (reg.pubmedSearchString) {
    lines.push("PUBMED SEARCH STRING");
    lines.push("-".repeat(60));
    lines.push(reg.pubmedSearchString);
    lines.push("");
  }

  lines.push("DATA SOURCES");
  lines.push("-".repeat(60));
  lines.push(reg.dataSources);
  lines.push("");

  if (reg.languageRestrictions) {
    lines.push("LANGUAGE RESTRICTIONS");
    lines.push("-".repeat(60));
    lines.push(reg.languageRestrictions);
    lines.push("");
  }

  if (reg.dateRestrictions) {
    lines.push("DATE RESTRICTIONS");
    lines.push("-".repeat(60));
    lines.push(reg.dateRestrictions);
    lines.push("");
  }

  lines.push("NEXT STEPS");
  lines.push("-".repeat(60));
  lines.push("1. Review and refine this draft with your research team");
  lines.push("2. Visit https://www.crd.york.ac.uk/prospero/");
  lines.push("3. Create an account and log in");
  lines.push("4. Click 'Register a new review' and complete the full form");
  lines.push("5. Use the fields above to populate the registration");
  lines.push("");
  lines.push("Note: This draft is a starting point. The full PROSPERO form");
  lines.push("includes additional methodological details that your team will");
  lines.push("need to specify during formal protocol development.");

  return lines.join("\n");
}

/**
 * Trigger a browser download of the PROSPERO registration as a text file.
 * (Client-only function — never call from server code)
 */
export function downloadProsperoRegistration(
  registration: ProsperoRegistration,
  filename: string = "prospero-registration-draft.txt"
): void {
  const text = formatProsperoAsText(registration);
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
