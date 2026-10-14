import { describe, it, expect } from "vitest";
import { jatsToPages } from "@/lib/extraction-xml";
import { checkSourcePresence } from "@/lib/extraction-source";
import { runConsistencyChecks } from "@/lib/extraction-checks";

// Trimmed from the Pattanaseri 2024 (BMC Psychiatry, CC BY) Europe PMC JATS: Day-10 MADRS row.
const XML = `<article><front><article-meta><title-group><article-title>Ketamine</article-title></title-group></article-meta></front>
<body>
<sec><title>Background</title><p>Depression &amp; suicidality.</p></sec>
<sec><title>Results</title><p>MADRS fell on day 10.</p>
<sec><title>Secondary</title><p>Nested text.</p></sec>
<table-wrap id="Tab2"><label>Table 2</label><caption><p>MADRS by group</p></caption>
<table><thead><tr><th>Day</th><th>Ketamine</th><th>Midazolam</th></tr></thead>
<tbody><tr><td>Day 10</td><td>12.55 (SE 2.64, 95% CI 6.70-18.09)</td><td>17.22 (SE 2.92, 95% CI 11.09&#x2013;23.36)</td></tr></tbody></table>
</table-wrap></sec>
</body></article>`;

describe("jatsToPages", () => {
  const pages = jatsToPages(XML);

  it("makes one ordered unit per top-level section and per table, with locators", () => {
    expect(pages.map((p) => [p.page, p.locator])).toEqual([
      [1, "Background"],
      [2, "Results"],
      [3, "Table 2"],
    ]);
    expect(pages[0].text).toContain("Depression & suicidality.");
    expect(pages[1].text).toContain("Nested text.");
    expect(pages[1].text).not.toContain("12.55");
  });

  it("keeps table rows and cells in order, adjacent to their labels", () => {
    const lines = pages[2].text.split("\n");
    expect(lines).toContain("Day | Ketamine | Midazolam");
    expect(lines.some((l) => l.startsWith("Day 10 | 12.55 (SE 2.64, 95% CI 6.70-18.09) | 17.22"))).toBe(true);
  });

  it("decodes entities and returns [] without a body", () => {
    expect(pages[2].text).toContain("11.09–23.36");
    expect(jatsToPages("<article></article>")).toEqual([]);
  });

  it("feeds the source-presence gate: 12.55 and 17.22 found in the table unit", () => {
    for (const v of [12.55, 17.22]) {
      const r = checkSourcePresence(v, pages, 3);
      expect(r.ok).toBe(true);
    }
  });

  it("SE 2.64 vs CI width/3.92 (~2.91) does not pass consistency", () => {
    const r = runConsistencyChecks({ mean: 12.55, se: 2.64, ciLow: 6.7, ciHigh: 18.09 });
    expect(r.consistent).toBe(false);
  });
});
