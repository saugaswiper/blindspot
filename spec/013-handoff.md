# Handoff: "Start My Protocol" CTA — Review Protocol Draft Generator
**Date:** 2026-03-29
**Session tool:** Automated daily-improver agent
**Written by:** Blindspot daily-improver agent

---

## What Was Built

Implemented **"Start My Protocol" CTA** — improvement NEW-6 from the second market research report (`spec/008-market-research-update.md`).

After Blindspot identifies a viable research gap, the researcher's very next step is writing a systematic review protocol to register on PROSPERO. This is a complex, time-consuming document that requires knowledge of PROSPERO registration requirements, PICO formatting, Boolean search strategy structuring, and study design methodology. Until now, no tool bridged the gap between "found a gap" and "starting my review."

Blindspot now generates a **full PROSPERO-ready systematic review protocol draft** in one click, directly from the gap analysis that's already on the page.

### Why This Feature

**Unique workflow closure**: This is the only tool in the systematic review space that covers the complete journey: (1) identify a gap, (2) assess feasibility, (3) immediately generate the protocol to start your review. Elicit, Covidence, and ResearchRabbit all focus on the "conducting the review" phase, not the "starting the review" phase.

**Zero additional searches needed**: The protocol uses data already on the page — gap analysis, suggested topics, study design recommendation, PICO fields (if used), and the Boolean search string. No new API calls are needed from the user's perspective.

**Saves hours of work**: PROSPERO registration requires a structured protocol covering objectives, PICO, eligibility criteria, search strategy, and methods. Generating the skeleton eliminates the blank-page problem for researchers.

**Builds on existing Gemini integration**: The same Gemini 2.5 Flash model already used for gap analysis and Boolean string generation is reused here, with a different system prompt optimised for long-form Markdown generation.

---

## Files Created / Modified

```
lib/prompts.ts                   — MODIFIED: added ProtocolInput interface, PROTOCOL_SYSTEM_PROMPT, buildProtocolPrompt()
lib/gemini.ts                    — MODIFIED: added generateProtocol() function (text mode, not JSON)
app/api/generate-protocol/route.ts — NEW: POST endpoint for protocol generation
components/ResultsDashboard.tsx  — MODIFIED: GapsTab now accepts resultId + isOwner; ProtocolBlock component added
lib/protocol-generator.test.ts   — NEW: 18 vitest unit tests for buildProtocolPrompt
```

---

## Data Flow

```
GapAnalysis (already on page)
  + StudyDesignRecommendation (already on page)
  + PICO fields (fetched from searches table in API endpoint)
  + boolean_search_string (from gap_analysis.boolean_search_string)
    ↓
buildProtocolPrompt()              [lib/prompts.ts]
    — selects highest-feasibility suggested topic as primary focus
    — formats gaps, topics, PICO, study design, Boolean string into prompt
    — requests 8-section Markdown protocol outline
    ↓
POST /api/generate-protocol        [app/api/generate-protocol/route.ts]
    — auth: must be signed in
    — ownership: result must belong to calling user (via searches.user_id)
    — precondition: gap_analysis must already exist
    — calls generateProtocol() → Gemini 2.5 Flash in text mode
    — returns { protocol: string }
    ↓
ProtocolBlock component            [components/ResultsDashboard.tsx]
    — "Generate Protocol" button → calls API
    — loading spinner (~20 sec)
    — Markdown output in pre/code block (scrollable, max-height 480px)
    — Copy to clipboard button
    — Download as .md button (filename derived from review title)
    — AI disclaimer at bottom
```

---

## `lib/prompts.ts` Additions

### `ProtocolInput` interface

```typescript
interface ProtocolInput {
  query: string;
  gapAnalysis: GapAnalysis;
  studyDesign: StudyDesignRecommendation | null;
  pico: {
    population?: string | null;
    intervention?: string | null;
    comparison?: string | null;
    outcome?: string | null;
  } | null;
  booleanSearchString: string | null;
}
```

### `PROTOCOL_SYSTEM_PROMPT`

A separate system prompt from `SYSTEM_PROMPT` (which forces JSON output). The protocol prompt asks Gemini to produce professional, evidence-based Markdown in PROSPERO-compatible language — without the JSON constraint.

### `buildProtocolPrompt(input: ProtocolInput): string`

Assembles the user-turn prompt from all available context:
- Picks the highest-feasibility `suggested_topic` as the primary focus (falls back to moderate → any if no high-feasibility topic)
- Formats all gaps with `[HIGH/MEDIUM/LOW]` importance labels
- Includes PICO section only when at least one PICO field is non-null (prevents "null" text artifacts)
- Includes Boolean search string section only when provided
- Includes study design section only when provided
- Requests 8 numbered sections with specific headings and sub-items
- Includes a Blindspot attribution footer with today's date

---

## `lib/gemini.ts` Additions

