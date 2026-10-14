# Validation 013 — Table≠figure routing (handoff 123, Brief 009 fix-slice item 2) + Brief 009 "Tester focus"

**Date:** 2026-10-14 · **Tester:** Sonnet 5.5 · **Code under test:** `lib/extraction.ts` `verifyTarget` at commit 24ae712 (`author_contact` only if both passes say figure AND `checkSourcePresence` fails source-wide), plus the 122 timeout/budget code on the same route. No app code touched.

## 1. What was tested
- **A. Coincidental-match probe (deterministic, no model):** real fixture text through the real `extractOutcomes` gate, stubbed passes that BOTH set `from_figure` and read a value that merely occurs elsewhere in the text, citing that occurrence's page.
- **B. Live Gemini through the real `POST /api/extract`** (multipart PDF, Supabase auth stubbed): 3 runs on the full fixture PDF, 3 runs on the tables-removed ablation, same 9 targets as validation 012 (7 present, 2 absent). Not run: the 7-OA-paper XML half of AC5; publisher-layout PDFs; live figure-only targets (see Limits).

## 2. Truth set + provenance
Pattanaseri et al. 2024, BMC Psychiatry, doi 10.1186/s12888-024-05951-5 (CC BY). Truth = Tables 1–4 values read from Europe PMC JATS XML (PMC11256507), as in 012 — not from the app, not from the wiki. Fixtures reused from 012 (rendered from XML, so optimistic vs. publisher PDFs). A text probe of the fixtures shows what the ablation actually removed: in the tables-removed PDF, 21.18 / 18.11 / 20.00 / 8.70 / 32.36 appear **0×** in text (table-only targets: k10, m10, k31, krem, age), while 12.55 and 17.22 still appear 1× each (abstract/results prose), so those two are not table-only. Harness: `013-harness.test.ts` (part A always runs; part B needs `LIVE=1` + `GEMINI_API_KEY`). Raw: `013-coincidence.json`, `013-results-{full1-3,abl1-3}.json`.

## 3. Results

### A. Coincidental-match probe — the brief's concern is CONFIRMED at the gate level
Both passes flag figure, value is incidental text, cited page = page where it occurs (ablated text):

| value | incidental source | both-figure | one-sided |
|---|---|---|---|
| 10, 31, 60, 2, 12.55, 0.05 | day/limit/p-threshold/abstract | **verified** (6/6) | verified (6/6) |

Under the pre-123 rule all six both-figure cases were `author_contact`. So a value read off a figure that happens to equal any number in the text is now `verified` whenever the pass cites that page. 6/6 for small integers and common decimals; no uncertainty estimate (deterministic, chosen adversarially — this shows the failure *exists*, not its live frequency). Mitigation present: the page-citation check — a pass citing the figure's own page (≠ coincident page) should yield `wrong_page`; I did **not** test that variant live or by stub. Worth a unit test by dev.

### B. Live runs
| run | wall time | verified | check | manual | author_contact | verified correct (vs Table value) | false-verified (strict) |
|---|---|---|---|---|---|---|---|
| full1 | 148 s | 7 | 0 | 2 | 0 | 7/7 | 0 |
| full2 | 354 s | 3 | 0 | 6 | 0 | 3/3 | 0 |
| full3 | 38 s | 7 | 0 | 2 | 0 | 7/7 | 0 |
| abl1 | **899 s** | 1 | 1 | 7 | 0 | 1 (12.55) | 0 |
| abl2 | 98 s | 2 | 1 | 6 | 0 | 1 (12.55) | **1** (krem=9) |
| abl3 | 87 s | 2 | 1 | 6 | 0 | 1 (12.55) | **1** (krem=9) |

