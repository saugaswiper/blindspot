/**
 * Screening module — two-step AI-powered literature screening.
 *
 * Step 1: suggestScreeningCriteria
 *   Generates PRISMA-style inclusion/exclusion criteria for a specific
 *   research gap topic identified in the gap analysis.
 *
 * Step 2: runTitleAbstractScreening
 *   Screens each existing review title + abstract against approved criteria,
 *   returning include / exclude / uncertain verdicts with one-line reasons.
 */

import { ApiError } from "@/lib/errors";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import { fetchPrimaryStudiesForScreening as pubmedFetch } from "@/lib/pubmed";
import { fetchPrimaryStudiesForScreening as openalexFetch } from "@/lib/openalex";
import { fetchPrimaryStudiesForScreening as scopusFetch } from "@/lib/scopus";
import type { ExistingReview, GapDimension, ScreeningCriteria, ScreeningDecision, ScreeningReasonCode } from "@/types";

// ---------------------------------------------------------------------------
// Multi-source primary study fetch with deduplication
// ---------------------------------------------------------------------------

/**
 * Fetch primary study records from PubMed, OpenAlex, and Scopus in parallel,
 * then deduplicate by PMID and DOI so Gemini sees each article only once.
 *
 * Each source contributes up to `limitPerSource` records. After dedup the
 * combined list is capped at `maxTotal` to stay within Gemini's practical
 * screening capacity. Sources are prioritised in order: PubMed → OpenAlex →
 * Scopus (by dedup insertion order).
 *
 * Graceful degradation: a failure from any single source is logged and ignored;
 * the remaining sources still contribute their records.
 *
 * @param query          Original search query (same string used in /api/search)
 * @param limitPerSource Max records per source (default 200; PubMed/Scopus cap at 200, OpenAlex at 200)
 * @param maxTotal       Hard cap on the combined deduped list (default 500)
 *                       Increase freely — batching in runTitleAbstractScreening handles any size.
 */
export async function fetchAllPrimaryStudiesForScreening(
  query: string,
  limitPerSource = 200,
  maxTotal = 500,
): Promise<ExistingReview[]> {
  const [pubmed, openalex, scopus] = await Promise.allSettled([
    pubmedFetch(query, limitPerSource),
    openalexFetch(query, limitPerSource),
    scopusFetch(query, limitPerSource),
  ]);

  const allRecords: ExistingReview[] = [];
  const seenPmids = new Set<string>();
  const seenDois  = new Set<string>();

  function normalizeDoi(doi: string | undefined): string | undefined {
    if (!doi) return undefined;
    return doi.toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim();
  }

  function addRecords(records: ExistingReview[]) {
    for (const r of records) {
      const pmid = r.pmid?.trim();
      const doi  = normalizeDoi(r.doi);

      // Skip if we've already added this article from another source
      if (pmid && seenPmids.has(pmid)) continue;
      if (doi  && seenDois.has(doi))   continue;

      if (pmid) seenPmids.add(pmid);
      if (doi)  seenDois.add(doi);
      allRecords.push(r);

      if (allRecords.length >= maxTotal) return; // cap reached
    }
  }

  if (pubmed.status === "fulfilled")   addRecords(pubmed.value);
  else console.warn("[screening] PubMed fetch failed:", (pubmed.reason as Error)?.message);

  if (allRecords.length < maxTotal) {
    if (openalex.status === "fulfilled") addRecords(openalex.value);
    else console.warn("[screening] OpenAlex fetch failed:", (openalex.reason as Error)?.message);
  }

  if (allRecords.length < maxTotal) {
    if (scopus.status === "fulfilled")   addRecords(scopus.value);
    else console.warn("[screening] Scopus fetch failed:", (scopus.reason as Error)?.message);
  }

  return allRecords;
}

// ---------------------------------------------------------------------------
// Screening capacity constants
// ---------------------------------------------------------------------------

