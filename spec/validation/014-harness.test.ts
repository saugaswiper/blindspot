/**
 * Validation 014 harness — handoff 126 (hard request deadline aborts in-flight Gemini calls).
 *  A) STALL (STALL=1, no network): global fetch stubbed to hang until its AbortSignal fires; full route POST.
 *     Measures wall time vs. EXTRACTION_BUDGET_MS (180 s) and maxDuration (300 s).
 *  B) LIVE (LIVE=1, needs GEMINI_API_KEY): same 9 targets/fixtures as 013, full PDF x3 + tables-removed x3, timing + gate outcomes.
 * Truth: Pattanaseri 2024 (doi 10.1186/s12888-024-05951-5) Tables 1-4 from Europe PMC JATS XML PMC11256507 (see 012).
 * Results are written to spec/validation/014-results-*.json only when WRITE_RESULTS=1.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "tester" } } }) } }),
}));
import { POST } from "@/app/api/extract/route";

const FULL = "spec/validation/fixtures/012-pattanaseri2024-rendered.pdf";
const ABLATED = "spec/validation/fixtures/012-pattanaseri2024-tables-removed.pdf";

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
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
const RUNS: [string, string][] = [["full1", FULL], ["full2", FULL], ["full3", FULL], ["abl1", ABLATED], ["abl2", ABLATED], ["abl3", ABLATED]];
describe.skipIf(!live)("014B live", () => {
  for (const [name, path] of RUNS) {
    it(name, async () => {
      const t = Date.now();
      const r = await run(path);
      console.log(`[014] ${name} http=${r.status} ${Date.now() - t}ms`);
      if (process.env.WRITE_RESULTS === "1") writeFileSync(`spec/validation/014-results-${name}.json`, JSON.stringify({ T, name, ms: Date.now() - t, http: r.status, reason: r.body.reason, summary: (r.body.result as { summary?: unknown } | undefined)?.summary, values: (r.body.result as { values?: unknown } | undefined)?.values }, null, 2));
    }, 400_000);
  }
});

const stall = process.env.STALL === "1";
describe.skipIf(!stall)("014A stalled-model deadline", () => {
  it("hanging Gemini fetch is aborted by the request budget", async () => {
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (!String(input).includes("generativelanguage")) return realFetch(input, init);
      calls++;
      return new Promise<Response>((_, reject) => {
        const sig = init?.signal;
        if (sig?.aborted) reject(sig.reason);
        sig?.addEventListener("abort", () => reject(sig.reason));
      });
    }) as typeof fetch;
    process.env.GEMINI_API_KEY ||= "stub";
    const t = Date.now();
    const r = await run(FULL);
    const ms = Date.now() - t;
    globalThis.fetch = realFetch;
    const values = ((r.body.result as { values?: { status: string; reason?: string }[] } | undefined)?.values) ?? [];
    console.log(`[014A] http=${r.status} ${ms}ms fetchCalls=${calls} statuses=${JSON.stringify(values.map((v) => v.status + ":" + (v.reason ?? "")))}`);
    if (process.env.WRITE_RESULTS === "1") writeFileSync("spec/validation/014-results-stall.json", JSON.stringify({ ms, http: r.status, calls, values }, null, 2));
    expect(ms).toBeLessThan(300_000);
  }, 400_000);
});
