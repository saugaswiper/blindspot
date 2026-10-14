import { describe, it, expect, vi, beforeEach } from "vitest";

const extractText = vi.fn();
const getDocumentProxy = vi.fn();
vi.mock("unpdf", () => ({
  extractText: (...a: unknown[]) => extractText(...a),
  getDocumentProxy: (...a: unknown[]) => getDocumentProxy(...a),
}));

import { pdfToPages } from "./extraction-pdf";

beforeEach(() => {
  extractText.mockReset();
  getDocumentProxy.mockReset().mockResolvedValue({});
});

describe("pdfToPages", () => {
  it("returns numbered pages, keeping source numbers across blank pages", async () => {
    extractText.mockResolvedValue({ totalPages: 3, text: ["a ", "  ", " b"] });
    expect(await pdfToPages(new Uint8Array([1]))).toEqual({
      ok: true,
      pages: [
        { page: 1, text: "a" },
        { page: 3, text: "b" },
      ],
    });
    expect(extractText).toHaveBeenCalledWith({}, { mergePages: false });
  });

  it("reports no_text_layer for image-only PDFs", async () => {
    extractText.mockResolvedValue({ totalPages: 2, text: ["", " "] });
    expect(await pdfToPages(new Uint8Array([1]))).toEqual({ ok: false, reason: "no_text_layer" });
  });

  it("reports unreadable_pdf when parsing throws", async () => {
    getDocumentProxy.mockRejectedValue(new Error("bad pdf"));
    expect(await pdfToPages(new Uint8Array([1]))).toEqual({ ok: false, reason: "unreadable_pdf" });
  });
});