/**
 * Maximum articles sent to Gemini in a single screening call.
 *
 * Gemini 2.5 Flash supports up to 65 536 output tokens. With criterion_results
 * (per-criterion chain-of-thought) each decision costs ~300–400 tokens, so
 * a batch of 150 comfortably fits within the output budget.
 *
 * runTitleAbstractScreening splits larger lists into batches of this size and
 * merges the results — so the overall cap is determined only by how many
 * articles you fetch, not by Gemini's per-call limits.
 *
 * Raise this number if you find Gemini reliably handling larger batches for
 * your typical query (simpler criteria = smaller output per decision).
 */
const SCREENING_BATCH_SIZE = 150;

// ---------------------------------------------------------------------------
// Gemini plumbing (reuses same model / key as gemini.ts)
// ---------------------------------------------------------------------------

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message: string };
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  // Try array first (screening step 2 returns an array)
  const arrStart = text.indexOf("[");
  const arrEnd = text.lastIndexOf("]");
  const objStart = text.indexOf("{");
  const objEnd = text.lastIndexOf("}");
  if (arrStart !== -1 && arrEnd !== -1 && (objStart === -1 || arrStart < objStart)) {
    return text.slice(arrStart, arrEnd + 1);
  }
  if (objStart !== -1 && objEnd !== -1) return text.slice(objStart, objEnd + 1);
  return text.trim();
}

async function callGemini(userPrompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ApiError("Gemini API key not configured", 500);

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 16384, // Increased: 250 decisions with criterion_results need ~10k tokens
        responseMimeType: "application/json",
      },
    }),
  });

  const data = (await res.json()) as GeminiResponse;

  if (!res.ok || data.error) {
    throw new ApiError(
      `Gemini API error: ${data.error?.message ?? res.status}`,
      502,
      "AI screening is temporarily unavailable. Please try again in a few minutes."
    );
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new ApiError("Gemini returned empty response", 502);
  return text;
}

// ---------------------------------------------------------------------------
// Step 1: Criteria suggestion
// ---------------------------------------------------------------------------

function buildCriteriaPrompt(
  query: string,
  topicTitle: string,
  gapType: GapDimension,
  rationale: string,
  overallAssessment: string
): string {
  return `You are a systematic review methodologist. Generate PRISMA-compliant inclusion and exclusion criteria for screening systematic review literature.

SEARCH TOPIC: <USER_QUERY>${query}</USER_QUERY>

IDENTIFIED RESEARCH GAP TOPIC: <USER_QUERY>${topicTitle}</USER_QUERY>
GAP DIMENSION: ${gapType}
GAP RATIONALE: <USER_QUERY>${rationale}</USER_QUERY>

OVERALL EVIDENCE LANDSCAPE: <USER_QUERY>${overallAssessment}</USER_QUERY>

Task: Generate specific, actionable inclusion and exclusion criteria that a researcher would apply when screening existing systematic reviews to assess how well this specific gap has (or hasn't) been addressed.

Rules:
- Each criterion must be concrete and assessable from a title + abstract
- Inclusion criteria should identify reviews directly relevant to the gap
- Exclusion criteria should filter out reviews that do not address the gap
- Generate 3–5 inclusion criteria and 3–5 exclusion criteria
- Keep each criterion to one clear sentence
- Write a one-sentence "focus_gap" describing the specific gap angle being targeted

Respond with raw JSON only (no markdown, no code fences):
{
  "inclusion": ["criterion text", "..."],
  "exclusion": ["criterion text", "..."],
  "focus_gap": "One sentence describing the specific gap angle targeted by these criteria"
}`;
}

interface CriteriaRaw {
  inclusion: unknown;
  exclusion: unknown;
  focus_gap: unknown;
}

function validateCriteria(obj: unknown): obj is CriteriaRaw {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    Array.isArray(o.inclusion) &&
    Array.isArray(o.exclusion) &&
    typeof o.focus_gap === "string"
  );
}

export async function suggestScreeningCriteria(
  query: string,
  topicTitle: string,
  gapType: GapDimension,
  rationale: string,
  overallAssessment: string
): Promise<ScreeningCriteria> {
  const prompt = buildCriteriaPrompt(query, topicTitle, gapType, rationale, overallAssessment);
  const raw = await callGemini(prompt);
  const json = extractJson(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ApiError(
      "Criteria JSON parse failed",
      502,
      "AI returned malformed criteria. Please try again."
    );
  }

  if (!validateCriteria(parsed)) {
    throw new ApiError(
      "Criteria response missing required fields",
      502,
      "AI returned incomplete criteria. Please try again."
    );
  }

  return {
    inclusion: (parsed.inclusion as string[]).filter((s) => typeof s === "string"),
    exclusion: (parsed.exclusion as string[]).filter((s) => typeof s === "string"),
    focus_gap: parsed.focus_gap as string,
    gap_type: gapType,
    topic_title: topicTitle,
  };
}