### `generateProtocol(userPrompt: string): Promise<string>`

Calls Gemini 2.5 Flash without `responseMimeType: "application/json"`. This allows Gemini to return natural Markdown text. Temperature is set to 0.4 (slightly higher than gap analysis at 0.3, allowing for more natural prose in the protocol narrative). Returns the raw Markdown string.

Key differences from `callGemini` / `generateGapAnalysis`:
- Uses `PROTOCOL_SYSTEM_PROMPT` instead of `SYSTEM_PROMPT`
- No `responseMimeType` constraint → plain text output
- No JSON parsing / validation step
- Returns `string` directly rather than `GapAnalysis`

---

## `app/api/generate-protocol/route.ts`

`POST /api/generate-protocol`

Request body:
```json
{ "resultId": "<uuid>" }
```

Guards:
1. **Authentication**: Must be signed in (`supabase.auth.getUser()`)
2. **Ownership**: The `searches.user_id` on the fetched result must match the calling user's ID. This prevents users from generating protocols for other users' results even if they know the UUID.
3. **Precondition**: `gap_analysis` must not be null — the user must have run AI analysis before requesting a protocol.

Response (success):
```json
{ "protocol": "# Systematic Review Protocol: ...\n\n## 1. Background..." }
```

Response (error):
```json
{ "error": "Please run the AI gap analysis first before generating a protocol." }
```

Fetches PICO data from `searches` table directly in the endpoint (it is not passed through the frontend), keeping the client-side component simple and avoiding prop-drilling PICO through the entire component tree.

---

## UI / UX

### Placement

The `ProtocolBlock` section appears at the **bottom of the Gap Analysis tab**, below the BooleanSearchBlock. It is only rendered when:
- The user is the result owner (`isOwner === true`)
- Gap analysis has been completed (the section only renders inside `GapsTab` when `gapAnalysis` is not null)

Public viewers (via shareable links) do not see the protocol generator — this is a creation tool for the owner, not a display element.

### States

The `ProtocolBlock` cycles through four states:

