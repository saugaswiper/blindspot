# Validation 012 — PDF upload to `/api/extract`, live Gemini (handoff 121, Brief 009 AC5)

**Date:** 2026-10-14 · **Tester:** Sonnet 5.5 · **Code under test:** `app/api/extract/route.ts` multipart path → `pdfToPages` (unpdf) → 4-check gate → `callGeminiExtraction` (gemini-2.5-flash). No app code touched.

## 1. What was tested
Handoff 121 says the upload path is "unit-tested with stubs only; not exercised against a real PDF or live Gemini". This run POSTs a real multipart PDF to the real route handler (only Supabase auth stubbed), with real unpdf and live Gemini. Not tested: the 7-OA-paper XML half of AC5 (not run: time spent on the hang below), scanned-PDF 422 live, 25 MB cap, 401.

## 2. Truth set + provenance
- Paper: Pattanaseri et al. 2024, BMC Psychiatry, doi 10.1186/s12888-024-05951-5, CC BY (one trial from the ketamine/TRD set).
- Truth values: read by me from Tables 1–4 of the Europe PMC JATS XML (PMC11256507), not from app parsing and not from the wiki. 7 present targets (Table 2 day-10 ketamine 21.18 / midazolam 18.11 / day-31 ketamine 20.00; Table 3 day-10 change 12.55 / 17.22; Table 4 remission days 8.70; Table 1 age 32.36) + 2 **absent** targets (HAM-D at day 10; MADRS at day 60), for which any `verified` is a false verification.
- **Caveat (material):** publisher/PMC PDFs return bot-check HTML (403/200 html), so the fixture PDF is **rendered from the JATS XML** (pandoc → Chrome print-to-PDF), not the publisher PDF. It has a real text layer and real tables, but not publisher layout/two-column quirks. Result is therefore optimistic on text extraction. A second fixture with all tables removed was built as an ablation control.
- Fixtures: `spec/validation/fixtures/012-pattanaseri2024-rendered.pdf`, `…-tables-removed.pdf`. Harness: `spec/validation/012-harness.test.ts` (`LIVE=1`, needs `GEMINI_API_KEY`). Output: `012-results-full2.json`.

## 3. Results
Planned: 2 runs on full PDF + 1 ablated. Completed: **1 of 3** (full2, 27.6 s). The other two (full1, ablated) **did not return within 900 s** (test timeout), so n=1 and no variance estimate.

| Metric (full PDF, single completed run) | Result |
|---|---|
| `pdfToPages` on fixture | 14 pages, 177 ms (separate probe) |
| HTTP | 200 |
| Statuses | verified 3, manual 2, author_contact 4, check 0 |
| **False-`verified`** (verified value ≠ truth, or any verified on absent target) | **0 / 3 verified** (Wilson 95% upper bound ≈ 56%); **0 / 2** absent targets verified (both `manual`) |
| Verified values correct | 3/3 (20.00, 8.70, 32.36) |
| True values obtained as `verified` | **3/7 = 43%** (Wilson 0.16–0.75) |
| Right value read but routed `author_contact` ("value appears in a figure") | **4/7**: all four are Table 2/Table 3 items (21.18, 18.11, 12.55, 17.22) |
| Ablated (tables removed) control | **no result (hung)** |

## 4. Findings
1. **Hang / no timeout (defect).** 2 of 3 route invocations never returned in 900 s, while single Gemini calls take ~6 s (probe) and the completed run took 28 s. `callGeminiExtraction` (`lib/extraction-passes.ts:114`) has no fetch timeout/AbortSignal, so one stalled request blocks the whole target loop; on Vercel `maxDuration=300` the user gets a platform timeout, not a clean error. Cause of the stall not diagnosed (Gemini side vs. connection); the missing timeout is the code-side gap.
2. **Tables mislabelled as figures.** `lib/extraction.ts:135` sends a value to `author_contact` if *either* pass sets `from_figure`. In this run 4 of 7 table values were so routed even though both carry `locator: "Table 2/3"` and a verbatim source string. In my single-call probe the same model returned `from_figure:false` for k10, so this is pass-level nondeterminism. Effect: safe (no false verify) but costs yield — 43% verified.
3. Positive: fabrication-type protection held in this sample: absent targets returned `manual`, never a number.
4. Not confirmed from the brief's AC5(c): the SE-2.64-vs-CI mismatch → `check` expectation. Those targets were asked for the mean change only and were routed to `author_contact` first, so the consistency check was not reached.

## 5. Pass/fail vs. bar
Bar (Brief 009 AC5): false-`verified` = 0 on ≥3 trials with live Gemini. **Not met / INCONCLUSIVE:** 1 trial (rendered, not publisher PDF), 1 completed run, 2/3 runs hung. Observed false-verified is 0/3, but this is far too small to support a claim. Operator-visible reliability (hang) is a **FAIL** for shippability.

## 6. Wiki claims
| Claim | Status |
|---|---|
| `/api/extract` accepts multipart PDF and extracts from its text layer | `claimed (121)` → **partially verified (012)**: works end-to-end on a rendered PDF once; publisher PDFs untested |
| AC5 false-verified rate = 0 | stays `partially verified`; 0/3 in 012, n too small |
| Extraction is reliable/bounded in time | **contradicted**: 2/3 runs unbounded |
| Tables are distinguished from figures | **contradicted in part**: 4/7 table values routed as figure |

## 7. Reproduce
`cd /Users/dharmayudesai/blindspot && set -a && . ./.env.local && set +a && LIVE=1 npx vitest run spec/validation/012-harness.test.ts` (live; may hang per finding 1; add an external kill).
Recommended next: dev adds an AbortSignal timeout to the Gemini call, re-runs with ≥3 runs; tester then repeats the ablation control and the 7 OA papers via XML.
