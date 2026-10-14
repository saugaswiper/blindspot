import { describe, it, expect, vi, beforeEach } from "vitest";

const auth = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: auth.user } }) } }),
}));

vi.mock("@/lib/extraction-passes", () => ({
  createModelPass: () => async () => ({ value: null }),
  callGeminiExtraction: vi.fn(),
}));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://x/api/extract", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/extract", () => {
  beforeEach(() => {
    auth.user = { id: "u1" };
  });

  it("rejects unauthenticated callers with 401 (route spends Gemini quota)", async () => {
    auth.user = null;
    const res = await post({ pages: [{ page: 1, text: "x" }], targets: [{ id: "t1", label: "MADRS" }] });
    expect(res.status).toBe(401);
  });

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

  it("accepts a form-feed-separated text layer in place of pages", async () => {
    const res = await post({
      text: "MADRS 12.3\fsecond page",
      targets: [{ id: "t1", label: "MADRS" }],
    });
    expect(res.status).toBe(200);
  });

  it("rejects a blank text layer", async () => {
    const res = await post({ text: " \f ", targets: [{ id: "t1", label: "MADRS" }] });
    expect(res.status).toBe(400);
  });
});