1. **Idle** — Shows a "Generate Protocol" button with a brief description. Call-to-action is restrained (doesn't auto-run; the user must click, since Gemini takes ~20 seconds).

2. **Loading** — Spinner + "Generating protocol draft… (~20 seconds)" message. The gap analysis and boolean string buttons remain accessible (user can read the page while waiting).

3. **Done** — Renders the Markdown as a `<pre>` block in monospace font. Max-height 480px with vertical scroll. Header bar shows Copy and Download buttons.

4. **Error** — Shows the error message and a "Try again" button. Most likely cause: Gemini API temporarily unavailable.

### Copy / Download

- **Copy**: Writes the raw Markdown to clipboard. Shows "Copied" with a green checkmark for 2 seconds.
- **Download**: Extracts the review title from the first `# Heading` in the Markdown, converts it to a URL-safe filename slug (max 60 chars), and downloads `{slug}.md` via the existing `downloadTextFile` utility already used for citation exports.

### Mobile (375px)

- Header bar: flex-col on mobile (button wraps below description)
- Spinner message: full width
- Pre block: scrollable horizontally for long lines, vertically for long content

---

## Protocol Output Structure

Gemini is instructed to produce 8 numbered sections:

1. **Background and Rationale** — 2–3 paragraphs on why this review is needed, what's known, what the gap is
2. **Review Objectives** — 1–2 sentences with the precise review question
3. **Eligibility Criteria**
   - 3.1 Inclusion criteria (study types, population, intervention, comparators, outcomes, time, language)
   - 3.2 Exclusion criteria
4. **Information Sources and Search Strategy**
   - 4.1 Databases (PubMed, Embase, Cochrane, OpenAlex, domain-specific)
   - 4.2 Search string (uses Blindspot's generated Boolean string if available)
   - 4.3 Grey literature and hand-searching
5. **Study Selection and Data Extraction**
   - 5.1 Study selection process (screening, PRISMA)
   - 5.2 Data extraction fields (6–8 relevant fields for this topic)
   - 5.3 Risk of bias assessment (Cochrane RoB 2, GRADE, NOS, etc.)
6. **Synthesis and Analysis** — meta-analysis plan, heterogeneity handling, subgroup analyses
7. **Expected Outputs and Significance** — clinical/policy impact
8. **Next Steps Checklist** — actionable todos including PROSPERO registration link

---

## Unit Tests (19 smoke tests, 19/19 passing)

Tests are written in vitest format (`lib/protocol-generator.test.ts`). Verified via Node.js `--experimental-transform-types` smoke test runner (vitest blocked by cross-platform rollup binary issue).

### Test cases

- Returns a non-empty string
- Query appears in output
- High-feasibility topic is primary focus
- Falls back to moderate-feasibility when no high exists
- PICO elements present when provided
- PICO section absent when null
- Boolean search string included when provided
- Boolean section absent when null
- Study design recommendation included when provided
- Study design section absent when null
- Overall assessment in prompt
- Gap descriptions and importance labels in prompt
- All 8 protocol sections requested
- Empty `suggested_topics` doesn't throw
- Date stamp in prompt
- Partial PICO (null fields excluded from output)
- Multiple topics listed (up to 4)
- Input object not mutated

---

## Decisions Made

- **Owner-only**: Protocol generation is restricted to the result owner. Public viewers (shared links) cannot generate protocols — protocol drafts are a creation workflow, not a read-only display.
- **No caching**: The protocol is not stored in the database. It's generated on demand and displayed in-memory. This avoids a schema migration and keeps the feature lightweight. If researchers want to persist it, they download the `.md` file. Future enhancement: could add a `protocol_draft` column to `search_results`.
- **Text mode (not JSON)**: `generateProtocol` uses Gemini without `responseMimeType: "application/json"` since the output is free-form Markdown. Using JSON mode with Markdown content would require escaping and unescaping the output unnecessarily.
- **Separate system prompt**: `PROTOCOL_SYSTEM_PROMPT` is distinct from `SYSTEM_PROMPT` (which ends with "Respond only with valid JSON"). The protocol prompt allows natural prose.
- **Pre block not rendered Markdown**: The protocol is shown in a `<pre>` monospace block rather than rendered HTML. This preserves the raw Markdown so users can copy it cleanly, and avoids the need for a Markdown renderer dependency. The headings and bullet points are readable in plain text.
- **PICO fetched in API, not frontend**: PICO fields are in the `searches` table. Rather than plumbing them through the component tree (ResultsDashboard props → GapsTab → ProtocolBlock), they are fetched directly in the API endpoint alongside the gap analysis. This keeps the component interface clean.
- **~20 sec estimate**: Consistent with the UI text already used for "Run AI Gap Analysis" on the same tab. Users already have calibrated expectations for Gemini generation time.

---

## Backward Compatibility

- **Results without gap analysis** (`gap_analysis === null`): The `GapsTab` returns an `<AnalysisPrompt>` before reaching `ProtocolBlock`, so the protocol button is never shown.
- **Public viewer results**: `isOwner` is `false` for public viewers; the `ProtocolBlock` is conditionally rendered only when `isOwner === true`.
- **Results pre-dating this feature**: No database changes; all results work as before.
- **GapsTab API change**: `GapsTab` now takes `resultId: string` and `isOwner: boolean` as additional required props. The only call site is inside `ResultsDashboard.tsx`, which passes `resultId` (already a prop) and `isOwner` (already a prop).

---

## Verification Status

- [x] `npm run lint` — 0 errors (1 pre-existing `ReviewSkeleton` warning, unrelated)
- [x] `npx tsc --noEmit` — 0 errors
- [x] Smoke tests — **19/19 passed** (buildProtocolPrompt logic)
- [ ] `npm test` — blocked by cross-platform rollup native binary issue (same as all prior deployments)
- [ ] `npm run build` — blocked by cross-platform SWC binary issue (same as previous deployments)

---

## Open Questions / Blockers

- The `node_modules` cross-platform issue persists (from `005-handoff.md`). Fix: `rm -rf node_modules package-lock.json && npm install` on the deployment platform (Linux arm64).
- **Protocol storage**: Currently the protocol is not persisted. A follow-on improvement could add a `protocol_draft` JSONB or text column to `search_results` so users don't lose their generated protocol on page refresh.
- **Protocol quality**: Gemini 2.5 Flash generates strong protocol outlines but they require expert review, especially for eligibility criteria and risk-of-bias tool selection. The disclaimer at the bottom of the block (and in the Markdown footer) addresses this.

---

## Next Recommended Features (from market research)

1. **Email alerts / living search** (#6) — Weekly email digest when new reviews appear on saved topics. Cron + diff logic + Resend template. Highest remaining retention driver.

2. **Deduplication count transparency** (NEW-4) — Low effort. Store the count of cross-database duplicate records removed during search. Show as "N duplicates removed" in the results header. Also unblocks more accurate PRISMA diagram data.

3. **Abstract expand/collapse** (NEW-3 enhancement) — The `abstract_snippet` field is already rendered with `line-clamp-3`. Since the snippet is pre-truncated at 300 chars in the data layer (`lib/pubmed.ts`, `lib/openalex.ts`), a richer "Abstract preview" would require fetching the full abstract or storing a longer snippet (DB migration + re-fetch on new searches).

4. **Onboarding tutorial** (NEW-2) — First-use walkthrough explaining PICO, feasibility scores, and the gap analysis tab. High activation rate improvement.

5. **Protocol storage** — Persist `protocol_draft` in `search_results` so users can return to their protocol. Low-medium effort (single new column, no migration complexity).
