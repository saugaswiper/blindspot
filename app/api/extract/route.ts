/**
 * /api/extract  (Brief 009, slice 2c-ii)
 *
 * Run the 4-check extraction gate over caller-supplied page text.
 *
 * POST /api/extract
 * - Request body: { pages: [{ page, text }] | text: "<form-feed-separated text layer>" | doi | pmid,
 *   targets: [{ id, label, instrument?, range? }] }
 * - Or multipart/form-data: `file` (a PDF, <= 25 MB) + `targets` (JSON string). Text layer only, no OCR.
 * - 200 → { result: ExtractionResult, method, disclosure, extracted_at }
 * - 400 → { error: string }  (malformed body)
 * - 422 → { status: "manual", reason, error }  (doi/pmid: no OA PDF, scanned, too large, …)
 *
 * Requires a signed-in user (it spends Gemini quota). No DB write. Page text is supplied by the caller, or
 * built from an open-access PDF resolved from doi/pmid (no OCR). The two passes are
 * AI-assisted, NOT dual-independent extraction (Cochrane §5.5.2) — disclosed.
 */

import { extractOutcomesAsync } from "@/lib/extraction";
import { splitIntoPages } from "@/lib/extraction-pages";
import { fetchPagesForIdentifier, MAX_PDF_BYTES } from "@/lib/extraction-fetch";
import { pdfToPages } from "@/lib/extraction-pdf";
import { createModelPass, callGeminiExtraction } from "@/lib/extraction-passes";
import { toApiError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const MAX_PAGES = 200;
const MAX_TARGETS = 50;

const RequestSchema = z
  .object({
    text: z.string().optional(),
    doi: z.string().trim().min(1).optional(),
    pmid: z.string().trim().min(1).optional(),
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
  });

export const maxDuration = 300;
/** Stop starting new targets after this; leaves room for one in-flight target (2×45 s + backoff) under maxDuration. */
const EXTRACTION_BUDGET_MS = 180_000;

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
    let upload: Uint8Array | undefined;
    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      try {
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) {
          return Response.json({ error: "Attach a PDF as `file`." }, { status: 400 });
        }
        if (file.size > MAX_PDF_BYTES) {
          return Response.json({ error: "PDF is larger than the 25 MB limit." }, { status: 413 });
        }
        upload = new Uint8Array(await file.arrayBuffer());
        if (String.fromCharCode(...upload.slice(0, 4)) !== "%PDF") {
          return Response.json({ error: "File is not a PDF." }, { status: 400 });
        }
        body = { targets: JSON.parse(String(form.get("targets") ?? "null")) };
      } catch {
        return Response.json({ error: "Invalid multipart request." }, { status: 400 });
      }
    } else {
      try {
        body = await request.json();
      } catch {
        return Response.json(
          { error: "Invalid JSON in request body." },
          { status: 400 },
        );
      }
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 },
      );
    }

    const { targets } = parsed.data;
    if (!upload && !(parsed.data.pages || parsed.data.text || parsed.data.doi || parsed.data.pmid)) {
      return Response.json({ error: "Provide pages, text, doi, pmid or a PDF file." }, { status: 400 });
    }
    let pages;
    if (upload) {
      // User-uploaded PDF: the main path for the ~70% of studies with no OA XML (validation 011).
      const parsedPdf = await pdfToPages(upload);
      if (!parsedPdf.ok) {
        return Response.json(
          {
            status: "manual",
            reason: parsedPdf.reason,
            error: "Could not extract automatically; extract this study manually.",
          },
          { status: 422 },
        );
      }
      pages = parsedPdf.pages.slice(0, MAX_PAGES);
    } else if (parsed.data.pages || parsed.data.text) {
      pages = (
        parsed.data.pages ?? splitIntoPages(parsed.data.text ?? "")
      ).slice(0, MAX_PAGES);
    } else {
      // Identifier input: open-access PDF only; anything unextractable is `manual`, never guessed.
      const fetched = await fetchPagesForIdentifier({
        doi: parsed.data.doi,
        pmid: parsed.data.pmid,
      });
      if (!fetched.ok) {
        return Response.json(
          {
            status: "manual",
            reason: fetched.reason,
            error: "Could not extract automatically; extract this study manually.",
          },
          { status: 422 },
        );
      }
      pages = fetched.pages.slice(0, MAX_PAGES);
    }
    if (pages.length === 0) {
      return Response.json(
        { error: "Provide at least one page of text." },
        { status: 400 },
      );
    }
    const result = await extractOutcomesAsync(pages, targets, {
      transcriber: createModelPass("transcriber", callGeminiExtraction),
      hunter: createModelPass("hunter", callGeminiExtraction),
      deadline: Date.now() + EXTRACTION_BUDGET_MS,
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
