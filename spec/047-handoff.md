# Handoff 047 — NEW-4: RAISE Compliance Disclosure Page

**Date:** 2026-04-16
**Automation:** Blindspot daily-improver agent
**Previous handoff:** 046 (ACC-2 Completion + ACC-6 OSF Registry Check)

---

## Summary

Implemented **NEW-4 — RAISE Compliance Disclosure Page** from the `spec/044-market-research.md` recommended build order. This is a static methodology transparency page at `/about` aligned with Cochrane RAISE 3 (June 2025) guidance on responsible AI use in evidence synthesis tools.

The footer already linked to `/about` ("About & Methodology") but the route returned a 404. This session creates the missing page and surfaces it in two additional locations: the NavBar and the "Why This Score?" feasibility explainer popover.

---

## Why This Feature

Cochrane RAISE 3 (June 2025) requires AI evidence synthesis tools to disclose:
- Which databases are queried
- Where AI is and is not used
- Accuracy limitations and confidence calibration
- Human oversight requirements

Universities and institutional systematic review teams are increasingly required to justify AI tool selection with reference to published RAISE guidance. No competitor in Blindspot's niche (Elicit, SciSpace, ResearchRabbit) currently offers a dedicated RAISE compliance disclosure page. This is a free institutional trust signal.

The market research noted: "Tools that can produce RAISE compliance documentation are preferred by universities."

---

## Files Created

### `app/about/page.tsx` — NEW (≈ 320 lines)

A static Next.js page at `/about` with 7 clearly labelled disclosure sections:

1. **Data Sources** — Table of all 7 data sources (PubMed, OpenAlex, Europe PMC, Semantic Scholar, ClinicalTrials.gov, PROSPERO, OSF Registries) with coverage notes. Includes sub-sections on deduplication logic (0.75 factor, its basis) and OpenAlex March 2025 abstract removal limitation.

2. **Feasibility Scoring** — Explicit statement that scoring is entirely data-driven (no AI). Table of thresholds with Cochrane Handbook alignment. Sub-sections on primary study definition (publication type exclusions) and query broadening for count accuracy.

3. **Where AI Is — and Is Not — Used** — Six explicit sub-headings:
   - ✓ Gap analysis (Gemini 2.0 Flash, up to 20 reviews, confidence tiers)
   - ✓ Alternative topic suggestions (OpenAlex taxonomy + PubMed verification)
   - ✗ Feasibility scoring (data-driven only)
   - ✗ Study counts or review retrieval (direct API queries)
   - ✗ Registry checks (direct API queries to PROSPERO / OSF)

4. **PRISMA Flow Diagram Estimates** — Documents the Bannach-Brown et al. (2021) calibration basis, the five corpus tiers (XS/S/M/L/XL), and the ±20–35% CI methodology.

5. **Known Limitations** — Table of 6 known limitations with impact and current mitigation for each: PROSPERO health-science focus, OpenAlex abstract removal, deduplication factor uncertainty, Gemini hallucination risk, cache staleness, no direct Cochrane Library API.

6. **Human Oversight Requirement** — Three paragraphs on the advisory nature of all AI outputs and what researchers must independently verify.

7. **RAISE 3 Alignment** — Table mapping each of the 6 RAISE 3 disclosure requirements to Blindspot's implementation.

**Page design:** Uses the existing CSS variable system (`var(--foreground)`, `var(--muted)`, `var(--surface)`, etc.) and DM Serif Display / DM Sans font stack. Fully responsive. Includes `<Metadata>` export for SEO.

---

## Files Modified

### `components/ResultsDashboard.tsx` (+5 lines)

Added a "Full methodology →" link at the bottom of the `FeasibilityExplainer` popover (the "?" button next to the feasibility badge). This surfaces the methodology page at the exact moment a researcher is asking "what does this score mean?" — the highest-intent touchpoint.

```tsx
<a
  href="/about"
  className="inline-block mt-3 text-xs hover:opacity-100 transition-opacity"
  style={{ color: "var(--accent)", opacity: 0.8 }}
>
  Full methodology &rarr;
</a>
```

### `components/NavBar.tsx` (+9 lines)

Added a "Methodology" link in the navigation bar, visible on `md:` and wider screens. Hidden on mobile to preserve space. Uses `opacity: 0.7` (slightly lower than "My Searches") to indicate it's informational rather than primary navigation.

```tsx
<Link
  href="/about"
  className="text-sm transition-opacity hover:opacity-100 hidden md:block px-2 py-1"
  style={{ color: "var(--muted)", opacity: 0.7 }}
  title="About & Methodology — how Blindspot works, RAISE 3 compliance"
>
  Methodology
</Link>
```

---

## What the Footer Already Had

`app/page.tsx` footer already linked to `/about` as "About & Methodology" (present since at least handoff 010). This session resolves the 404 that was previously returned for that route.

---

## Files Modified / Created

```
app/about/page.tsx              — NEW: RAISE methodology disclosure page
                                  (~320 lines, static, no API calls)

components/ResultsDashboard.tsx — +5 lines: "Full methodology →" link
                                  in FeasibilityExplainer popover

components/NavBar.tsx           — +9 lines: "Methodology" nav link
                                  (hidden on mobile, visible md:+)
```

---

## Verification Status

```
npx eslint app/about/page.tsx components/NavBar.tsx
→ Exit 0 (0 errors, 0 warnings)

npx tsc --noEmit
→ Exit 0 (no type errors)

npm test
→ Blocked: known rollup ARM64 binary mismatch (same as handoffs 035–046).
  No new unit tests needed — page is static content only.

npm run build
→ Not attempted: same .fuse_hidden / EPERM infrastructure issue as previous sessions.
```

---

## Recommended Next Steps

1. **[High] ACC-7 — OpenAlex Semantic Search as ACC-2 Fallback** — When the taxonomy-based alternative topic search (ACC-2) returns fewer than 3 suggestions, query `https://api.openalex.org/works?q=<query>&mode=semantic&per_page=20`, extract `primary_topic` from the top results, deduplicate against taxonomy-found topics, and verify via PubMed. Gate behind `if (taxonomyResults.length < 3)` in `lib/topic-broadening.ts`. Directly addresses the "suggest related topics with real API data" accuracy goal.

2. **[High] ACC-8 — Date-Filtered Feasibility Mode** — Add a "Publication period" dropdown to the search form. Pass `minYear` to `lib/pubmed.ts countPrimaryStudies()` and `lib/openalex.ts`. Prevents misleading High scores on topics with predominantly old evidence (e.g., "telemedicine for chronic disease" — most studies pre-2020).

3. **[Medium] NEW-5 — Zotero Direct Export** — SciSpace launched native Zotero integration in 2026. Blindspot already has RIS export (handoff 005). Adding a "Save to Zotero" button using the existing RIS export infrastructure is low effort and directly competitive.

4. **[Medium] NEW-7 — Multi-Topic Comparison Panel** — Check-boxes on dashboard search cards + "Compare selected" side-by-side table (Topic | Feasibility | Study Count | Trend | PROSPERO | Date, max 4). High value for PhD student persona who runs 5–10 searches across candidate dissertation topics.

5. **[Low] Persist dashboard sort preference** — Store chosen sort order in a cookie so "High feasibility first" is remembered between sessions.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
