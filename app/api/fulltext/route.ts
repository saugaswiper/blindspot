/**
 * /api/fulltext  (Brief 001; upload path added Brief 004 / AC6)
 *
 * Resolve a screened-in study's open-access full-text URL via the ranked
 * source chain in lib/fulltext.ts, OR accept a reviewer-uploaded PDF when
 * automated resolution dead-ends.
 *
 * POST /api/fulltext — two request shapes, selected by Content-Type:
 *
 *  1. JSON (`application/json`) — OA resolution (unchanged):
 *     - Request body: { doi?: string, pmid?: string }  (at least one required)
 *     - 200 → { fulltext: FulltextResult, fetched_at: string }
 *     - 404 → { error: string, reason: FulltextFailureReason }  (no OA URL found)
 *     - 400 → { error: string }  (no identifier / malformed body)
 *
 *  2. multipart/form-data — user upload fallback (Brief 004 / AC6):
 *     - Fields: file (PDF), search_id, pmid_or_doi
 *     - 200 → { fulltext: { url, source: "user_upload" }, fetched_at: string }
 *     - 400 → { error: string }  (missing field / non-PDF MIME type)
 *
 * JSON path is stateless (no DB write). The upload path stores the PDF to
 * Supabase Storage and returns its public URL; persisting the URL + source
 * onto the screening row is still handled by the screening save route.
 */

import { resolveFulltext } from "@/lib/fulltext";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { toApiError } from "@/lib/errors";
import { z } from "zod";

const UPLOAD_BUCKET = "fulltext-uploads";

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
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.startsWith("multipart/form-data")) {
      return await handleUpload(request);
    }

    return await handleResolve(request);
  } catch (error) {
    const apiError = toApiError(error);
    return Response.json({ error: apiError.userMessage }, { status: apiError.statusCode });
  }
}

/** JSON path: automated open-access resolution (Brief 001, unchanged). */
async function handleResolve(request: Request): Promise<Response> {
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
}

/** multipart/form-data path: reviewer-uploaded PDF fallback (Brief 004 / AC6). */
async function handleUpload(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid multipart form data." }, { status: 400 });
  }

  const file = form.get("file");
  const searchId = form.get("search_id");
  const pmidOrDoi = form.get("pmid_or_doi");

  if (typeof searchId !== "string" || searchId.trim().length === 0) {
    return Response.json({ error: "Missing search_id." }, { status: 400 });
  }
  if (typeof pmidOrDoi !== "string" || pmidOrDoi.trim().length === 0) {
    return Response.json({ error: "Missing pmid_or_doi." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file." }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return Response.json(
      { error: "Uploaded file must be a PDF (application/pdf)." },
      { status: 400 },
    );
  }

  // Slashes in a DOI would create spurious sub-paths; replace them so the
  // identifier stays a single path segment (brief 004 storage convention).
  const safeId = pmidOrDoi.trim().replace(/\//g, "_");
  const path = `${searchId.trim()}/${safeId}.pdf`;

  const supabase = createServiceRoleClient();
  const { error: uploadError } = await supabase.storage
    .from(UPLOAD_BUCKET)
    .upload(path, file, { contentType: "application/pdf", upsert: true });

  if (uploadError) {
    throw uploadError;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(UPLOAD_BUCKET).getPublicUrl(path);

  return Response.json(
    {
      fulltext: { url: publicUrl, source: "user_upload" as const },
      fetched_at: new Date().toISOString(),
    },
    { status: 200 },
  );
}
