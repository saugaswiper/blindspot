/**
 * Loader for the Chan et al. 2025 "Set B" Cochrane screening benchmark
 * (doi:10.17632/7sgmg89zb6.1, CC BY 4.0; Chan, He, Leung, Verspoor 2025,
 * Research Synthesis Methods, doi:10.1017/rsm.2025.1).
 *
 * One CSV per review (`CDnnnnnn_data_cleaned.csv`). Columns: row index,
 * `Publication Year`, `Author`, `Review_data` (the review's protocol text,
 * tagged `[RTI] title [BG] … [OBJ] … [SEL] …`, repeated on every row),
 * `Title_Abstract` (`[TIT] … [ABS] …`), `included` ("True"/"False").
 * Labels are include/exclude only: no "excluded at full text" level.
 *
 * Record text is never committed; this module only reads from a local cache.
 */

export interface SetBProtocol {
  title: string;
  objectives: string;
  criteria: string;
}

export interface SetBRecord {
  id: string;
  title: string;
  abstract: string | null;
  label: boolean;
}

export interface SetBReview {
  reviewId: string;
  protocol: SetBProtocol;
  records: SetBRecord[];
}

/**
 * Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF/LF, embedded newlines.
 * Scans by index and slices (no per-char concatenation: Set B has ~49k rows with a
 * ~1 KB protocol field repeated on each).
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  const n = text.length;
  let i = 0;
  const endRow = () => {
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };
  while (i < n) {
    let field: string;
    if (text[i] === '"') {
      i++;
      let start = i;
      let out = "";
      for (;;) {
        const q = text.indexOf('"', i);
        if (q < 0) {
          out += text.slice(start);
          i = n;
          break;
        }
        if (text[q + 1] === '"') {
          out += text.slice(start, q + 1);
          i = start = q + 2;
        } else {
          out += text.slice(start, q);
          i = q + 1;
          break;
        }
      }
      field = out;
    } else {
      let j = i;
      while (j < n && text[j] !== "," && text[j] !== "\n" && text[j] !== "\r") j++;
      field = text.slice(i, j);
      i = j;
    }
    row.push(field);
    if (i >= n) break;
    const c = text[i];
    if (c === ",") {
      i++;
      if (i >= n) row.push("");
    } else {
      if (c === "\r" && text[i + 1] === "\n") i++;
      i++;
      endRow();
    }
  }
  if (row.length > 0) endRow();
  return rows;
}

/** Split `[TAG] text [TAG2] text` into a tag → text map. Unknown prefix text is ignored. */
export function splitTagged(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /\[([A-Z]{2,4})\]/g;
  const hits: { tag: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    hits.push({ tag: m[1], start: m.index, end: m.index + m[0].length });
  }
  hits.forEach((h, i) => {
    const next = i + 1 < hits.length ? hits[i + 1].start : text.length;
    if (!(h.tag in out)) out[h.tag] = text.slice(h.end, next).trim();
  });
  return out;
}

/** Parse one review CSV. Throws on a missing required column so layout drift is loud. */
export function parseSetBReview(reviewId: string, csv: string): SetBReview {
  const rows = parseCsv(csv.replace(/^﻿/, ""));
  if (rows.length === 0) throw new Error(`${reviewId}: empty CSV`);
  const header = rows[0];
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`${reviewId}: missing column "${name}"`);
    return i;
  };
  const iProto = col("Review_data");
  const iTA = col("Title_Abstract");
  const iLabel = col("included");

  let protocol: SetBProtocol = { title: "", objectives: "", criteria: "" };
  const records: SetBRecord[] = [];
  rows.slice(1).forEach((r, n) => {
    if (n === 0) {
      const p = splitTagged(r[iProto] ?? "");
      protocol = { title: p.RTI ?? "", objectives: p.OBJ ?? "", criteria: p.SEL ?? "" };
    }
    const ta = splitTagged(r[iTA] ?? "");
    const abstract = (ta.ABS ?? "").trim();
    records.push({
      id: `${reviewId}:${n}`,
      title: ta.TIT ?? "",
      abstract: abstract === "" ? null : abstract,
      label: (r[iLabel] ?? "").trim().toLowerCase() === "true",
    });
  });
  return { reviewId, protocol, records };
}

/** Review id from a file name like `CD013377_data_cleaned.csv`, else null. */
export function reviewIdFromFile(name: string): string | null {
  const m = /^(CD\d{6})_data_cleaned\.csv$/.exec(name);
  return m ? m[1] : null;
}
