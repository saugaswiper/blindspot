import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/extraction-passes", () => ({
  createModelPass: () => async () => ({ value: null }),
  callGeminiExtraction: vi.fn(),
}));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://x/api/extract", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/extract", () => {
  it("rejects malformed JSON", async () => {
    const res = await POST(new Request("http://x/api/extract", { method: "POST", body: "{" }));
    expect(res.status).toBe(400);
  });

  it("rejects a body with no pages", async () => {
    const res = await post({ pages: [], targets: [{ id: "t1", label: "MADRS" }] });
    expect(res.status).toBe(400);
  });

  it("returns manual with disclosure when passes find nothing", async () => {
    const res = await post({
      pages: [{ page: 1, text: "MADRS 12.3" }],
      targets: [{ id: "t1", label: "MADRS" }],
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result.values[0].status).toBe("manual");
    expect(json.disclosure).toMatch(/not dual-independent/);
  });
});
