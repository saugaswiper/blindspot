import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveFulltext } from "@/lib/fulltext";

/**
 * Tests for the open-access full-text resolution chain (Brief 001).
 *
 * `global.fetch` is stubbed so the network is never touched. A small router
 * matches request URLs to canned responses per source, letting us assert
 * source priority, the no-paywall gate (AC4), provenance (AC3), graceful
 * degradation, and chain latency (AC2).
 */

type Canned = { status: number; json?: unknown; throw?: boolean; delay?: number };

function route(handlers: {
  unpaywall?: Canned;
  openalex?: Canned;
  europepmc?: Canned;
  idconv?: Canned;
}) {
  globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    let c: Canned | undefined;
    if (url.includes("api.unpaywall.org")) c = handlers.unpaywall;
    else if (url.includes("api.openalex.org")) c = handlers.openalex;
    else if (url.includes("fullTextXML")) c = handlers.europepmc;
    else if (url.includes("idconv")) c = handlers.idconv;
    if (!c) return new Response("not found", { status: 404 });
    if (c.delay) await new Promise((r) => setTimeout(r, c.delay));
    if (c.throw) throw new Error("network down");
    return new Response(c.json !== undefined ? JSON.stringify(c.json) : "", {
      status: c.status,
    });
  }) as unknown as typeof fetch;
}

const realFetch = globalThis.fetch;

describe("resolveFulltext — source chain", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    delete process.env.OPENALEX_API_KEY;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("resolves via Unpaywall (primary) with PDF provenance", async () => {
    route({
      unpaywall: {
        status: 200,
        json: {
          is_oa: true,
          oa_status: "gold",
          best_oa_location: { url_for_pdf: "https://oa.example/paper.pdf" },
        },
      },
    });
    const { result } = await resolveFulltext("10.1/abc");
    expect(result).toEqual({
      url: "https://oa.example/paper.pdf",
      source: "unpaywall",
      oa_status: "gold",
      content_type: "pdf",
    });
  });

  it("falls through to OpenAlex when Unpaywall has no OA copy", async () => {
    route({
      unpaywall: { status: 200, json: { is_oa: false, oa_status: "closed" } },
      openalex: {
        status: 200,
        json: { open_access: { is_oa: true, oa_status: "green", oa_url: "https://oa.example/v" } },
      },
    });
    const { result } = await resolveFulltext("10.1/abc");
    expect(result?.source).toBe("openalex");
    expect(result?.content_type).toBe("html");
  });

  it("falls through to Europe PMC, then PMC, for a PMID-only study", async () => {
    route({
      europepmc: { status: 404 },
      idconv: { status: 200, json: { records: [{ pmid: "123", pmcid: "PMC999" }] } },
    });
    const { result } = await resolveFulltext(undefined, "123");
    expect(result?.source).toBe("pmc");
    expect(result?.url).toContain("PMC999");
    expect(result?.content_type).toBe("pdf");
  });

  it("uses Europe PMC full text before PMC when available", async () => {
    route({
      europepmc: { status: 200 },
      idconv: { status: 200, json: { records: [{ pmcid: "PMC999" }] } },
    });
    const { result } = await resolveFulltext(undefined, "123");
    expect(result?.source).toBe("europepmc");
  });
});

