import { ApiError } from "@/lib/errors";
import { SYSTEM_PROMPT, PROTOCOL_SYSTEM_PROMPT } from "@/lib/prompts";
import type { GapAnalysis } from "@/types";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: { text?: string }[];
    };
  }[];
  error?: { message: string };
}

function extractJson(text: string): string {
  // Strip markdown code fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  // Find first { to last }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) return text.slice(start, end + 1);
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
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192, responseMimeType: "application/json" },
    }),
  });

  const data = (await res.json()) as GeminiResponse;

  if (!res.ok || data.error) {
    throw new ApiError(
      `Gemini API error: ${data.error?.message ?? res.status}`,
      502,
      "AI analysis is temporarily unavailable. Please try again in a few minutes."
    );
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new ApiError("Gemini returned empty response", 502);
  return text;
}

function validateGapAnalysis(obj: unknown): obj is GapAnalysis {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return Array.isArray(o.gaps) && Array.isArray(o.suggested_topics) && typeof o.overall_assessment === "string";
}

/**
 * Generate a free-text systematic review protocol draft (not JSON).
 * Uses text/plain response mode so Gemini returns Markdown directly.
 */
export async function generateProtocol(userPrompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ApiError("Gemini API key not configured", 500);

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: PROTOCOL_SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
    }),
  });

  const data = (await res.json()) as GeminiResponse;

  if (!res.ok || data.error) {
    throw new ApiError(
      `Gemini API error: ${data.error?.message ?? res.status}`,
      502,
      "Protocol generation is temporarily unavailable. Please try again in a few minutes."
    );
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new ApiError("Gemini returned empty protocol response", 502);

  return text;
}

export async function generateGapAnalysis(userPrompt: string): Promise<GapAnalysis> {
  let raw = await callGemini(userPrompt);
  let json = extractJson(raw);
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch (parseErr) {
    console.error("[gemini] JSON parse failed. Raw response (first 500 chars):", raw.slice(0, 500));
    console.error("[gemini] Parse error:", parseErr);
    // Retry once with an explicit reminder
    raw = await callGemini(userPrompt + "\n\nIMPORTANT: Respond with valid JSON only. No markdown, no explanation.");
    json = extractJson(raw);
    try {
      parsed = JSON.parse(json);
    } catch (retryErr) {
      console.error("[gemini] Retry JSON parse also failed. Raw:", raw.slice(0, 500));
      console.error("[gemini] Retry error:", retryErr);
      throw new ApiError("Gemini returned malformed JSON after retry", 502, "AI analysis returned an unexpected format. Please try again.");
    }
  }

  if (!validateGapAnalysis(parsed)) {
    console.error("[gemini] Validation failed. Parsed object keys:", Object.keys(parsed as object));
    throw new ApiError("Gemini response missing required fields", 502, "AI analysis returned incomplete data. Please try again.");
  }

  return parsed;
}
