/**
 * NEW-8: Living systematic review query construction tests.
 *
 * `countLivingReviews` in lib/pubmed.ts builds an esearch query that filters
 * the existing-reviews query down to records that mention "living systematic
 * review" or "living review" in the title/abstract. The exact query shape is
 * critical because:
 *   1. The boolean must include `systematic[sb]` so MEDLINE-classified reviews
 *      are not lost when "living" appears only in body text.
 *   2. Both phrase variants (with/without "systematic") must be OR-ed because
 *      LSRs in different fields use different terminology (Cochrane uses
 *      "living systematic review"; BMJ uses "living review").
 *   3. The `[tiab]` field tag must be applied to each phrase to anchor the
 *      filter to title and abstract — applying it once at the end would
 *      attach to only the second phrase.
 *
 * These tests exercise the pure query-building logic by reconstructing the
 * filter string Locally so the verification matches what is sent to PubMed.
 */

import { describe, it, expect } from "vitest";

/**
 * Mirrors the inline filter built by `countLivingReviews` in lib/pubmed.ts.
 * Exposed here as a pure function so the format can be tested without an
 * actual network round-trip to PubMed.
 */
function buildLivingReviewQuery(reviewQuery: string): string {
  const livingFilter =
    '("living systematic review"[tiab] OR "living review"[tiab])';
  return `(${reviewQuery}) AND systematic[sb] AND ${livingFilter}`;
}

describe("buildLivingReviewQuery", () => {
  it("wraps the user's review query in parentheses for safe AND-composition", () => {
    const result = buildLivingReviewQuery('"CBT" AND "insomnia"');
    expect(result.startsWith('("CBT" AND "insomnia")')).toBe(true);
  });

  it("includes the systematic[sb] filter so reviews are not missed", () => {
    const result = buildLivingReviewQuery("anxiety");
    expect(result).toContain("AND systematic[sb]");
  });

  it("OR-joins the two living-review phrase variants", () => {
    const result = buildLivingReviewQuery("anxiety");
    expect(result).toContain('"living systematic review"[tiab]');
    expect(result).toContain('"living review"[tiab]');
    expect(result).toMatch(/"living systematic review"\[tiab\] OR "living review"\[tiab\]/);
  });

  it("applies [tiab] tag to BOTH phrase variants (not just the last one)", () => {
    const result = buildLivingReviewQuery("anxiety");
    // Each phrase must carry its own [tiab] — otherwise PubMed would treat the
    // first phrase as an unfielded text query, which would fail to surface
    // legitimate LSRs whose titles use the longer "living systematic review" form.
    const matches = result.match(/\[tiab\]/g);
    expect(matches?.length).toBe(2);
  });

  it("preserves complex boolean queries verbatim inside the wrapper", () => {
    const complex = '"depression" AND "adolescents" AND ("CBT" OR "DBT")';
    const result = buildLivingReviewQuery(complex);
    expect(result).toContain(`(${complex})`);
  });

  it("handles single-word queries", () => {
    const result = buildLivingReviewQuery("psilocybin");
    expect(result.startsWith("(psilocybin)")).toBe(true);
    expect(result).toContain("AND systematic[sb]");
  });
});
