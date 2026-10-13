/**
 * Extraction source-presence gate (Brief 009, check 1).
 *
 * Pure, network-free, model-free verification that an extracted numeric datum
 * actually appears in the resolved full-text's own text layer, on the page it
 * was cited from. This is the first and most important check of the 4-check
 * gate: it is what catches a *fabricated* number (one the model emitted but
 * that appears nowhere in the source) and distinguishes it from a
 * *mis-citation* (a real number attributed to the wrong page).
 *
 * Design rules (from the brief / Cochrane Ch 5):
 *   - A number present on the cited page → the gate passes. A number present
 *     only on a *different* page → `wrong_page` (mis-citation), NOT
 *     `not_in_source` (fabrication) — the field report (§4.1) treats these as
 *     different severities, so they must be distinct codes.
 *   - A number nowhere in the text as digits, but present spelled out
 *     ("forty-two"), is `spelled_out` — flagged for a human, never treated as
 *     fabrication (the brief forbids conflating the two).
 *   - This gate never mutates a value and makes no model/network calls. It only
 *     reads the text layer it is handed.
 *
 * Matching is tolerant of journal number formatting — comma or
 * middle-dot/decimal variants, Unicode minus — so that "1,234", "3·92" and
 * "−2.5" are recognised as the values 1234, 3.92 and −2.5. Recognition is by
 * normalised numeric value, so a digit sequence embedded in a larger number
 * ("42" inside "4267") does not spuriously match.
 */

import type { ExtractionFailureCode } from "@/types";

/** One page of a resolved full-text source and its extracted text layer. */
export interface SourcePage {
  /** 1-based page number as cited in extraction provenance. */
  page: number;
  /** The page's text layer (reading-order text; table grids flattened in). */
  text: string;
}

/** The failure codes this gate can emit (a subset of `ExtractionFailureCode`). */
export type SourcePresenceCode = Extract<
  ExtractionFailureCode,
  "not_in_source" | "wrong_page" | "spelled_out"
>;

/** Outcome of the source-presence gate for one numeric datum. */
export interface SourcePresenceResult {
  /**
   * True when the value is present on the cited page (or present anywhere and
   * no page was cited). False means a human must look — see `code`.
   */
  ok: boolean;
  /** Why the gate did not pass, when `ok` is false. */
  code?: SourcePresenceCode;
  /** Pages whose text layer contains the value as digits (1-based). */
  foundOnPages: number[];
  /** Pages whose text contains the value spelled out, when it is not in digits. */
  spelledOutOnPages?: number[];
  /** Human-readable explanation for the `check` queue / audit log. */
  detail?: string;
}

/**
 * Canonicalise a run of page text so numeric tokens can be compared by value:
 * Unicode minus (U+2212) → ASCII hyphen, middle dot (used as a decimal point in
 * some journals) → ".". En/em dashes are left alone — they separate range
 * endpoints ("2–4") and must not be read as a sign or decimal.
 */
function canonicalizeNumericText(text: string): string {
  return text.replace(/−/g, "-").replace(/·/g, ".");
}

/**
 * Every number-like token in a run of text, as normalised numeric values.
 * Matches comma-grouped thousands ("1,234") and plain integers/decimals, each
 * with an optional leading ASCII minus. Commas are stripped before parsing.
 */
function numericTokens(text: string): number[] {
  const canon = canonicalizeNumericText(text);
  const re = /-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/g;
  const out: number[] = [];
  for (const m of canon.matchAll(re)) {
    const n = Number(m[0].replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/** True when `target` appears as a standalone numeric token in `text`. */
function textHasNumber(text: string, target: number): boolean {
  if (!Number.isFinite(target)) return false;
  return numericTokens(text).some((n) => numbersEqual(n, target));
}

/**
 * Equal as reported numbers: exact for integers, and tolerant of the final
 * printed decimal place otherwise (a reported 3.92 and a text 3.920 agree). The
 * tolerance is absolute and tiny so distinct reported values never collide.
 */
function numbersEqual(a: number, b: number): boolean {
  if (a === b) return true;
  return Math.abs(a - b) <= 5e-10 * Math.max(1, Math.abs(a), Math.abs(b));
}

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = [
  "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty",
  "ninety",
];

/**
 * Spelled-out forms of a non-negative integer 0–999, as lowercase phrases to
 * search for. Returns the common variants (hyphenated vs spaced tens, and the
 * British "and" after a hundred) so a page using any of them is recognised.
 * Returns an empty list for values this gate does not spell out (negative,
 * non-integer, or ≥ 1000) — such a value simply is not matched as spelled out.
 */
export function spelledOutForms(value: number): string[] {
  if (!Number.isInteger(value) || value < 0 || value > 999) return [];
  const twoDigits = (n: number, join: string): string => {
    if (n < 20) return ONES[n];
    const t = TENS[Math.floor(n / 10)];
    const o = n % 10;
    return o === 0 ? t : `${t}${join}${o === 0 ? "" : ONES[o]}`;
  };
  if (value < 100) {
    const forms = new Set<string>();
    forms.add(twoDigits(value, "-"));
    forms.add(twoDigits(value, " "));
    return [...forms];
  }
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const head = `${ONES[hundreds]} hundred`;
  if (rest === 0) return [head];
  const forms = new Set<string>();
  for (const join of ["-", " "]) {
    const tail = twoDigits(rest, join);
    forms.add(`${head} ${tail}`);
    forms.add(`${head} and ${tail}`);
  }
  return [...forms];
}

/** True when any spelled-out form of `value` appears in `text` (case-insensitive). */
function textHasSpelledOut(text: string, value: number): boolean {
  const forms = spelledOutForms(value);
  if (forms.length === 0) return false;
  const haystack = text.toLowerCase();
  return forms.some((f) => haystack.includes(f));
}

/**
 * Check 1 of the gate: is this value really in the source, on the page it was
 * cited from?
 *
 * @param value      the extracted numeric datum to verify
 * @param pages      the resolved full-text's pages + text layers
 * @param citedPage  the page the extractor attributed the value to; when
 *                   omitted, the gate only checks that the value exists
 *                   somewhere (it cannot judge mis-citation without a claim)
 */
export function checkSourcePresence(
  value: number,
  pages: SourcePage[],
  citedPage?: number,
): SourcePresenceResult {
  const foundOnPages = pages.filter((p) => textHasNumber(p.text, value)).map((p) => p.page);

  if (foundOnPages.length > 0) {
    if (citedPage === undefined || foundOnPages.includes(citedPage)) {
      return { ok: true, foundOnPages };
    }
    return {
      ok: false,
      code: "wrong_page",
      foundOnPages,
      detail: `value ${value} was cited to page ${citedPage} but appears on page(s) ${foundOnPages.join(", ")}`,
    };
  }

  const spelledOutOnPages = pages
    .filter((p) => textHasSpelledOut(p.text, value))
    .map((p) => p.page);
  if (spelledOutOnPages.length > 0) {
    return {
      ok: false,
      code: "spelled_out",
      foundOnPages,
      spelledOutOnPages,
      detail: `value ${value} appears spelled out (not as digits) on page(s) ${spelledOutOnPages.join(", ")}; flag for a human, not a fabrication`,
    };
  }

  return {
    ok: false,
    code: "not_in_source",
    foundOnPages,
    detail: `value ${value} does not appear anywhere in the resolved full text`,
  };
}
