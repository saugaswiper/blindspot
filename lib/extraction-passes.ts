/**
 * Model-backed extraction passes (Brief 009, slice 2c-i).
 *
 * Builds the two differently-framed passes (cell-by-cell transcriber vs
 * target-hunter) for `extractOutcomesAsync`. The model call is injected
 * (`ModelCaller`), so prompt building, scope capping, bibliography exclusion,
 * truncation detection and reply parsing are unit-testable without a network.
 *
 * Field-report failure-mode fixes (§4.1): truncated model output is never
 * parsed as a value (→ null → `manual`); the page scope is capped; reference
 * pages are excluded so a cited number is not read from a bibliography.
 * Nothing here decides `verified` — the 4-check gate in `lib/extraction` does.
 * Continuation turns and a versioned cache are deferred (slice 2c-ii).
 */

import { ApiError } from "@/lib/errors";
import type { ExtractionPass, ExtractionTarget, PassCandidate } from "./extraction";
import type { SourcePage } from "./extraction-source";
import type { ReportedStats } from "./extraction-checks";

/** Bump when prompts change so any future cache key invalidates. */
export const EXTRACTION_PROMPT_VERSION = "009-2c-1";

/** Max characters of source text sent to the model per pass. */
export const MAX_SCOPE_CHARS = 60_000;

export interface ModelReply {
  text: string;
  /** True when the model stopped on its output limit (reply may be cut off). */
  truncated: boolean;
}
export type ModelCaller = (system: string, user: string) => Promise<ModelReply>;

export type PassFraming = "transcriber" | "hunter";

const FRAMING_SYSTEM: Record<PassFraming, string> = {
  transcriber:
    "You transcribe tables cell by cell. Locate the table or text that reports the requested outcome and copy the single number exactly as printed. Never compute, convert or round.",
  hunter:
    "You hunt for one specific outcome in a trial report. Find where the requested outcome is reported and copy its number exactly as printed. Never compute, convert or round.",
};

const REPLY_SHAPE =
  'Reply with JSON only: {"value": number|null, "page": number, "source_text": string, "locator": string, "from_figure": boolean, "stats": {"n","randomised","mean","sd","se","ciLow","ciHigh","events","total","proportion"}}. Use null for value if the outcome is not reported. Omit unknown stats.';

const REFERENCE_HEADING = /^\s*(references|bibliography|literature cited)\s*$/im;

/** Drop pages that open with a references heading, then cap total characters. */
export function scopePages(pages: SourcePage[], maxChars = MAX_SCOPE_CHARS): SourcePage[] {
  const out: SourcePage[] = [];
  let used = 0;
  for (const p of pages) {
    if (REFERENCE_HEADING.test(p.text.slice(0, 300))) continue;
    if (used + p.text.length > maxChars) break;
    used += p.text.length;
    out.push(p);
  }
  return out;
}

export function buildUserPrompt(pages: SourcePage[], target: ExtractionTarget): string {
  const body = scopePages(pages)
    .map((p) => `--- PAGE ${p.page} ---\n${p.text}`)
    .join("\n");
  return `Outcome: ${target.label}\n\n${REPLY_SHAPE}\n\n${body}`;
}

const STAT_KEYS: (keyof ReportedStats)[] = [
  "n", "randomised", "mean", "sd", "se", "ciLow", "ciHigh", "events", "total", "proportion",
];

/** Parse a model reply into a candidate; anything unusable → a null reading. */
export function parseReply(reply: ModelReply): PassCandidate {
  if (reply.truncated) return { value: null };
  const start = reply.text.indexOf("{");
  const end = reply.text.lastIndexOf("}");
  if (start === -1 || end <= start) return { value: null };
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(reply.text.slice(start, end + 1));
  } catch {
    return { value: null };
  }
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const value = num(raw.value) ?? null;
  const stats: ReportedStats = {};
  if (raw.stats && typeof raw.stats === "object") {
    for (const k of STAT_KEYS) {
      const v = num((raw.stats as Record<string, unknown>)[k]);
      if (v !== undefined) stats[k] = v;
    }
  }
  return {
    value,
    page: num(raw.page),
    source_text: str(raw.source_text),
    locator: str(raw.locator),
    from_figure: raw.from_figure === true ? true : undefined,
    stats: Object.keys(stats).length ? stats : undefined,
  };
}

/** Build one framed pass around an injected model caller. */
export function createModelPass(framing: PassFraming, call: ModelCaller): ExtractionPass {
  return async (pages, target) =>
    parseReply(await call(FRAMING_SYSTEM[framing], buildUserPrompt(pages, target)));
}

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

/** Per-attempt cap on a Gemini request (validation 012: unbounded calls hung >900 s). */
export const GEMINI_TIMEOUT_MS = 45_000;
const GEMINI_RETRY_BACKOFF_MS = 1_000;

/** A model call that did not complete in time (after one retry) → target is `manual`. */
export class ModelTimeoutError extends Error {
  readonly reason = "model_timeout";
  constructor(message = "Model call timed out") {
    super(message);
    this.name = "ModelTimeoutError";
  }
}

function isTimeout(e: unknown): boolean {
  return e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
}

/**
 * Live Gemini caller (temperature 0), bounded: each attempt has an
 * `AbortSignal.timeout`, with at most one retry after a short backoff.
 * Throws `ModelTimeoutError` if both attempts time out.
 */
export const callGeminiExtraction: ModelCaller = async (system, user) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ApiError("Gemini API key not configured", 500);
  const init = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 4096, responseMimeType: "application/json" },
    }),
  };
  let res: Response;
  try {
    res = await fetch(`${GEMINI_URL}?key=${apiKey}`, { ...init, signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS) });
  } catch (e) {
    if (!isTimeout(e)) throw e;
    await new Promise((r) => setTimeout(r, GEMINI_RETRY_BACKOFF_MS));
    try {
      res = await fetch(`${GEMINI_URL}?key=${apiKey}`, { ...init, signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS) });
    } catch (e2) {
      if (isTimeout(e2)) throw new ModelTimeoutError();
      throw e2;
    }
  }
  const data = (await res.json()) as {
    candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
    error?: { message: string };
  };
  if (!res.ok || data.error) {
    throw new ApiError(`Gemini API error: ${data.error?.message ?? res.status}`, 502);
  }
  const c = data.candidates?.[0];
  return { text: c?.content?.parts?.[0]?.text ?? "", truncated: c?.finishReason === "MAX_TOKENS" };
};