// ---------------------------------------------------------------------------
// Step 2: Title + abstract screening
// ---------------------------------------------------------------------------

function buildScreeningPrompt(
  reviews: ExistingReview[],
  criteria: ScreeningCriteria
): string {
  const inclusionList = criteria.inclusion.map((c, i) => `I${i + 1}. ${c}`).join("\n");
  const exclusionList = criteria.exclusion.map((c, i) => `E${i + 1}. ${c}`).join("\n");

  const reviewsText = reviews
    .map(
      (r, i) =>
        `${i + 1}. Title: "${r.title}" | Year: ${r.year || "n/a"} | Journal: ${r.journal || "n/a"}${
          r.abstract_snippet ? ` | Abstract: ${r.abstract_snippet.slice(0, 400)}` : ""
        }`
    )
    .join("\n");

  return `Screen the following systematic reviews against the provided inclusion and exclusion criteria.

GAP FOCUS: ${criteria.focus_gap}

INCLUSION CRITERIA (review must meet ALL of these):
${inclusionList}

EXCLUSION CRITERIA (review fails if ANY of these apply):
${exclusionList}

REVIEWS TO SCREEN (${reviews.length} total):
${reviewsText}

For each review, reason through EACH criterion explicitly before giving a final verdict.
Decision rules:
- "include"   → meets all inclusion criteria AND fails no exclusion criteria
- "exclude"   → fails at least one exclusion criterion OR fails a key inclusion criterion
- "uncertain" → title/abstract lacks enough information to decide reliably

reason_code (ONLY for "exclude" decisions — pick the single best-fitting code):
  "wrong_population"       – participants do not match target population
  "wrong_intervention"     – intervention/exposure differs from gap focus
  "wrong_outcome"          – does not measure relevant outcomes
  "wrong_design"           – study design does not meet inclusion criteria
  "wrong_timeframe"        – publication or follow-up period outside scope
  "duplicate"              – duplicate of another record
  "not_systematic_review"  – not a systematic review (e.g. primary study, editorial)
  "insufficient_data"      – too little information in title/abstract to assess
  "off_topic"              – topic does not address the identified gap
For "include" and "uncertain" decisions, omit reason_code or set it to null.

confidence:
  "high"   – clear-cut decision; title/abstract make the verdict unambiguous
  "medium" – moderately confident; abstract provides enough but not complete information
  "low"    – borderline; human should verify before accepting

Respond with a JSON array — one object per review, in the same order as the input list:
[
  {
    "index": 0,
    "decision": "include|exclude|uncertain",
    "reason": "One sentence summary referencing the key criterion that determined the decision.",
    "reason_code": "off_topic|wrong_population|...|null",
    "confidence": "high|medium|low",
    "criterion_results": [
      {"criterion": "exact criterion text", "type": "inclusion", "met": true, "note": "one sentence explaining how the title/abstract does or does not satisfy this criterion"},
      {"criterion": "exact criterion text", "type": "exclusion", "met": false, "note": "one sentence"}
    ]
  },
  ...
]
Produce exactly ${reviews.length} objects. Each criterion_results array must cover every inclusion and exclusion criterion listed above.`;
}

interface CriterionResultRaw {
  criterion: string;
  type: "inclusion" | "exclusion";
  met: boolean;
  note: string;
}

interface DecisionRaw {
  index: number;
  decision: "include" | "exclude" | "uncertain";
  reason: string;
  reason_code?: string | null;
  confidence?: "high" | "medium" | "low";
  criterion_results?: CriterionResultRaw[];
}

const VALID_REASON_CODES = new Set<string>([
  "wrong_population", "wrong_intervention", "wrong_outcome", "wrong_design",
  "wrong_timeframe", "duplicate", "not_systematic_review", "insufficient_data", "off_topic",
]);

