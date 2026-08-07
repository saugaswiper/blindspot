/**
 * /api/fulltext  (Brief 001 + Brief 004)
 *
 * Two request paths, dispatched on Content-Type:
 *
 * 1. JSON  { doi?, pmid? }  (Brief 001) — resolve a screened-in study's
 *    open-access full-text URL via the ranked source chain in lib/fulltext.ts.
 *    - 200 → { fulltext: FulltextResult, fetched_at: string }
 *    - 404 → { error, reason }   (no OA URL found)
 *    - 400 → { error }           (no identifier / malformed body)
 *
 * 2. multipart/form-data  (Brief 004 — AC6 user-upload fallback) — when
 *    automated OA resolution dead-ends on a paywalled study, the reviewer
 *    uploads a PDF. Fields: `file` (application/pdf), `search_id`,
 *    `pmid_or_doi`. Stored to the `fulltext-uploads` bucket at
 *    {search_id}/{pmid_or_doi}.pdf and surfaced like an automated hit.
 *    - 200 → { fulltext: { url, source: "user_upload", content_type: "pdf" }, fetched_at }
 *    - 400 → { error }           (missing fields / wrong MIME type)
 *
 * The JSON path is stateless (no auth, no DB write); persistence onto the
 * screening row is handled by the screening save route. The upload path uses
 * the service-role client to write to Storage.
 */

import { resolveFulltext } from "@/lib/fulltext";
import { createServiceRoleClient } from "@/lib/supabase/service";
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

const UPLOAD_BUCKET = "fulltext-uploads";

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

/** Brief 001 — JSON open-access resolution path (unchanged). */
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

/** Brief 004 — multipart PDF upload fallback path. */
async function handleUpload(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid multipart form body." }, { status: 400 });
  }

  const file = form.get("file");
  const searchId = form.get("search_id");
  const pmidOrDoi = form.get("pmid_or_doi");

  if (!(file instanceof File)) {
    return Response.json({ error: "A PDF file is required." }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return Response.json(
      { error: "Only PDF files are accepted (application/pdf)." },
      { status: 400 },
    );
  }
  if (typeof searchId !== "string" || searchId.trim().length === 0) {
    return Response.json({ error: "search_id is required." }, { status: 400 });
  }
  if (typeof pmidOrDoi !== "string" || pmidOrDoi.trim().length === 0) {
    return Response.json({ error: "pmid_or_doi is required." }, { status: 400 });
  }

  // Slashes in a DOI would create spurious sub-paths; flatten them.
  const safeId = pmidOrDoi.trim().replace(/\//g, "_");
  const path = `${searchId.trim()}/${safeId}.pdf`;

  const supabase = createServiceRoleClient();
  const { error: uploadError } = await supabase.storage
    .from(UPLOAD_BUCKET)
    .upload(path, file, { contentType: "application/pdf", upsert: true });

  if (uploadError) {
    console.error("[fulltext/upload] storage upload failed:", uploadError.message);
    return Response.json({ error: "Failed to store the uploaded PDF." }, { status: 500 });
  }

  const { data: publicUrlData } = supabase.storage
    .from(UPLOAD_BUCKET)
    .getPublicUrl(path);

  return Response.json(
    {
      fulltext: {
        url: publicUrlData.publicUrl,
        source: "user_upload" as const,
        content_type: "pdf" as const,
      },
      fetched_at: new Date().toISOString(),
    },
    { status: 200 },
  );
}
