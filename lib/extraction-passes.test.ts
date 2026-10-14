import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildUserPrompt,
  createModelPass,
  parseReply,
  scopePages,
  callGeminiExtraction,
  ModelTimeoutError,
  type ModelCaller,
} from "@/lib/extraction-passes";
import { extractOutcomesAsync } from "@/lib/extraction";

const pages = [
  { page: 1, text: "MADRS change was 12.4 points." },
  { page: 2, text: "References\n1. Smith 2020. 99.9" },
];
const target = { id: "t1", label: "MADRS change", instrument: "MADRS" };
const ok = (json: object) => ({ text: JSON.stringify(json), truncated: false });

describe("extraction-passes", () => {
  it("excludes reference pages and caps scope", () => {
    expect(scopePages(pages).map((p) => p.page)).toEqual([1]);
    expect(scopePages([{ page: 1, text: "x".repeat(10) }, { page: 2, text: "y" }], 10)).toHaveLength(1);
    expect(buildUserPrompt(pages, target)).not.toContain("99.9");
  });

  it("never parses a truncated reply as a value", () => {
    expect(parseReply({ text: '{"value": 12.4}', truncated: true }).value).toBeNull();
  });

  it("parses value, provenance and stats; junk becomes null", () => {
    const c = parseReply(ok({ value: 12.4, page: 1, source_text: "12.4", stats: { n: 30, bad: 1 } }));
    expect(c).toMatchObject({ value: 12.4, page: 1, stats: { n: 30 } });
    expect(parseReply({ text: "not json", truncated: false }).value).toBeNull();
    expect(parseReply(ok({ value: "12.4" })).value).toBeNull();
  });

  it("async orchestration: fabricated model number is never verified", async () => {
    const call: ModelCaller = async () => ok({ value: 77.7, page: 1, source_text: "77.7" });
    const res = await extractOutcomesAsync(pages, [target], {
      transcriber: createModelPass("transcriber", call),
      hunter: createModelPass("hunter", call),
    });
    expect(res.values[0].status).toBe("check");
    expect(res.values[0].failure_code).toBe("not_in_source");
  });

  it("async orchestration: agreeing, present value is verified", async () => {
    const call: ModelCaller = async () => ok({ value: 12.4, page: 1, source_text: "12.4" });
    const res = await extractOutcomesAsync(pages, [target], {
      transcriber: createModelPass("transcriber", call),
      hunter: createModelPass("hunter", call),
    });
    expect(res.values[0].status).toBe("verified");
  });
});

describe("bounded model calls (validation 012)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });
  const timeoutErr = () => Object.assign(new Error("timed out"), { name: "TimeoutError" });

  it("retries once on timeout, then throws ModelTimeoutError", async () => {
    vi.stubEnv("GEMINI_API_KEY", "k");
    const fetchMock = vi.fn().mockRejectedValue(timeoutErr());
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    const p = callGeminiExtraction("s", "u");
    const assertion = expect(p).rejects.toBeInstanceOf(ModelTimeoutError);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("succeeds when the retry returns", async () => {
    vi.stubEnv("GEMINI_API_KEY", "k");
    const good = {
      ok: true,
      json: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "{}" }] } }] }),
    };
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(timeoutErr()).mockResolvedValueOnce(good));
    vi.useFakeTimers();
    const p = callGeminiExtraction("s", "u");
    await vi.runAllTimersAsync();
    expect(await p).toEqual({ text: "{}", truncated: false });
  });

  it("a stall while reading the response body is also retried, then ModelTimeoutError", async () => {
    vi.stubEnv("GEMINI_API_KEY", "k");
    // Headers arrive (fetch resolves) but the body read times out — the 012-style stall.
    const stalled = { ok: true, json: async () => { throw timeoutErr(); } };
    const fetchMock = vi.fn().mockResolvedValue(stalled);
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    const p = callGeminiExtraction("s", "u");
    const assertion = expect(p).rejects.toBeInstanceOf(ModelTimeoutError);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a timed-out target becomes manual (model_timeout), later targets still run", async () => {
    let n = 0;
    const call: ModelCaller = async () => {
      if (n++ < 2) throw new ModelTimeoutError();
      return ok({ value: 12.4, page: 1, source_text: "12.4" });
    };
    const pass = createModelPass("transcriber", call);
    const r = await extractOutcomesAsync(pages, [target, { ...target, id: "t2" }], { transcriber: pass, hunter: pass });
    expect(r.values[0].status).toBe("manual");
    expect(r.values[0].detail).toContain("model_timeout");
    expect(r.values[1].status).toBe("verified");
  });

  it("past the deadline, remaining targets are manual without calling the model", async () => {
    const call = vi.fn();
    const pass = createModelPass("transcriber", call);
    const r = await extractOutcomesAsync(pages, [target], { transcriber: pass, hunter: pass, deadline: Date.now() - 1 });
    expect(call).not.toHaveBeenCalled();
    expect(r.values[0].status).toBe("manual");
    expect(r.summary.manual).toBe(1);
  });
});