function parseReasonCode(raw: string | null | undefined, decision: string): ScreeningReasonCode | undefined {
  if (decision !== "exclude" || !raw || typeof raw !== "string") return undefined;
  return VALID_REASON_CODES.has(raw) ? (raw as ScreeningReasonCode) : undefined;
}

function parseConfidence(raw: string | undefined): "high" | "medium" | "low" | undefined {
  if (raw === "high" || raw === "medium" || raw === "low") return raw;
  return undefined;
}

function validateDecisions(arr: unknown, expectedLength: number): arr is DecisionRaw[] {
  if (!Array.isArray(arr)) return false;
  if (arr.length !== expectedLength) return false;
  return arr.every(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as Record<string, unknown>).index === "number" &&
      ["include", "exclude", "uncertain"].includes(
        (item as Record<string, unknown>).decision as string
      ) &&
      typeof (item as Record<string, unknown>).reason === "string"
  );
}

/** Screen a single batch (≤ SCREENING_BATCH_SIZE records) against criteria. */
async function screenBatch(
  batch: ExistingReview[],
  criteria: ScreeningCriteria
): Promise<ScreeningDecision[]> {
  const prompt = buildScreeningPrompt(batch, criteria);
  const raw = await callGemini(prompt);
  const json = extractJson(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ApiError(
      "Screening JSON parse failed",
      502,
      "AI returned malformed screening results. Please try again."
    );
  }

  if (!validateDecisions(parsed, batch.length)) {
    // Attempt to work with a partial / length-mismatch response by padding
    if (Array.isArray(parsed) && parsed.length > 0) {
      const filled: DecisionRaw[] = batch.map((_, i) => {
        const found = (parsed as DecisionRaw[]).find((d) => d.index === i);
        return (
          found ?? {
            index: i,
            decision: "uncertain" as const,
            reason: "Could not be assessed — abstract not available.",
          }
        );
      });
      return filled.map((d, i) => mapDecision(d, batch[i]));
    }
    throw new ApiError(
      "Screening response validation failed",
      502,
      "AI screening returned unexpected format. Please try again."
    );
  }

  return (parsed as DecisionRaw[]).map((d, i) => mapDecision(d, batch[i]));
}

function mapDecision(d: DecisionRaw, record: ExistingReview): ScreeningDecision {
  return {
    title: record.title,
    year: record.year,
    journal: record.journal,
    pmid: record.pmid,
    doi: record.doi,
    decision: d.decision,
    reason: d.reason,
    reason_code: parseReasonCode(d.reason_code, d.decision),
    confidence: parseConfidence(d.confidence),
    criterion_results: d.criterion_results,
  };
}

/**
 * Screen a list of records against inclusion/exclusion criteria.
 *
 * Automatically batches large lists into chunks of SCREENING_BATCH_SIZE
 * (default 150) and runs each batch sequentially against Gemini, then merges
 * results. This removes the per-call output-token ceiling — you can screen
 * hundreds or thousands of articles limited only by API rate limits and time.
 *
 * Batches are sequential (not parallel) to respect Gemini rate limits.
 */
export async function runTitleAbstractScreening(
  reviews: ExistingReview[],
  criteria: ScreeningCriteria
): Promise<ScreeningDecision[]> {
  if (reviews.length === 0) return [];

  // If the list fits in one batch, skip the overhead
  if (reviews.length <= SCREENING_BATCH_SIZE) {
    return screenBatch(reviews, criteria);
  }

  // Split into batches and process sequentially
  const allDecisions: ScreeningDecision[] = [];
  for (let start = 0; start < reviews.length; start += SCREENING_BATCH_SIZE) {
    const batch = reviews.slice(start, start + SCREENING_BATCH_SIZE);
    console.log(
      `[screening] Batch ${Math.floor(start / SCREENING_BATCH_SIZE) + 1}/${Math.ceil(reviews.length / SCREENING_BATCH_SIZE)} — ${batch.length} records`
    );
    const decisions = await screenBatch(batch, criteria);
    allDecisions.push(...decisions);
  }

  return allDecisions;
}
