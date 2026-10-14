/**
 * PDF bytes → numbered text-layer pages (Brief 009, slice 2c-ii part 2b).
 *
 * Uses `unpdf` (pdf.js) per-page text. Image-only (scanned) PDFs have no text layer and
 * are reported as `no_text_layer` so the caller can route them to manual extraction (no OCR).
 */
import { extractText, getDocumentProxy } from "unpdf";
import type { TextPage } from "@/lib/extraction-pages";

export type PdfPagesResult =
  | { ok: true; pages: TextPage[] }
  | { ok: false; reason: "no_text_layer" | "unreadable_pdf" };

export async function pdfToPages(bytes: Uint8Array): Promise<PdfPagesResult> {
  let texts: string[];
  try {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: false });
    texts = text;
  } catch {
    return { ok: false, reason: "unreadable_pdf" };
  }
  const pages = texts
    .map((t, i) => ({ page: i + 1, text: t.trim() }))
    .filter((p) => p.text.length > 0);
  return pages.length === 0
    ? { ok: false, reason: "no_text_layer" }
    : { ok: true, pages };
}
