# Validation 014 — Re-test of validation 013's three FAILs (handoffs 124, 125, 126)

**Date:** 2026-10-14 · **Tester:** Sonnet 5.5 · **Code under test:** `lib/extraction.ts` (124 cited-page + common-value guard; 125 `prose_integer` guard) and `lib/extraction-passes.ts` / `app/api/extract/route.ts` (126 request deadline → `AbortSignal`). No app code touched.

**Resume note:** the first 014 run measured everything live, then lost network before this record was written. This record is written from the committed raw results; **no live tests were re-run**. The only thing re-run was the deterministic 013 part-A probe (below).

## 1. What was tested and truth set
- **Truth:** Pattanaseri et al. 2024, BMC Psychiatry, doi 10.1186/s12888-024-05951-5 (CC BY); Tables 1–4 values from Europe PMC JATS XML (PMC11256507) — external, same as 012/013. Fixtures: `fixtures/012-pattanaseri2024-rendered.pdf` (full) and `...-tables-removed.pdf` (ablated; 21.18/18.11/20.00/8.70/32.36 occur 0× in text, so k10, m10, k31, krem, age are table-only; 12.55/17.22 survive once in prose). 9 targets: 7 with truth, 2 absent from paper (abs1, abs2). Fixtures are XML-rendered, so optimistic vs. publisher PDFs.
- **A. Coincidence probe (deterministic):** `013-harness.test.ts` part A re-run against current code (the 014 harness does not contain it; it has the stall and live parts only).
- **B. Live (done in the earlier run, 014-results-*.json):** full PDF ×3, tables-removed ×3 through the real `POST /api/extract`, Gemini live.
- **C. Stall (no network, `STALL=1`, `014-results-stall.json`):** global fetch stubbed to hang until its AbortSignal fires; full route POST. Harness: `014-harness.test.ts`.

## 2. Results

### A. Coincidence hole (handoff 124) — PASS at the gate
Same six adversarial stubs as 013 (both passes flag `from_figure`, value is an incidental occurrence elsewhere in text, cited page = that occurrence's page):

| value | 013 (pre-124) | now |
|---|---|---|
| 10, 31, 60, 2, 0.05 | `verified` | `author_contact` (5/5) |
| 12.55 (abstract decimal, on cited page) | `verified` | `verified` |

0/5 common-value coincidences verify (was 5/5; 6/6 counting 12.55). The 12.55 case still verifies by design: a non-common decimal found on the very page cited is indistinguishable from a real text value — a residual coincidence class (rare decimals that coincide on the cited page) that the guard cannot close; it is narrow, not zero. Deterministic and adversarially chosen: shows the hole is closed for the tested class, not a live frequency. The wrong-page variant (pass cites the figure's own page ≠ coincident page) is covered only by dev's unit test, not independently by me.

### B1. Live accuracy
- **Full PDF, 3 runs × 9 targets:** each run verified 7, check 0, manual 2. All 21 verified target-runs equal truth exactly (21/21 correct; Wilson 95% 84.5–100%). The two absent targets (abs1, abs2) went `manual` 6/6 (no fabrication). Yield on gradeable targets 100%.
- **Tables-removed, 3 runs, table-only targets (k10, m10, k31, krem, age; 15 target-runs):** **0 verified**, 15/15 not verified (Wilson 95% upper bound on false-verify rate 20%): 12 `manual`, 3 `check` (krem→9 in all three runs). Whole-run: 0 `verified` of 27 target-runs (0 of 6 runs).
- Other ablation outcomes: kd10 `check` 12.55 ×3 (correct value, passes disagreed, sent to human); md10 `check` ×3 (17.22 / −17.22 sign disagreement; abl3 got −17.22, flagged as absent from text and out of range). No wrong value reached `verified`.

### B2. Prose-rounded false-verify (handoff 125) — PASS
krem (truth 8.70): 013 had `verified` 9 in 2/3 ablated runs. Now `check` 3/3 with message "9 was read from body prose, not a table, for a continuous statistic — likely a rounded mention". 0/3 false-verifies (was 2/3). Full-PDF runs still verify the table decimal 8.7 correctly 3/3, so the guard didn't suppress the legitimate case. Caveat from the handoff stands: genuine integer-valued continuous statistics read from prose also route to `check` (conservative; not measured here — no such target in this paper).

### C. Runtime bound (handoff 126)
| condition | n | wall time | bar |
|---|---|---|---|
| Live full PDF | 3 | 39.0 s, 36.4 s, 24.7 s | < 300 s |
| Live tables-removed | 3 | 79.4 s, 75.5 s, 121.4 s | < 300 s |
| Stalled model (stub, never responds) | 1 | **180.7 s**, HTTP 200, 8 fetch calls, all 9 targets `manual` (`model_timeout`) | < 300 s |

All 7 runs < 300 s (013: 2/6 live runs over, max 899 s). The stall run lands at the 180 s `EXTRACTION_BUDGET_MS` (+0.7 s), i.e. the deadline now cuts in-flight calls rather than only checking between targets; the route degrades to `manual` with an honest `model_timeout` reason instead of hanging. Limits: the stall test is a stub, n = 1, and with a stalled model the first targets consume the whole budget so the rest are never attempted (acceptable degradation, but yield is 0 in that case). Live: n = 6 and the 013 stall (1/6 runs) was intermittent, so 6 clean live runs bound the live rate of >300 s only to roughly < 40% (Wilson upper, 0/6) — the deterministic stall test is the stronger evidence. Gate recovery on the stall run: HTTP 200, no 5xx.

## 3. Pass/fail vs. the bar
| 013 FAIL | Verdict | Evidence |
|---|---|---|
| Coincidence hole (→124) | **PASS (gate level, common values)**; residual: non-common decimal on cited page | 0/5 vs 5/5 |
| Prose-rounded false-verify (→125) | **PASS** | 0/3 vs 2/3; 8.7 table case 3/3 still verified |
| >300 s runtime (→126) | **PASS (provisional)** | max 180.7 s stalled stub, 121.4 s live; was 899 s |
| Zero false-verified overall | **PASS on this set**: 0 wrong values `verified` in 54 target-runs (21 correct verifies, 0 wrong) | n = 1 paper, 3 runs/condition; upper bound ~7% per target-run overall, 20% on the table-only subset |

## 4. Wiki claims
- Request-duration bound (route finishes within `maxDuration`): `claimed` → **verified** (stalled-stub and 6 live runs); scope: Gemini stalls, 180 s budget.
- Figure-vs-text routing: figure-flagged common values do not verify via coincidental text: `claimed` → **verified** for the tested classes (small integers, 0.05); rare-decimal-on-cited-page case remains open.
- Prose integer for continuous statistic → `check`: `claimed` → **verified** (krem).
- "`verified` ⇒ zero false verifications (AC5)": stays **claimed** (not contradicted now; supported 0/54 on one paper, not enough for the claim).
- Table-only extraction when tables are absent is honest (no fabrication): supported (0 verified, absent targets `manual` 6/6).

## 5. Caveats and follow-ups
- One paper, XML-rendered fixtures, no old-code control in this run (the 013 numbers serve as the baseline).
- No figure-only target live; the live rate of coincidental figure matches is still unknown.
- Suggest dev: unit test for a rare decimal coincident on the cited page; the `md10` sign disagreement (17.22 vs −17.22) in every ablated run suggests sign handling for "change" statistics is worth a look (safe today since it goes to `check`).
- Files: `014-harness.test.ts`, `014-results-{full1-3,abl1-3,stall}.json`; part A via `013-harness.test.ts`.
