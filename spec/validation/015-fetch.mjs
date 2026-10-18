// Validation 015: fetch SYNERGY label files (CC0) and OpenAlex title/abstract text.
// Usage: node spec/validation/015-fetch.mjs <cacheDir>
// IDs+labels are committed under fixtures/015-synergy-ids; abstract text is cached OUTSIDE git.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";

const cache = process.argv[2];
mkdirSync(cache, { recursive: true });
const BASE = "https://raw.githubusercontent.com/asreview/synergy-dataset/master/datasets";
const REVIEWS = {
  Donners_2021: "Donners_2021/Donners_2021_ids.csv",
  Nelson_2002: "Cohen_2006/Nelson_2002_ids.csv",
  Sep_2021: "Sep_2021/Sep_2021_ids.csv",
  Oud_2018: "Oud_2018/Oud_2018_ids.csv",
  Jeyaraman_2020: "Jeyaraman_2020/Jeyaraman_2020_ids.csv",
  Appenzeller_Herzog_2019: "Appenzeller-Herzog_2019/Appenzeller-Herzog_2019_ids.csv",
  Bos_2018: "Bos_2018/Bos_2018_ids.csv",
};
function rebuild(inv) {
  if (!inv) return "";
  const out = [];
  for (const [w, pos] of Object.entries(inv)) for (const p of pos) out[p] = w;
  return out.join(" ");
}
for (const [name, path] of Object.entries(REVIEWS)) {
  const out = `${cache}/${name}.json`;
  if (existsSync(out)) continue;
  const csv = await (await fetch(`${BASE}/${path}`)).text();
  const lines = csv.trim().split("\n");
  const head = lines[0].split(",");
  const iO = head.indexOf("openalex_id"), iL = head.indexOf("label_included");
  const rows = lines.slice(1).map((l) => l.split(",")).filter((c) => c[iO]?.includes("openalex.org/W"));
  const ids = rows.map((c) => ({ id: c[iO].split("/").pop(), inc: c[iL] === "1" }));
  writeFileSync(`spec/validation/fixtures/015-synergy-ids/${name}.csv`, "openalex_id,label_included\n" + ids.map((r) => `${r.id},${r.inc ? 1 : 0}`).join("\n") + "\n");
  const recs = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const url = `https://api.openalex.org/works?filter=openalex_id:${batch.map((b) => b.id).join("|")}&per-page=50&select=id,title,abstract_inverted_index`;
    for (let t = 0; t < 4; t++) {
      const r = await fetch(url);
      if (r.ok) {
        const j = await r.json();
        const m = new Map(j.results.map((w) => [w.id.split("/").pop(), w]));
        for (const b of batch) { const w = m.get(b.id); if (w) recs.push({ id: b.id, inc: b.inc, title: w.title ?? "", abstract: rebuild(w.abstract_inverted_index) }); }
        break;
      }
      await new Promise((r) => setTimeout(r, 1500 * (t + 1)));
    }
  }
  writeFileSync(out, JSON.stringify(recs));
  console.log(name, ids.length, "ids ->", recs.length, "records,", recs.filter((r) => r.inc).length, "includes");
}
