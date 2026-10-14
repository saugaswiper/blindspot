/**
 * JATS full-text XML → ordered text units (Brief 009, "prefer Europe PMC full-text XML").
 *
 * Publisher PDFs sit behind bot checks (handoff 118), so for studies with a PMCID the machine
 * API `/rest/{PMCID}/fullTextXML` is the preferred page source. Each top-level body section and
 * each `<table-wrap>` becomes its own unit, numbered in document order, with a human `locator`
 * ("Table 2", "Results") kept as provenance. Table rows keep row/column order (one row per line,
 * cells joined by " | ") so numbers stay adjacent to their labels. Pure: no network.
 */
import type { TextPage } from "@/lib/extraction-pages";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  minus: "−",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function squash(s: string): string {
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** Strip tags, keeping block boundaries as newlines and table cells as " | ". */
function xmlToText(xml: string): string {
  const withBreaks = xml
    .replace(/<\/(td|th)>/gi, " | ")
    .replace(/<\/(p|title|label|caption|tr|thead|tbody|tfoot|table-wrap-foot|fn)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  const text = decodeEntities(withBreaks.replace(/<[^>]+>/g, ""));
  return squash(text.replace(/\s*\|\s*(?=\n|$)/g, ""));
}

function firstTag(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? squash(xmlToText(m[1])) || undefined : undefined;
}

/** Split body markup into top-level `<sec>` chunks; anything outside a section is one lead chunk. */
function topLevelSections(body: string): string[] {
  const chunks: string[] = [];
  const re = /<(\/?)sec\b[^>]*>/gi;
  let depth = 0;
  let start = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m[1] === "") {
      if (depth === 0) {
        chunks.push(body.slice(last, m.index));
        start = m.index;
      }
      depth++;
    } else if (depth > 0) {
      depth--;
      if (depth === 0) {
        chunks.push(body.slice(start, re.lastIndex));
        last = re.lastIndex;
      }
    }
  }
  chunks.push(body.slice(last));
  return chunks;
}

export function jatsToPages(xml: string): TextPage[] {
  const bodyMatch = xml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) return [];

  const tableRe = /<table-wrap\b[\s\S]*?<\/table-wrap>/gi;
  const units: Array<{ text: string; locator: string }> = [];
  const addTables = (chunk: string) => {
    for (const t of chunk.match(tableRe) ?? []) {
      const text = xmlToText(t);
      if (text) units.push({ text, locator: firstTag(t, "label") ?? "Table" });
    }
  };

  let sectionNo = 0;
  for (const chunk of topLevelSections(bodyMatch[1])) {
    const prose = xmlToText(chunk.replace(tableRe, ""));
    if (prose) {
      sectionNo++;
      const title = /^\s*<sec\b/i.test(chunk) ? firstTag(chunk.replace(tableRe, ""), "title") : undefined;
      units.push({ text: prose, locator: title ?? `Section ${sectionNo}` });
    }
    addTables(chunk);
  }
  return units.map((u, i) => ({ page: i + 1, text: u.text, locator: u.locator }));
}
