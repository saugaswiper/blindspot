/**
 * /api/extract  (Brief 009, slice 2c-ii)
 *
 * Run the 4-check extraction gate over caller-supplied page text.
 *
 * POST /api/extract
 * - Request body: { pages: [{ page, text }] | text: "<form-feed-separated text layer>",
 *   targets: [{ id, label, instrument?, range? }] }
 * - 200 → { result: ExtractionResult, method, disclosure, extracted_at }
 * - 400 → { error: string }  (malformed body)
 *
 * Requires a signed-in user (it spends Gemini quota). No DB write. Page text is supplied by the caller
 * because there is no PDF → text-layer step yet (deferred). The two passes are
 * AI-assisted, NOT dual-independent extraction (Cochrane §5.5.2) — disclosed.
 */

import { extractOutcomesAsync } from "@/lib/extraction";
import { splitIntoPages } from "@/lib/extraction-pages";
import { createModelPass, callGeminiExtraction } from "@/lib/extraction-passes";
import { toApiError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const MAX_PAGES = 200;
const MAX_TARGETS = 50;

const RequestSchema = z
  .object({
    text: z.string().optional(),
    pages: z
      .array(
        z.object({
          page: z.number().int().min(1),
          text: z.string(),
        }),
      )
      .min(1, "Provide at least one page of text.")
      .max(MAX_PAGES)
      .optional(),
    targets: z
      .array(
        z.object({
          id: z.string().trim().min(1),
          label: z.string().trim().min(1),
          instrument: z.string().trim().min(1).optional(),
          range: z
            .object({ name: z.string(), min: z.number(), max: z.number() })
            .optional(),
        }),
      )
      .min(1, "Provide at least one target.")
      .max(MAX_TARGETS),
  })
  .refine((b) => b.pages || b.text, { message: "Provide pages or text." });

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    // Auth first: this route calls Gemini, so anonymous callers must not reach it.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json(
        { error: "Please sign in to use extraction." },
        { status: 401 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: "Invalid JSON in request body." },
        { status: 400 },
      );
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 },
      );
    }

    const { targets } = parsed.data;
    const pages = (
      parsed.data.pages ?? splitIntoPages(parsed.data.text ?? "")
    ).slice(0, MAX_PAGES);
    if (pages.length === 0) {
      return Response.json(
        { error: "Provide at least one page of text." },
        { status: 400 },
      );
    }
    const result = await extractOutcomesAsync(pages, targets, {
      transcriber: createModelPass("transcriber", callGeminiExtraction),
      hunter: createModelPass("hunter", callGeminiExtraction),
    });

    return Response.json(
      {
        result,
        method: result.method,
        disclosure:
          "AI-assisted two-pass extraction; not dual-independent extraction. Every value requires human review.",
        extracted_at: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    const apiError = toApiError(error);
    return Response.json(
      { error: apiError.userMessage },
      { status: apiError.statusCode },
    );
  }
}
