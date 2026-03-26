import type { ExistingReview } from "@/types";

export const SYSTEM_PROMPT = `You are an expert research methodologist specializing in systematic reviews and meta-analyses. You analyze bodies of literature to identify gaps, assess feasibility, and recommend study designs. Always be specific and evidence-based. Never fabricate study details or invent citations. Respond only with valid JSON.`;

function formatReviews(reviews: ExistingReview[]): string {
  if (reviews.length === 0) return "None found.";
  return reviews
    .slice(0, 20)
    .map((r) => `- "${r.title}" (${r.year}, ${r.journal})${r.abstract_snippet ? `: ${r.abstract_snippet}` : ""}`)
    .join("\n");
}

export function buildGapAnalysisPrompt(
  query: string,
  existingReviews: ExistingReview[],
  primaryStudyCount: number
): string {
  return `Analyze the following research landscape for gaps suitable for new systematic reviews or meta-analyses.

TOPIC: ${query}

EXISTING SYSTEMATIC REVIEWS ON THIS TOPIC (${existingReviews.length} found):
${formatReviews(existingReviews)}

PRIMARY STUDIES FOUND: approximately ${primaryStudyCount} studies in the literature.

Analyze gaps across these six dimensions:
1. POPULATION GAPS: Which demographics, age groups, or clinical populations are understudied?
2. METHODOLOGICAL GAPS: Which study designs are missing? (e.g., no RCTs, no long-term follow-ups)
3. OUTCOME GAPS: Which outcomes haven't been measured or reported?
4. GEOGRAPHIC GAPS: Which regions or countries lack evidence?
5. TEMPORAL GAPS: Are there outdated findings that need replication with current data?
6. THEORETICAL GAPS: Which frameworks or models are underexplored?

For each gap dimension that has meaningful findings, suggest a specific systematic review topic.

Respond in this exact JSON format — no markdown, no code fences, just raw JSON:
{
  "gaps": [
    {
      "dimension": "population|methodology|outcome|geographic|temporal|theoretical",
      "description": "Plain language description of the gap",
      "importance": "high|medium|low"
    }
  ],
  "suggested_topics": [
    {
      "title": "Proposed systematic review title",
      "gap_type": "population|methodology|outcome|geographic|temporal|theoretical",
      "pubmed_query": "3-5 MeSH-style keywords for searching PubMed primary studies on this specific topic, e.g. 'ketamine elderly depression treatment'",
      "rationale": "One paragraph explanation of why this review is needed and how it differs from existing work, specifically referencing what existing reviews cover and do not cover",
      "expected_outcomes": "2-3 sentences describing what this review is expected to find or contribute — e.g. effect sizes, clinical recommendations, evidence maps, or policy implications",
      "feasibility": "high|moderate|low"
    }
  ],
  "overall_assessment": "2-3 sentence summary of the evidence landscape and the most promising opportunities"
}`;
}
