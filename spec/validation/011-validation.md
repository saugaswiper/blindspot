# Validation 011 — Europe PMC XML-first identifier fetch (handoff 120, Brief 009)

**Date:** 2026-10-13 · **Tester:** Sonnet 5.5 · **Code under test:** `lib/extraction-fetch.ts` `fetchPagesForIdentifier` + `lib/extraction-xml.ts` `jatsToPages` (handoffs 119–120). No app code touched.

## 1. What was tested
The handoff states fetch logic was "unit-tested only with stubs; not exercised against live Europe PMC". This run exercises the **real** functions against the **live** Europe PMC API with the PDF resolver stubbed to "no result", so `ok:true` can only come from the XML path. Not tested: PDF fallback, `publisher_challenge` live, extraction/LLM stages.

## 2. Truth set + provenance
- **Population:** the 23 included ketamine/TRD RCT DOIs (published-review inclusion list as recorded in `spec/field-report-ketamine-trd.md`; secondary provenance, I did not re-derive the list from the SR itself).
- **Availability truth:** Europe PMC `search ... resultType=core` per DOI (`isOpenAccess`, `pmcid`), fetched by the harness with its own parsing, not the app's `resolvePmcid`. Caveat: the same service backs the app, so this checks internal consistency of the fetch/parse chain, not Europe PMC's coverage.
- **Content truth:** numbers in each paper's published abstract (Europe PMC core record), tested for presence in the fetched XML text via `checkSourcePresence`. Control: 3 implausible numbers (7341.77, 9182.43, 6620.19) per paper.
- Harness: `spec/validation/011-harness.test.ts` (live, gated `LIVE=1`; skipped in normal suite). Per-DOI output: `spec/validation/011-results.json`. ~92 s.

## 3. Results
| Metric | Result |
|---|---|
| Europe PMC flags OA (`isOpenAccess=Y`) | 7/23 |
| …of those, XML fetched by DOI | **7/7** (Wilson 95% CI 0.65–1.00) |
| Same, by PMID | 7/7 (identical outcome to DOI) |
| Has PMCID but not OA-flagged | 5 (12 total with PMCID); XML fetched for **0/5**, i.e. correctly fell through (no false success) |
| No PMCID | 11; fell through |
| Overall XML yield on this truth set | 7/23 = 30% (rest depend on the untested PDF path) |
| Abstract numbers found in fetched XML (7 papers) | 103/113 = **91.2%** (Wilson 0.84–0.95); per paper 16/19, 21/24, 19/20, 14/17, 21/21, 2/2, 10/10 |
| Control fabricated numbers passing source-presence | **0/21** |

Misses (10 numbers) were not diagnosed; plausible causes are abstract-only values (rounding, percent/CI formatting) rather than parse loss, but this is unconfirmed.

## 4. Observations (defects/noise, not failures)
- `jatsToPages` emits back-matter as units (Acknowledgements, Contributor Information, Data availability, Conflict of interest, Footnotes) and untitled sections as locator "Section 1"; one paper has a duplicate "Supplementary information". Harmless to the gate but adds noise for the extractor.
- Two Singh 2016 papers, Zarate 2006, Murrough 2013 etc. (non-OA) get no XML, so the PDF path (blocked by publisher bot-checks per handoff 118) carries ~70% of this set. Real-world value of this slice is bounded by OA share (~30% here).

## 5. Pass/fail
No explicit numeric bar in the brief for this slice. Against the stated behaviour ("extract from Europe PMC XML when the study has an OA PMCID, else fall through"): **PASS** on 7/7 OA, 0 false successes; small n, so the CI is wide. Content fidelity 91% of abstract numbers locatable, with 0/21 fabricated controls passing.

## 6. Wiki claims
| Claim | Status |
|---|---|
| Identifier input is XML-first via Europe PMC (DOI and PMID) | `claimed (120)` → **verified (011)** for OA-flagged papers, n=7 |
| JATS→units retains table numbers adjacent to labels (usable by source-presence gate) | **partially verified (011)**: 91% abstract-number presence; misses undiagnosed |
| Non-OA PMCIDs fall back cleanly | **verified (011)**, 5/5 |
| `publisher_challenge` reason, PDF fallback live | still `claimed` (not tested) |
| AC5 false-`verified` rate = 0 | unchanged (`partially verified`, validation 010) |

## 7. Reproduce
`cd /Users/dharmayudesai/blindspot && LIVE=1 npx vitest run spec/validation/011-harness.test.ts` (network required; Europe PMC data may drift).
