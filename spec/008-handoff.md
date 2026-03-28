# Handoff: AI-Generated PubMed Boolean Search String
**Date:** 2026-03-28
**Session tool:** Automated daily-improver agent
**Written by:** Blindspot daily-improver agent

---

## What Was Built

Implemented **AI-generated PubMed Boolean search string** — improvement #8 from the market research report (`spec/004-market-research.md`).

After Blindspot identifies gaps in the literature, researchers need to actually conduct their systematic review. Their very next step is constructing a PubMed search string — a fiddly, expertise-dependent task that typically takes hours of iteration with MeSH terms. Now Blindspot generates a ready-to-use draft PubMed Boolean string as part of every AI gap analysis.

The string appears at the bottom of the **Gap Analysis** tab:
- **Code block** with monospace font for easy reading
- **Copy button** that copies to clipboard with a checkmark confirmation
- **"Open in PubMed"** link that pre-populates PubMed's search box with the string (no copy-paste needed)
- Disclaimer: "AI-generated draft — verify MeSH terms and adapt for your target database"

It is also included in the **printable PDF report** as a monospace block after "Suggested Review Topics".

### Why This Feature

Immediate practical value: no competitor automatically generates this artifact. It directly unblocks the next step in the researcher's workflow — they can paste the string straight into PubMed, or adapt it for Embase, CINAHL, or Cochrane. The string uses proper PubMed syntax (MeSH terms with `[MeSH Terms]`, free-text synonyms with `[tiab]`, publication type filters with `[pt]`) which is exactly what librarians and systematic reviewers need.

### No Database Migration Required

The `gap_analysis` column is `jsonb`. Adding `boolean_search_string` as a new key is backward compatible — old results (before this deployment) simply won't have the key, and the UI gracefully hides the section when the field is absent.

---

## Files Created / Modified

```
lib/boolean-search.ts            — NEW: sanitizeBooleanString, looksLikeBooleanString, buildPubMedUrl
lib/boolean-search.test.ts       — NEW: 21 vitest unit tests covering all three functions
types/index.ts                   — MODIFIED: added boolean_search_string?: string to GapAnalysis
lib/prompts.ts                   — MODIFIED: added boolean_search_string field to Gemini JSON schema
components/ResultsDashboard.tsx  — MODIFIED: new BooleanSearchBlock component + GapsTab integration
components/PrintableReport.tsx   — MODIFIED: boolean string section in PDF report
app/globals.css                  — MODIFIED: .report-boolean-string print CSS class
```

---

## Data Flow

```
buildGapAnalysisPrompt(…)             [lib/prompts.ts — MODIFIED]
    ↓  (includes boolean_search_string in JSON schema)
Gemini 2.5 Flash API                  [lib/gemini.ts — unchanged]
    ↓  (returns boolean_search_string as part of GapAnalysis JSON)
validateGapAnalysis(parsed)           [lib/gemini.ts — unchanged; field is optional so validation passes]
    ↓
search_results.gap_analysis (JSONB)   [Supabase — no migration needed]
    ↓
GapsTab → BooleanSearchBlock          [components/ResultsDashboard.tsx]
    ↓  ↘
UI copy/PubMed   PrintableReport      [components/PrintableReport.tsx]
```

---

## `lib/boolean-search.ts` Functions

| Function | Description |
|---|---|
| `sanitizeBooleanString(raw)` | Trims whitespace; collapses 3+ newlines to a blank line. Returns cleaned string. |
| `looksLikeBooleanString(str)` | Returns true if the string contains a Boolean operator (`AND`/`OR`/`NOT`) or a PubMed field qualifier (`[MeSH Terms]`, `[tiab]`, `[pt]`, etc.). Used to guard against Gemini returning prose instead of a query. |
| `buildPubMedUrl(booleanString)` | Returns a `https://pubmed.ncbi.nlm.nih.gov/?term=…` URL with the string percent-encoded. |

---

## Prompt Change (`lib/prompts.ts`)

Added a new `boolean_search_string` key to the JSON schema in `buildGapAnalysisPrompt`. The instruction tells Gemini to:
- Use MeSH terms with `[MeSH Terms]` qualifier
- Combine with free-text synonyms using `[tiab]` qualifier
- Join synonyms within a concept block with OR, join concept blocks with AND
- Include a systematic review filter (`[pt]`)
- Keep to 3–5 concept blocks
- Return only the search string (no surrounding explanation)

Because the Gemini response is validated with `validateGapAnalysis`, and that validation only checks for `gaps`, `suggested_topics`, and `overall_assessment`, the new field is accepted automatically — no change to `lib/gemini.ts` was needed.

---

## `BooleanSearchBlock` UI Component

Inline component within `ResultsDashboard.tsx` (not exported separately — only used in `GapsTab`).

### Behaviour
- Sanitises the AI-produced string before display using `sanitizeBooleanString`
- Builds a PubMed URL using `buildPubMedUrl` for the "Open in PubMed" link
- Copy button uses `navigator.clipboard.writeText` with a 2-second "Copied!" confirmation; silently does nothing if the Clipboard API is unavailable (e.g., non-HTTPS)
- The section is only rendered when `looksLikeBooleanString` returns true for the string — guards against displaying a free-text paragraph if Gemini goes off-script

