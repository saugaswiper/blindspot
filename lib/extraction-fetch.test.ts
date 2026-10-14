import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/extraction-pdf", () => ({
  pdfToPages: vi.fn(async () => ({ ok: true, pages: [{ page: 1, text: "hello" }] })),
}));

import { fetchPagesForIdentifier, MAX_PDF_BYTES } from "./extraction-fetch";
import { pdfToPages } from "@/lib/extraction-pdf";

const oa = (over = {}) => ({
  result: {
    url: "https://example.org/a.pdf",
    source: "unpaywall" as const,
    oa_status: "gold" as const,
    content_type: "pdf" as const,
    ...over,
  },
});

const pdfRes = (body = "%PDF-1.7 data", init: ResponseInit = {}) =>
  new Response(body, { status: 200, ...init });

const run = (resolved: unknown, res: Response | Error) =>
  fetchPagesForIdentifier(
    { doi: "10.1/x" },
    {
      resolve: vi.fn(async () => resolved) as never,
      fetchImpl: vi.fn(async () => {
        if (res instanceof Error) throw res;
        return res;
      }) as never,
    },
  );

describe("fetchPagesForIdentifier", () => {
  it("returns pages for an OA PDF", async () => {
    const r = await run(oa(), pdfRes());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pages[0].page).toBe(1);
  });
  it("no OA full text → no_open_access", async () => {
    const r = await run({ result: null, reason: "paywalled" }, pdfRes());
    expect(r).toEqual({ ok: false, reason: "no_open_access" });
  });
  it("HTML resolution → not_pdf", async () => {
    const r = await run(oa({ content_type: "html" }), pdfRes());
    expect(r).toEqual({ ok: false, reason: "not_pdf" });
  });
  it("non-https URL is refused", async () => {
    const r = await run(oa({ url: "http://example.org/a.pdf" }), pdfRes());
    expect(r).toEqual({ ok: false, reason: "download_failed" });
  });
  it("HTTP error / network error → download_failed", async () => {
    expect(await run(oa(), pdfRes("x", { status: 404 }))).toEqual({
      ok: false,
      reason: "download_failed",
    });
    expect(await run(oa(), new Error("boom"))).toEqual({
      ok: false,
      reason: "download_failed",
    });
  });
  it("oversized declared length → too_large", async () => {
    const r = await run(
      oa(),
      pdfRes("%PDF", { headers: { "content-length": String(MAX_PDF_BYTES + 1) } }),
    );
    expect(r).toEqual({ ok: false, reason: "too_large" });
  });
  it("body without %PDF magic → not_pdf", async () => {
    const r = await run(oa(), pdfRes("<html>login</html>"));
    expect(r).toEqual({ ok: false, reason: "not_pdf" });
  });
  it("propagates no_text_layer from the parser", async () => {
    vi.mocked(pdfToPages).mockResolvedValueOnce({ ok: false, reason: "no_text_layer" });
    const r = await run(oa(), pdfRes());
    expect(r).toEqual({ ok: false, reason: "no_text_layer" });
  });
});