- **Figure routing (item 2 effect):** `author_contact` = 0 in all 6 runs (012: 4/7 table values mis-routed). Yield on full PDF: 7/7, 3/7, 7/7 (mean 17/21 = 81%, Wilson 95% 0.60–0.92; run-to-run spread 43–100%). Improvement vs 012's 3/7 is real in 2 of 3 runs, but I cannot attribute it solely to 123: 012 saw the same model return `from_figure:false` on some calls (nondeterminism), and I did not run an old-code control.
- **Run variance:** full2's 6 manual targets are all `model_timeout: request time budget exhausted` — a slow Gemini run consumed the budget after 3 targets. Variance is driven by latency, not by the gate.
- **Absent targets (HAM-D day 10, MADRS day 60):** `manual` in 6/6 runs; 0 false-verified (0/12 target-runs).
- **Ablation, table-only targets (k10, m10, k31, krem, age; 15 target-runs):** 13 `manual`, **2 `verified` = krem→9 (abl2, abl3)**. Source string: "mean durations in remission of 9 days for ketamine (95% CI = 0.87–16.54)" on p6, a verbatim body-text sentence. Table 4 truth is 8.70. Adjudication: not a coincidental match and not a fabrication — the paper itself prints "9 days" in prose, so it is text-grounded — but it is a **rounded value verified for a target asking for the table mean**, i.e. precision loss the gate can't see (the 4 checks verify presence, not that the cited text is the requested statistic at the requested precision). Strict criterion counts it as false-verified: 2/15 table-only target-runs (13%, Wilson 4–38%); including absent targets, 2/27 (7%). Unrelated to the figure-routing branch (no `author_contact` involved).
- **12.55 and 17.22 in ablation** (still in prose): 12.55 verified 3/3 correctly; 17.22 → `check` 3/3 (hunter read −17.22 vs transcriber 17.22, a sign conflict) — safe.
- **Bounded time:** abl1 returned after **899 s**, above the 300 s Vercel `maxDuration` and the route budget intended by handoff 122 (the budget check is only between targets; a call that stalls inside a target is apparently not bounded, or retries exceed it). 1 of 6 runs (also full2 at 354 s > 300 s). Handoff 122 closed "2/3 hang" only partially. I didn't diagnose the stall.

## 4. Pass/fail vs. bar
Bar (Brief 009 AC5 / tester focus): false-`verified` = 0 on ≥3 trials with live Gemini; ablation must measure false-verified on figure/removed-table values.
- **Item 2 functional goal (stop mis-routing tables as figures): PASS (provisional)** — 0/6 mis-routes, yield 81% vs 43%; n = one paper, three runs, no old-code control.
- **Zero false-verified: FAIL on strict reading** (2 flagged, both krem=9 prose-rounded; adjudicated as text-grounded rounding, not coincidence) and the **deterministic probe shows the coincidental-match hole is real** at the gate (6/6). Still only 1 trial (not ≥3).
- **Time bound: FAIL** (2/6 runs > 300 s; one 899 s).

## 5. Wiki claims
| Claim | Verdict |
|---|---|
| Figure-flagged table cells no longer routed to `author_contact` (123) | `claimed` → **verified-provisional (013)**: 0/6 mis-routes; 1 paper |
| `verified` ⇒ zero false verifications (AC5) | **not verified; contradicted in a narrow sense** — gate-level coincidence probe 6/6; live 2/15 table-only runs verified a prose-rounded value |
| "no weakening of the gate" (handoff 123 Behavior) | **contradicted for figure-only values**: previously unconditional `author_contact`, now `verified` if the number occurs anywhere and the cited page matches |
| Extraction bounded in time (122) | **still contradicted**: 354 s and 899 s observed |
| Absent targets never `verified` | holds: 0/12 target-runs (supports, n small) |

## 6. Limits
1 paper; fixtures are XML-rendered; no figure-only target exercised live (the paper's figures aren't machine-readable here), so the live frequency of coincidental figure matches is unknown — only its possibility is shown. No old-code A/B control.

## 7. Recommendations (for dev; tester does not fix)
1. Restore safety for the figure path: require a table/body match to be **at the cited locator/page and in the same cell/row context** (not source-wide), or keep `author_contact` when the match is a bare small integer/common decimal; add the wrong-page-variant unit test.
2. Verify target statistic/precision, not just number presence (krem 9 vs 8.70): e.g. require the value's printed form to equal the cited text's form or flag rounded-in-prose as `check`.
3. Enforce the request budget inside a target (abort the in-flight pass at the deadline); 899 s is unacceptable.

## 8. Reproduce
`cd /Users/dharmayudesai/blindspot && set -a && . ./.env.local && set +a && npx vitest run spec/validation/013-harness.test.ts` (part A); add `LIVE=1` for part B (≈20 min, run abl separately with `-t abl`; use an external kill).
