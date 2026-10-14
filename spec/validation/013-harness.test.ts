/**
 * Validation 013 harness — handoff 123 (table≠figure routing), Brief 009 "Tester focus".
 *  A) DETERMINISTIC (always runs): coincidental-match probe. Real fixture text, stubbed passes that BOTH
 *     flag from_figure and read a value that exists only incidentally elsewhere in the text.
 *  B) LIVE (LIVE=1, needs GEMINI_API_KEY): route POST with full PDF x3 and tables-removed PDF x3.
 * Truth: Pattanaseri 2024 (doi 10.1186/s12888-024-05951-5) Tables 1-4, read from Europe PMC JATS XML PMC11256507
 * (see validation 012). Fixtures: 012 PDFs (rendered from XML; not publisher layout).
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "tester" } } }) } }),
}));
import { POST } from "@/app/api/extract/route";
import { pdfToPages } from "@/lib/extraction-pdf";
import { extractOutcomes } from "@/lib/extraction";

const FULL = "spec/validation/fixtures/012-pattanaseri2024-rendered.pdf";
const ABLATED = "spec/validation/fixtures/012-pattanaseri2024-tables-removed.pdf";

describe("013A coincidental-match probe (deterministic)", () => {
  it("figure-flagged values that coincide with incidental text", async () => {
    const r = await pdfToPages(new Uint8Array(readFileSync(ABLATED)));
    if (!r.ok) throw new Error("pdf");
    const pages = r.pages;
    // numbers that occur in the body text but are NOT the answer to a figure-only target
    const probes: { v: number; why: string }[] = [
      { v: 10, why: "small integer (day 10 / n)" }, { v: 31, why: "day 31" }, { v: 60, why: "MADRS max / day 60" },
      { v: 2, why: "tiny integer" }, { v: 12.55, why: "abstract decimal" }, { v: 0.05, why: "p-threshold" },
    ];
    const out: unknown[] = [];
    for (const p of probes) {
      // page where the number occurs in text
      const re = new RegExp(`(?<![\\d.])${String(p.v).replace(".", "\\.")}(?!\\d)`);
      const hit = pages.find((pg) => re.test(pg.text));
      const mk = (fig: boolean) => () => ({ value: p.v, page: hit?.page, source_text: String(p.v), from_figure: fig });
      const both = extractOutcomes(pages, [{ id: "t", label: "value read off Figure 2 (not in any table)" }], { transcriber: mk(true), hunter: mk(true) }).values[0];
      const oneSided = extractOutcomes(pages, [{ id: "t", label: "x" }], { transcriber: mk(true), hunter: () => ({ value: p.v, page: hit?.page, from_figure: false }) }).values[0];
      out.push({ ...p, textPage: hit?.page ?? null, bothFigure: both.status, oneSided: oneSided.status });
    }
    writeFileSync("spec/validation/013-coincidence.json", JSON.stringify(out, null, 2));
    console.log("[013A]", JSON.stringify(out));
    expect(out.length).toBe(probes.length);
  });
});

const live = process.env.LIVE === "1";
const T: { id: string; label: string; truth: number | null }[] = [
  { id: "k10", label: "Mean MADRS score at day 10, ketamine group, intention-to-treat (Table 2)", truth: 21.18 },
  { id: "m10", label: "Mean MADRS score at day 10, midazolam group, intention-to-treat (Table 2)", truth: 18.11 },
  { id: "k31", label: "Mean MADRS score at day 31, ketamine group, intention-to-treat (Table 2)", truth: 20.0 },
  { id: "kd10", label: "Mean change in MADRS from baseline at day 10, ketamine group, intention-to-treat (Table 3)", truth: 12.55 },
  { id: "md10", label: "Mean change in MADRS from baseline at day 10, midazolam group, intention-to-treat (Table 3)", truth: 17.22 },
  { id: "krem", label: "Mean days in remission, ketamine group (Table 4)", truth: 8.7 },
  { id: "age", label: "Mean age in years, ketamine group (Table 1)", truth: 32.36 },
  { id: "abs1", label: "HAM-D total score at day 10, ketamine group", truth: null },
  { id: "abs2", label: "MADRS score at day 60, ketamine group", truth: null },
];
async function run(path: string) {
  const fd = new FormData();
  fd.set("file", new File([readFileSync(path)], "x.pdf", { type: "application/pdf" }));
  fd.set("targets", JSON.stringify(T.map(({ id, label }) => ({ id, label, instrument: id === "abs1" ? undefined : "MADRS" }))));
  const res = await POST(new Request("http://x/api/extract", { method: "POST", body: fd }));
  return { status: res.status, body: (await res.json()) as any };
}
const RUNS: [string, string][] = [["full1", FULL], ["full2", FULL], ["full3", FULL], ["abl1", ABLATED], ["abl2", ABLATED], ["abl3", ABLATED]];
describe.skipIf(!live)("013B live", () => {
  for (const [name, path] of RUNS) {
    it(name, async () => {
      const t = Date.now();
      const r = await run(path);
      console.log(`[013] ${name} http=${r.status} ${Date.now() - t}ms`);
      writeFileSync(`spec/validation/013-results-${name}.json`, JSON.stringify({ T, name, ms: Date.now() - t, http: r.status, reason: r.body.reason, summary: r.body.result?.summary, values: r.body.result?.values }, null, 2));
    }, 400_000);
  }
});
