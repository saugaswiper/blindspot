import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseCrossrefRetraction,
  checkRetractions,
  retractionMap,
  clearRetractionCache,
  type CrossrefMessage,
} from "@/lib/retractions";

/**
 * Tests for retraction/withdrawal flagging.
 *
 * `parseCrossrefRetraction` is tested directly against representative Crossref
 * `message` shapes. `checkRetractions` is tested with a stubbed global `fetch`
 * so the network is never touched and graceful degradation is verifiable.
 */

describe("parseCrossrefRetraction", () => {
  it("flags via the is-retracted-by relation and captures the notice DOI", () => {
    const msg: CrossrefMessage = {
      DOI: "10.1/original",
      title: ["A perfectly normal-looking title"],
      relation: { "is-retracted-by": [{ id: "https://doi.org/10.1/NOTICE", "id-type": "doi" }] },
    };
    const flag = parseCrossrefRetraction(msg);
    expect(flag).toMatchObject({ doi: "10.1/original", type: "retraction", noticeDoi: "10.1/notice" });
  });

  it("flags via a RETRACTED: title prefix", () => {
    const flag = parseCrossrefRetraction({ DOI: "10.1/x", title: ["RETRACTED: Effects of X on Y"] });
    expect(flag?.type).toBe("retraction");
  });

  it("flags via a WITHDRAWN: title prefix", () => {
    const flag = parseCrossrefRetraction({ DOI: "10.1/x", title: ["Withdrawn: preliminary results"] });
    expect(flag?.type).toBe("withdrawal");
  });

  it("flags via an update-to expression_of_concern", () => {
    const msg: CrossrefMessage = {
      DOI: "10.1/x",
      title: ["Some study"],
      "update-to": [{ DOI: "10.1/eoc", type: "expression_of_concern", label: "Expression of concern" }],
    };
    expect(parseCrossrefRetraction(msg)?.type).toBe("expression_of_concern");
  });

  it("ignores non-discrediting update types like correction", () => {
    const msg: CrossrefMessage = {
      DOI: "10.1/x",
      title: ["Some study"],
      "update-to": [{ DOI: "10.1/corr", type: "correction" }],
    };
    expect(parseCrossrefRetraction(msg)).toBeNull();
  });

  it("returns null for a clean record", () => {
    expect(parseCrossrefRetraction({ DOI: "10.1/x", title: ["A normal article"] })).toBeNull();
  });

  it("returns null when there is no DOI to key on", () => {
    expect(parseCrossrefRetraction({ title: ["RETRACTED: no doi here"] })).toBeNull();
    expect(parseCrossrefRetraction(undefined)).toBeNull();
  });

  it("does not false-positive on 'retracted' mid-title", () => {
    // The convention is a leading prefix; mid-sentence mentions must not trip it.
    const flag = parseCrossrefRetraction({ DOI: "10.1/x", title: ["A review of retracted papers in oncology"] });
    expect(flag).toBeNull();
  });
});

describe("checkRetractions", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
    clearRetractionCache();
  });

  function mockCrossref(byDoi: Record<string, CrossrefMessage | "error" | "404">) {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      const match = Object.keys(byDoi).find((d) => url.includes(encodeURIComponent(d)) || url.includes(d));
      const entry = match ? byDoi[match] : "404";
      if (entry === "error") throw new Error("network down");
      if (entry === "404") return new Response("not found", { status: 404 });
      return new Response(JSON.stringify({ message: entry }), { status: 200 });
    }) as unknown as typeof fetch;
  }

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("returns flags only for retracted DOIs", async () => {
    mockCrossref({
      "10.1/retracted": { DOI: "10.1/retracted", title: ["RETRACTED: bad study"] },
      "10.1/clean": { DOI: "10.1/clean", title: ["Good study"] },
    });
    const flags = await checkRetractions([
      { doi: "10.1/retracted" },
      { doi: "10.1/clean" },
    ]);
    expect(flags).toHaveLength(1);
    expect(flags[0].doi).toBe("10.1/retracted");
  });

  it("degrades gracefully: a fetch error on one DOI never throws or blocks others", async () => {
    mockCrossref({
      "10.1/boom": "error",
      "10.1/retracted": { DOI: "10.1/retracted", title: ["RETRACTED: x"] },
    });
    const flags = await checkRetractions([{ doi: "10.1/boom" }, { doi: "10.1/retracted" }]);
    expect(flags.map((f) => f.doi)).toEqual(["10.1/retracted"]);
  });

  it("treats a 404 (unknown DOI) as not flagged", async () => {
    mockCrossref({ "10.1/unknown": "404" });
    expect(await checkRetractions([{ doi: "10.1/unknown" }])).toEqual([]);
  });

  it("skips records without a DOI (Crossref is DOI-keyed)", async () => {
    mockCrossref({});
    const flags = await checkRetractions([{ pmid: "12345" }]);
    expect(flags).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("deduplicates and normalizes DOIs before querying", async () => {
    mockCrossref({ "10.1/x": { DOI: "10.1/x", title: ["RETRACTED: x"] } });
    const flags = await checkRetractions([
      { doi: "https://doi.org/10.1/X" },
      { doi: "10.1/x" },
    ]);
    expect(flags).toHaveLength(1);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it("honors the limit option", async () => {
    mockCrossref({
      "10.1/a": { DOI: "10.1/a", title: ["RETRACTED: a"] },
      "10.1/b": { DOI: "10.1/b", title: ["RETRACTED: b"] },
    });
    const flags = await checkRetractions([{ doi: "10.1/a" }, { doi: "10.1/b" }], { limit: 1 });
    expect(flags).toHaveLength(1);
  });
});

describe("checkRetractions — caching", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
    clearRetractionCache();
  });
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("memoizes a successful lookup — second check does not re-fetch", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ message: { DOI: "10.1/x", title: ["RETRACTED: x"] } }), { status: 200 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await checkRetractions([{ doi: "10.1/x" }]);
    await checkRetractions([{ doi: "10.1/x" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not cache errors (a transient failure can be retried)", async () => {
    let call = 0;
    globalThis.fetch = vi.fn(async () => {
      call++;
      if (call === 1) throw new Error("boom");
      return new Response(JSON.stringify({ message: { DOI: "10.1/x", title: ["RETRACTED: x"] } }), { status: 200 });
    }) as unknown as typeof fetch;

    expect(await checkRetractions([{ doi: "10.1/x" }])).toEqual([]); // errored → not flagged, not cached
    const flags = await checkRetractions([{ doi: "10.1/x" }]);       // retried → flagged
    expect(flags).toHaveLength(1);
  });
});

describe("retractionMap", () => {
  it("keys flags by DOI for joining onto results", () => {
    const map = retractionMap([{ doi: "10.1/x", type: "retraction", label: "Retracted" }]);
    expect(map.get("10.1/x")?.type).toBe("retraction");
    expect(map.has("10.1/y")).toBe(false);
  });
});