describe("resolveFulltext — no-paywall gate (AC4) and reason codes (AC3)", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    delete process.env.OPENALEX_API_KEY;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("never returns a closed-access record and reports 'paywalled'", async () => {
    route({
      unpaywall: { status: 200, json: { is_oa: false, oa_status: "closed" } },
      openalex: {
        status: 200,
        json: { open_access: { is_oa: false, oa_status: "closed", oa_url: null } },
      },
    });
    const { result, reason } = await resolveFulltext("10.1/closed");
    expect(result).toBeNull();
    expect(reason).toBe("paywalled");
  });

  it("reports 'all_sources_failed' when nothing is found", async () => {
    route({ unpaywall: { status: 404 }, openalex: { status: 404 } });
    const { result, reason } = await resolveFulltext("10.1/missing");
    expect(result).toBeNull();
    expect(reason).toBe("all_sources_failed");
  });

  it("reports 'all_sources_failed' when no identifier is supplied", async () => {
    const { result, reason } = await resolveFulltext(undefined, undefined);
    expect(result).toBeNull();
    expect(reason).toBe("all_sources_failed");
  });

  it("degrades gracefully: a thrown source never blocks the chain", async () => {
    route({
      unpaywall: { status: 200, throw: true },
      openalex: {
        status: 200,
        json: { open_access: { is_oa: true, oa_status: "gold", oa_url: "https://oa.example/x.pdf" } },
      },
    });
    const { result } = await resolveFulltext("10.1/abc");
    expect(result?.source).toBe("openalex");
  });

  it("reports 'source_error' when every source throws", async () => {
    route({ unpaywall: { status: 200, throw: true }, openalex: { status: 200, throw: true } });
    const { result, reason } = await resolveFulltext("10.1/abc");
    expect(result).toBeNull();
    expect(reason).toBe("source_error");
  });

  it("normalizes DOIs (strips doi.org prefix and lowercases) before querying", async () => {
    route({
      unpaywall: {
        status: 200,
        json: { is_oa: true, oa_status: "gold", best_oa_location: { url: "https://oa.example/h" } },
      },
    });
    await resolveFulltext("https://doi.org/10.1/ABC");
    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain("10.1%2Fabc");
  });
});

describe("resolveFulltext — latency (AC2)", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    delete process.env.OPENALEX_API_KEY;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("resolves within the 3s p95 budget against recorded fixtures", async () => {
    route({
      unpaywall: {
        status: 200,
        json: { is_oa: true, oa_status: "gold", best_oa_location: { url_for_pdf: "https://oa.example/p.pdf" } },
      },
    });
    const start = Date.now();
    const { result } = await resolveFulltext("10.1/abc");
    expect(result).not.toBeNull();
    expect(Date.now() - start).toBeLessThanOrEqual(3000);
  });

  // AC2-unit (brief 002): the DOI fanout must complete in ~max(source latency),
  // not ~sum. A slow Unpaywall miss (400 ms) must not delay an OpenAlex hit that
  // lands at 200 ms. This test FAILS if the orchestrator is reverted to a
  // sequential chain (which would take ~600 ms).
  it("races DOI sources concurrently: a slow miss never delays a faster hit", async () => {
    route({
      // Higher-priority source misses, but takes the longest to respond.
      unpaywall: { status: 200, delay: 400, json: { is_oa: false, oa_status: "closed" } },
      // Lower-priority source hits and responds sooner.
      openalex: {
        status: 200,
        delay: 200,
        json: { open_access: { is_oa: true, oa_status: "green", oa_url: "https://oa.example/v.pdf" } },
      },
    });
    const start = Date.now();
    const { result } = await resolveFulltext("10.1/abc");
    const elapsed = Date.now() - start;
    expect(result?.source).toBe("openalex");
    // Concurrent: ~200 ms (OpenAlex). Sequential would be ~600 ms (400 + 200).
    expect(elapsed).toBeLessThanOrEqual(350);
  });

  it("does not serially accumulate latency when both DOI sources are slow", async () => {
    route({
      unpaywall: { status: 404, delay: 300 },
      openalex: {
        status: 200,
        delay: 300,
        json: { open_access: { is_oa: true, oa_status: "gold", oa_url: "https://oa.example/x.pdf" } },
      },
    });
    const start = Date.now();
    const { result } = await resolveFulltext("10.1/abc");
    const elapsed = Date.now() - start;
    expect(result?.source).toBe("openalex");
    // Concurrent: ~300 ms (max). Sequential would be ~600 ms (sum).
    expect(elapsed).toBeLessThanOrEqual(450);
  });
});
