/**
 * Validation 011 harness — Europe PMC XML-first fetch (handoff 120), LIVE.
 * Run:  LIVE=1 npx vitest run spec/validation/011-harness.test.ts
 * Skipped without LIVE=1 so the normal suite stays offline.
 *
 * External truth (independent of the code under test):
 *   - DOI list: the 23 included ketamine/TRD RCTs of the published review (Field Report §2)
 *   - Europe PMC search API `core` record per DOI: pmcid, isOpenAccess, inEPMC, abstractText
 *     (separate request, own parsing; the app's resolvePmcid is NOT used for truth)
 * Isolates the XML stage: resolver stubbed to "no result", so ok:true can only come from XML.
 * Writes 011-results.json (per-DOI outcomes).
 */
import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { fetchPagesForIdentifier } from "@/lib/extraction-fetch";
import { checkSourcePresence } from "@/lib/extraction-source";

const DOIS = [
  "10.1016/j.jad.2023.01.005","10.1016/j.jpsychires.2024.03.002","10.1001/jamapsychiatry.2017.3739",
  "10.1192/bjp.2018.196","10.1038/s41380-018-0256-5","10.1177/0269881118760660","10.1038/s41591-024-03063-x",
  "10.1016/j.jad.2018.09.037","10.1001/jamapsychiatry.2025.1317","10.1016/j.jad.2023.02.151",
  "10.1111/acps.12572","10.1192/bjp.2023.79","10.1176/appi.ajp.2013.13030392","10.1111/pcn.13734",
  "10.1186/s12888-024-05951-5","10.1176/APPI.FOCUS.18206","10.1038/s41398-020-00897-0",
  "10.1176/appi.ajp.2016.16010037","10.1016/j.biopsych.2015.10.018","10.1038/s41380-024-02478-9",
  "10.1038/npp.2017.94","10.1093/ijnp/pyad014","10.1001/archpsyc.63.8.856",
];
const BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest";
const live = process.env.LIVE === "1";

async function truth(doi: string) {
  const r = await fetch(`${BASE}/search?query=${encodeURIComponent(`DOI:"${doi}"`)}&format=json&resultType=core&pageSize=1`);
  const rec = ((await r.json()) as any).resultList?.result?.[0] ?? {};
  return {
    pmid: rec.pmid as string | undefined, pmcid: rec.pmcid as string | undefined,
    isOpenAccess: rec.isOpenAccess === "Y", inEPMC: rec.inEPMC === "Y",
    abstract: String(rec.abstractText ?? "").replace(/<[^>]+>/g, " "),
  };
}
/** decimals / numbers ≥10 from the abstract, excluding year-like and CI-ish noise */
function abstractNumbers(a: string): number[] {
  const out = new Set<number>();
  for (const m of a.matchAll(/\b\d+(?:\.\d+)?\b/g)) {
    const n = Number(m[0]);
    if ((m[0].includes(".") || n >= 10) && !(n >= 1990 && n <= 2030 && !m[0].includes("."))) out.add(n);
  }
  return [...out];
}

describe.skipIf(!live)("011 live Europe PMC XML-first", () => {
  it("measures XML-path outcomes vs Europe PMC OA flags + abstract numbers", async () => {
    const rows: any[] = [];
    for (const doi of DOIS) {
      const t = await truth(doi);
      const noResolve = (async () => ({ result: null })) as any;
      const byDoi = await fetchPagesForIdentifier({ doi }, { resolve: noResolve, fetchImpl: fetch });
      const byPmid = t.pmid ? await fetchPagesForIdentifier({ pmid: t.pmid }, { resolve: noResolve, fetchImpl: fetch }) : null;
      const nums = abstractNumbers(t.abstract);
      let hit = 0;
      let fab = 0;
      if (byDoi.ok) {
        const pages = byDoi.pages.map((p) => ({ page: p.page, text: p.text }));
        hit = nums.filter((n) => checkSourcePresence(n, pages).ok).length;
        // control: numbers not in the abstract/ paper (implausible 4-digit decimals)
        for (const f of [7341.77, 9182.43, 6620.19]) if (checkSourcePresence(f, pages).ok) fab++;
      }
      rows.push({
        doi, ...t, abstract: undefined, abstractNums: nums.length,
        doiOk: byDoi.ok, doiReason: byDoi.ok ? null : byDoi.reason,
        units: byDoi.ok ? byDoi.pages.length : 0,
        locators: byDoi.ok ? byDoi.pages.map((p: any) => p.locator).filter(Boolean).slice(0, 12) : [],
        pmidOk: byPmid?.ok ?? null, abstractNumsFoundInXml: hit, controlFalsePass: fab,
      });
    }
    writeFileSync(new URL("./011-results.json", import.meta.url), JSON.stringify(rows, null, 1));
    console.table(rows.map((r) => ({ doi: r.doi, pmcid: r.pmcid, oa: r.isOpenAccess, doiOk: r.doiOk, pmidOk: r.pmidOk, units: r.units, nums: `${r.abstractNumsFoundInXml}/${r.abstractNums}`, fab: r.controlFalsePass })));
    expect(rows.length).toBe(23);
  }, 600_000);
});
