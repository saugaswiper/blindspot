# Handoff 025 — Targeted Review Search (boolean query precision)

## Problem

Existing review searches were using a "bag of words" query. For a PICO search like
Population=`elderly patients` / Intervention=`cognitive behavioral therapy` /
Outcome=`sleep quality`, the query sent to PubMed, OpenAlex, Europe PMC, and
Semantic Scholar was:

```
elderly patients cognitive behavioral therapy sleep quality
```

Each database treats this as keyword matching — returning reviews that mention
*any* of these terms, not necessarily *all* of them together. This meant a
researcher searching for CBT+insomnia+elderly could see reviews about unrelated
use of CBT in adults, or insomnia in children, inflating the apparent literature.

## What was changed

`app/api/search/route.ts` — added `buildReviewQuery()` alongside the existing
`buildQueryString()`.

**PICO mode** — components are AND-ed together; multi-word phrases are quoted:
```
"elderly patients" AND "cognitive behavioral therapy" AND "sleep quality"
```

**Simple mode** — input is split on connector words (`for`, `in`, `with`, `and`,
`of`, `on`, `about`, `among`, `between`) to extract distinct concept phrases,
then AND-ed. Falls back to the raw text for single-concept inputs.

```
"CBT for insomnia in elderly patients"
  → "CBT" AND "insomnia" AND "elderly patients"

"cognitive behavioral therapy for depression"
  → "cognitive behavioral therapy" AND "depression"

"hypertension"  (single concept — no split)
  → hypertension
```

## What stays broad

Primary study **counts** (PubMed, OpenAlex, Europe PMC, ClinicalTrials.gov) continue
to use the original broad query. Feasibility scoring is based on how much primary
research exists in the wider area, so these should stay inclusive.

## APIs affected

| Source | Review search query | Count query |
|--------|--------------------|----|
| PubMed | `reviewQuery AND systematic[sb]` | `query` |
| OpenAlex | `reviewQuery` + `filter: type:review` | `query` |
| Europe PMC | `(reviewQuery) AND PUB_TYPE:"Systematic Review"` | `query` |
| Semantic Scholar | `reviewQuery systematic review` + `publicationTypes: Review` | — |
| PROSPERO | `reviewQuery` | — |

## Cache / display

The cache key and stored `query_text` label both still use the original user-facing
`buildQueryString()` output. The review query is only used at search time.

## Checks run
- `npm run lint` — ✅ 0 errors, 0 warnings
- `npx tsc --noEmit` — ✅ 0 errors