### Layout (375px mobile)
- Full-width block; header bar with title + actions wraps on small screens via `flex-wrap`
- `pre` tag with `whitespace-pre-wrap break-all` handles long un-hyphenated strings without horizontal scroll on mobile

---

## `PrintableReport.tsx` Change

After the "Suggested Review Topics" section, a new sub-section is conditionally rendered when `gapAnalysis.boolean_search_string` is truthy:
- `<h3>Draft PubMed Boolean Search String</h3>`
- Attribution note (verify MeSH terms…)
- `<pre className="report-boolean-string">` containing the trimmed string

### `globals.css` — `.report-boolean-string`

```css
.report-boolean-string {
  font-family: "Courier New", Courier, monospace;
  font-size: 8pt;
  color: #1a1a1a;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 4pt;
  padding: 8pt 10pt;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 6pt 0 0;
  line-height: 1.5;
}
```

Only rendered inside the `@media print` block — does not affect screen styles.

---

## `types/index.ts` Change

```typescript
export interface GapAnalysis {
  gaps: Gap[];
  suggested_topics: SuggestedTopic[];
  overall_assessment: string;
  /**
   * AI-generated PubMed Boolean search string for the topic.
   * Optional: absent on results that predate this field (before v008).
   */
  boolean_search_string?: string;
}
```

---

## Verification Status

- [x] `npm run lint` — 0 errors (1 pre-existing warning: `ReviewSkeleton` unused, unrelated)
- [x] `npx tsc --noEmit` — 0 errors from source files (1 pre-existing `.next` cache error for `email-report/route.js`, unrelated)
- [x] Logic smoke tests — **21/21 passed** via direct Node.js execution of `lib/boolean-search.ts` logic
- [x] Consistency check — `boolean_search_string` traced through all 7 changed files; imports verified
- [ ] `npm test` — cannot run: pre-existing cross-platform rollup native binary issue (macOS modules on Linux arm64; see `005-handoff.md`)
- [ ] `npm run build` — cannot run: same cross-platform issue; Next.js SWC binary unavailable

### Logic Smoke Test Results (21/21 pass)

`sanitizeBooleanString` (5 tests): trims whitespace, collapses 3+ newlines, leaves single blank lines, preserves typical PubMed string unchanged, handles whitespace-only input.

`looksLikeBooleanString` (12 tests): AND/OR/NOT operators, [MeSH Terms]/[tiab]/[pt] qualifiers, empty string, plain prose, whitespace-only, case-insensitivity, realistic multi-block query.

`buildPubMedUrl` (4 tests): base URL format, percent-encodes spaces, percent-encodes square brackets, round-trips via URL decoding.

---

## Decisions Made

- **Optional field in GapAnalysis, not a separate column**: Storing in the JSONB column avoids a migration entirely. Old rows silently omit the section; no NULL UI state to handle.
- **`looksLikeBooleanString` guard**: Prevents displaying a prose paragraph if Gemini occasionally returns a description instead of a query. The section is simply hidden rather than showing confusing text.
- **"Open in PubMed" link**: More discoverable than "copy + go to PubMed + paste". One click gets researchers directly to a pre-populated search.
- **Clipboard failure is silent**: The Copy button provides no error if clipboard API is blocked (e.g., HTTP context). The string is still visible and manually selectable.
- **Pure utility module (`lib/boolean-search.ts`)**: Separating the helpers makes them independently unit-testable and reusable in future components (e.g., Embase URL builder could reuse `sanitizeBooleanString`).
- **No change to `lib/gemini.ts`**: `validateGapAnalysis` only checks required fields; `boolean_search_string` is optional. Adding it to the prompt is enough — the extra key passes through validation automatically.

---

## Open Questions / Blockers

- The `node_modules` cross-platform issue (from `005-handoff.md`) must be resolved before `npm test` and `npm run build` can run on Linux arm64. Fix: delete `node_modules` + `package-lock.json`, then `npm install` on the deployment platform.
- The `.next/dev/types/validator.ts` cache error (references a deleted `email-report/route.js`) will resolve itself on a clean build: `rm -rf .next && npm run build`.
- Existing results in Supabase (before this deployment) will not show the Boolean string — `boolean_search_string` will be absent from their stored `gap_analysis` JSONB. The UI hides the section gracefully. New analyses will always include the field.

---

## Next Recommended Features (from `spec/004-market-research.md`)

1. **PROSPERO registry check** (#5) — Query `https://www.crd.york.ac.uk/prospero/` and surface a warning banner ("A systematic review on this topic may already be registered") if matches found. High credibility win. Requires parsing PROSPERO's HTML search results or using their export endpoint.
2. **Email alerts / living search** (#6) — Weekly email digest when new reviews appear on saved topics. Cron job + diff logic + email template. Medium effort, high retention.
3. **PRISMA flow diagram** (#7) — SVG/HTML PRISMA 2020 diagram using the search counts already available. Ideal next feature after the Boolean string since it uses the same existing data (no new API calls).
4. **Gap type filtering** (#9 from market research) — Let users toggle which gap dimensions to emphasize (e.g., only geographic + population). Low effort, medium impact for power users.
