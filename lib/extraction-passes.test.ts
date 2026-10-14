import { describe, it, expect } from "vitest";
import {
  buildUserPrompt,
  createModelPass,
  parseReply,
  scopePages,
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
