/**
 * Split a raw text layer into numbered pages (Brief 009, slice 2c-ii part 2).
 *
 * Text-layer extractors (e.g. `pdftotext`) separate pages with a form feed (\f).
 * Page numbers are 1-based and follow the source position, so blank pages keep
 * their number but are dropped from the result (nothing to verify against).
 */

export interface TextPage {
  page: number;
  text: string;
  /** Human-readable origin (e.g. "Table 2"); set for XML-derived units, absent for PDF pages. */
  locator?: string;
}

export function splitIntoPages(raw: string): TextPage[] {
  return raw
    .split("\f")
    .map((text, i) => ({ page: i + 1, text: text.trim() }))
    .filter((p) => p.text.length > 0);
}
