/**
 * Validation 012 harness — PDF upload to /api/extract (handoff 121), LIVE Gemini.
 * Run:  LIVE=1 npx vitest run spec/validation/012-harness.test.ts
 * Skipped without LIVE=1. Needs GEMINI_API_KEY (loaded from .env.local by the caller).
 *
 * Calls the real route POST with a real multipart PDF, real unpdf, real Gemini; only Supabase auth is stubbed.
 * External truth: values printed in Tables 1–4 of Pattanaseri et al. 2024, BMC Psychiatry
 * (doi 10.1186/s12888-024-05951-5, CC BY), read by the tester directly from the Europe PMC JATS XML
 * (PMC11256507), not from the app's parser. Fixture PDFs are rendered from that XML (publisher PDFs are bot-blocked).
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "tester" } } }) } }),
}));
import { POST } from "@/app/api/extract/route";

const live = process.env.LIVE === "1";
const FULL = "spec/validation/fixtures/012-pattanaseri2024-rendered.pdf";
const ABLATED = "spec/validation/fixtures/012-pattanaseri2024-tables-removed.pdf";

/** truth: null = value is NOT reported in the paper (any `verified` is a false verification) */
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
  return { status: res.status, body: (await res.json()) as { result?: { values: Record<string, unknown>[]; summary: unknown }; reason?: string } };
}

const RUNS: [string, string][] = [["full1", FULL], ["full2", FULL], ["ablated", ABLATED]];
describe.skipIf(!live)("012 live PDF upload", () => {
  for (const [name, path] of RUNS) {
    it(name, async () => {
      const t = Date.now();
      const r = await run(path);
      console.log(`[012] ${name} http=${r.status} ${Date.now() - t}ms`);
      writeFileSync(`spec/validation/012-results-${name}.json`, JSON.stringify({ T, name, http: r.status, reason: r.body.reason, summary: r.body.result?.summary, values: r.body.result?.values }, null, 2));
      expect(r.status).toBe(200);
    }, 900_000);
  }
});
