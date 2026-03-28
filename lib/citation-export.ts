/**
 * Citation export utilities for Blindspot.
 *
 * Converts ExistingReview[] into standard reference formats (RIS, BibTeX)
 * for import into Zotero, Mendeley, EndNote, etc.
 *
 * These are pure functions with no side effects — safe to call from client
 * components (e.g. via a "Export references" download button).
 */

import type { ExistingReview } from "@/types";

// ---------------------------------------------------------------------------
// RIS format
// ---------------------------------------------------------------------------

/**
 * Sanitise a string value for use in an RIS field.
 * RIS fields must not contain raw newlines; replace with a space.
 */
function sanitiseRisValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/**
 * Generate a single RIS record for one review.
 *
 * RIS spec: each tag is exactly 2 chars, followed by two spaces, a dash, two
 * spaces, and the value.  Records end with "ER  - " on its own line.
 */
function reviewToRisRecord(review: ExistingReview): string {
  const lines: string[] = [];

  // Record type — JOUR (journal article) covers all systematic reviews
  lines.push("TY  - JOUR");

  lines.push(`TI  - ${sanitiseRisValue(review.title)}`);

  if (review.journal) {
    lines.push(`JO  - ${sanitiseRisValue(review.journal)}`);
    // JF is the full journal name; many tools expect both
    lines.push(`JF  - ${sanitiseRisValue(review.journal)}`);
  }

  if (review.year) {
    lines.push(`PY  - ${review.year}`);
    lines.push(`Y1  - ${review.year}///`);
  }

  if (review.doi) {
    // Strip leading https://doi.org/ if present — RIS DO field expects raw DOI
    const rawDoi = review.doi.replace(/^https?:\/\/doi\.org\//i, "");
    lines.push(`DO  - ${sanitiseRisValue(rawDoi)}`);
    lines.push(`UR  - https://doi.org/${sanitiseRisValue(rawDoi)}`);
  } else if (review.pmid) {
    lines.push(`UR  - https://pubmed.ncbi.nlm.nih.gov/${sanitiseRisValue(review.pmid)}/`);
  }

  if (review.pmid) {
    lines.push(`AN  - PMID:${sanitiseRisValue(review.pmid)}`);
  }

  if (review.abstract_snippet) {
    lines.push(`AB  - ${sanitiseRisValue(review.abstract_snippet)}`);
  }

  if (review.source) {
    lines.push(`DB  - ${sanitiseRisValue(review.source)}`);
  }

  // End-of-record marker (required by RIS spec)
  lines.push("ER  - ");

  return lines.join("\r\n");
}

/**
 * Convert an array of ExistingReview objects into a full RIS file string.
 * Returns an empty string when the array is empty.
 */
export function toRis(reviews: ExistingReview[]): string {
  if (reviews.length === 0) return "";
  return reviews.map(reviewToRisRecord).join("\r\n\r\n");
}

// ---------------------------------------------------------------------------
// BibTeX format
// ---------------------------------------------------------------------------

/**
 * Derive a BibTeX cite key from a review.
 * Format: firstWordOfTitle_year  (lowercase, alphanumeric only, max 40 chars)
 * Falls back to "review_<index>" when title is unavailable.
 */
export function buildBibKey(review: ExistingReview, index: number): string {
  const year = review.year ? String(review.year) : "nd";
  const firstWord = review.title
    ? review.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 30)
    : `review_${index}`;
  return `${firstWord}_${year}`;
}

/**
 * Escape special BibTeX characters inside a field value.
 * BibTeX brace-wraps the entire value so only literal braces need escaping.
 */
function escapeBibtex(value: string): string {
  return value
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/[{}]/g, (c) => `\\${c}`);
}

/**
 * Generate a single BibTeX @article entry for one review.
 */
function reviewToBibtexEntry(review: ExistingReview, index: number): string {
  const key = buildBibKey(review, index);
  const fields: string[] = [];

  fields.push(`  title     = {${escapeBibtex(review.title)}}`);

  if (review.journal) {
    fields.push(`  journal   = {${escapeBibtex(review.journal)}}`);
  }

  if (review.year) {
    fields.push(`  year      = {${review.year}}`);
  }

  if (review.doi) {
    const rawDoi = review.doi.replace(/^https?:\/\/doi\.org\//i, "");
    fields.push(`  doi       = {${escapeBibtex(rawDoi)}}`);
  }

  if (review.pmid) {
    fields.push(`  note      = {PubMed ID: ${escapeBibtex(review.pmid)}}`);
  }

  if (review.abstract_snippet) {
    fields.push(`  abstract  = {${escapeBibtex(review.abstract_snippet)}}`);
  }

  return `@article{${key},\n${fields.join(",\n")}\n}`;
}

/**
 * Convert an array of ExistingReview objects into a full BibTeX file string.
 * Returns an empty string when the array is empty.
 */
export function toBibtex(reviews: ExistingReview[]): string {
  if (reviews.length === 0) return "";
  return reviews.map((r, i) => reviewToBibtexEntry(r, i)).join("\n\n");
}

// ---------------------------------------------------------------------------
// Browser download helper (client-only — never call from server code)
// ---------------------------------------------------------------------------

/**
 * Trigger a file download in the user's browser.
 * @param content  File contents as a string.
 * @param filename Suggested filename for the download dialog.
 * @param mimeType MIME type of the file.
 */
export function downloadTextFile(
  content: string,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
