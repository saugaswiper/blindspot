/**
 * NEW-PHASE2: Boolean Search String Generator
 *
 * Generates publication-ready Boolean search strings for PubMed/Embase
 * from a research query and optional PICO elements.
 *
 * This allows researchers to immediately use the drafted search in their
 * actual systematic review without manual formulation.
 *
 * Features:
 * - Converts natural language query to MeSH-style AND/OR/NOT operators
 * - Incorporates PICO elements (Population, Intervention, Comparison, Outcome)
 * - Suggests Embase and Cochrane CENTRAL variants
 * - Excludes systematic reviews/meta-analyses to focus on primary studies
 * - Adds publication type filters for clinical topics
 */

interface PICOElements {
  population?: string;
  intervention?: string;
  comparison?: string;
  outcome?: string;
}

interface BooleanSearchStrings {
  pubmed: string;
  embase: string;
  central: string;
  pubmedUrl: string;
  notes: string[];
}

/**
 * Convert a natural language phrase to a quoted OR'd search term.
 * Example: "cognitive behavioral therapy" → "(cognitive behavioral therapy) OR CBT"
 */
function expandPhrase(phrase: string): string {
  if (!phrase || phrase.trim().length === 0) return "";

  const normalized = phrase.trim();

  // Common abbreviations to include
  const abbreviations: Record<string, string> = {
    "cognitive behavioral therapy": "CBT",
    "randomized controlled trial": "RCT",
    "systematic review": "SR",
    "meta-analysis": "MA",
    "evidence synthesis": "ES",
  };

  const abbr = abbreviations[normalized.toLowerCase()];
  if (abbr) {
    return `("${normalized}" OR "${abbr}")`;
  }

  return `"${normalized}"`;
}

/**
 * Build a Boolean search string from PICO elements.
 * Each element is joined with AND; multiple concepts within an element are OR'd.
 */
function buildPICOQuery(pico: PICOElements): string {
  const parts: string[] = [];

  if (pico.population) {
    parts.push(`(${expandPhrase(pico.population)})`);
  }
  if (pico.intervention) {
    parts.push(`(${expandPhrase(pico.intervention)})`);
  }
  if (pico.comparison) {
    parts.push(`(${expandPhrase(pico.comparison)})`);
  }
  if (pico.outcome) {
    parts.push(`(${expandPhrase(pico.outcome)})`);
  }

  return parts.join(" AND ");
}

/**
 * Extract key concepts from a natural language query by splitting on common connectors.
 * Example: "CBT for insomnia in elderly patients" → ["CBT", "insomnia", "elderly patients"]
 */
function extractConcepts(query: string): string[] {
  // Split on common connector words
  const separators = /\b(for|in|with|and|of|on|about|among|between)\b/gi;
  const concepts = query
    .split(separators)
    .filter(c => !separators.test(c) && c.trim().length > 0)
    .map(c => c.trim());

  return concepts;
}

/**
 * Build a Boolean search from a simple query string using AND operators.
 */
function buildSimpleQuery(query: string): string {
  const concepts = extractConcepts(query);
  if (concepts.length === 0) {
    return `"${query}"`;
  }

  return concepts
    .map(concept => {
      // Quote multi-word phrases
      if (concept.includes(" ")) {
        return `"${concept}"`;
      }
      return concept;
    })
    .join(" AND ");
}

/**
 * Generate Boolean search strings suitable for PubMed, Embase, and Cochrane CENTRAL.
 * Excludes systematic reviews and meta-analyses to focus on primary studies.
 */
export function generateBooleanSearchStrings(
  query: string,
  pico?: PICOElements,
): BooleanSearchStrings {
  // Build the main search query (PICO-based if available, otherwise simple)
  let mainQuery = "";
  const notes: string[] = [];

  if (pico && (pico.population || pico.intervention || pico.outcome)) {
    mainQuery = buildPICOQuery(pico);
    notes.push("Generated from PICO elements. Review and edit to match your study question.");
  } else {
    mainQuery = buildSimpleQuery(query);
    notes.push("Generated from your search query. Add/refine MeSH terms and adjust operators as needed.");
  }

  // PubMed-specific variant (uses MeSH field tags)
  // Note: Actual MeSH field codes may vary; researchers should review
  const pubmedQuery = `${mainQuery} NOT (systematic*[Title] OR meta-analysis[Publication Type] OR meta-analys*[Title])`;

  // Embase variant (uses Emtree terms, different exclusion syntax)
  const embaseQuery = `${mainQuery} NOT ('systematic review' OR 'meta-analysis').pt.`;

  // Cochrane CENTRAL variant (uses CENTRAL indexing)
  const centralQuery = `${mainQuery} AND NOT (systematic review OR meta-analysis)`;

  // Generate shareable PubMed URL (limited by URL length)
  const urlEncodedQuery = encodeURIComponent(`(${mainQuery}) NOT (systematic*[Title] OR meta-analysis[Publication Type])`);
  const pubmedUrl = `https://pubmed.ncbi.nlm.nih.gov/?term=${urlEncodedQuery}`;

  return {
    pubmed: pubmedQuery,
    embase: embaseQuery,
    central: centralQuery,
    pubmedUrl,
    notes,
  };
}

/**
 * Format Boolean search strings for copying (markdown or plain text).
 */
export function formatBooleanSearchForCopy(searches: BooleanSearchStrings, format: "markdown" | "plain" = "plain"): string {
  if (format === "markdown") {
    return `
## PubMed
\`\`\`
${searches.pubmed}
\`\`\`

## Embase
\`\`\`
${searches.embase}
\`\`\`

## Cochrane CENTRAL
\`\`\`
${searches.central}
\`\`\`

## Notes
${searches.notes.map(n => `- ${n}`).join("\n")}
`.trim();
  }

  return `
PubMed:
${searches.pubmed}

Embase:
${searches.embase}

Cochrane CENTRAL:
${searches.central}

Notes:
${searches.notes.map(n => `- ${n}`).join("\n")}
`.trim();
}

/**
 * Validate and refine a Boolean query for common syntax errors.
 */
export function validateBooleanQuery(query: string): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Check for unmatched parentheses
  const openParen = (query.match(/\(/g) || []).length;
  const closeParen = (query.match(/\)/g) || []).length;
  if (openParen !== closeParen) {
    warnings.push(`Unmatched parentheses (${openParen} open, ${closeParen} close). Please review.`);
  }

  // Check for consecutive operators
  if (/\s(AND|OR|NOT)\s+(AND|OR|NOT)\s/i.test(query)) {
    warnings.push("Consecutive AND/OR/NOT operators detected. Syntax may be invalid.");
  }

  // Check for missing quotes around multi-word phrases
  const unquotedPhrases = query.match(/\b\w+\s+\w+\b(?!['""])/g) || [];
  if (unquotedPhrases.length > 0) {
    warnings.push(`Consider quoting multi-word phrases: ${unquotedPhrases.slice(0, 3).join(", ")}`);
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}
