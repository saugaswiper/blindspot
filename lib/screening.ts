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
import type { ExistingReview, GapDimension, ScreeningCriteria, ScreeningDecision } from "@/types";

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
        maxOutputTokens: 4096,
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

Respond with a JSON array — one object per review, in the same order as the input list:
[
  {
    "index": 0,
    "decision": "include|exclude|uncertain",
    "reason": "One sentence summary referencing the key criterion that determined the decision.",
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
  criterion_results?: CriterionResultRaw[];
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

export async function runTitleAbstractScreening(
  reviews: ExistingReview[],
  criteria: ScreeningCriteria
): Promise<ScreeningDecision[]> {
  if (reviews.length === 0) return [];

  const prompt = buildScreeningPrompt(reviews, criteria);
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

  if (!validateDecisions(parsed, reviews.length)) {
    // Attempt to work with a partial / length-mismatch response by padding
    if (Array.isArray(parsed) && parsed.length > 0) {
      const filled: DecisionRaw[] = reviews.map((_, i) => {
        const found = (parsed as DecisionRaw[]).find((d) => d.index === i);
        return (
          found ?? {
            index: i,
            decision: "uncertain" as const,
            reason: "Could not be assessed — abstract not available.",
          }
        );
      });
      return filled.map((d, i) => ({
        title: reviews[i].title,
        year: reviews[i].year,
        journal: reviews[i].journal,
        pmid: reviews[i].pmid,
        doi: reviews[i].doi,
        decision: d.decision,
        reason: d.reason,
        criterion_results: d.criterion_results,
      }));
    }
    throw new ApiError(
      "Screening response validation failed",
      502,
      "AI screening returned unexpected format. Please try again."
    );
  }

  return (parsed as DecisionRaw[]).map((d, i) => ({
    title: reviews[i].title,
    year: reviews[i].year,
    journal: reviews[i].journal,
    pmid: reviews[i].pmid,
    doi: reviews[i].doi,
    decision: d.decision,
    reason: d.reason,
    criterion_results: d.criterion_results,
  }));
}
