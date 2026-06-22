/**
 * /api/fulltext  (Brief 001)
 *
 * Resolve a screened-in study's open-access full-text URL via the ranked
 * source chain in lib/fulltext.ts.
 *
 * POST /api/fulltext
 * - Request body: { doi?: string, pmid?: string }  (at least one required)
 * - 200 → { fulltext: FulltextResult, fetched_at: string }
 * - 404 → { error: string, reason: FulltextFailureReason }  (no OA URL found)
 * - 400 → { error: string }  (no identifier / malformed body)
 *
 * Stateless OA lookup: no auth and no DB write here. Persisting the resolved
 * URL onto the screening row is handled by the screening save route.
 */

import { resolveFulltext } from "@/lib/fulltext";
import { toApiError } from "@/lib/errors";
import { z } from "zod";

const RequestSchema = z
  .object({
    doi: z.string().trim().min(1).optional(),
    pmid: z.string().trim().min(1).optional(),
  })
  .refine((b) => b.doi || b.pmid, {
    message: "Provide a doi or pmid to resolve full text.",
  });

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON in request body." }, { status: 400 });
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 },
      );
    }

    const { doi, pmid } = parsed.data;
    const { result, reason } = await resolveFulltext(doi, pmid);

    if (!result) {
      return Response.json(
        { error: "No open-access full text found.", reason },
        { status: 404 },
      );
    }

    return Response.json(
      { fulltext: result, fetched_at: new Date().toISOString() },
      { status: 200 },
    );
  } catch (error) {
    const apiError = toApiError(error);
    return Response.json({ error: apiError.userMessage }, { status: apiError.statusCode });
  }
}
