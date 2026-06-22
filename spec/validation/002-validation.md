# Validation 002 — Full-Text OA Resolution Chain (handoff 102)

**Tester instance** · **Date:** 2026-06-22 · **Stage:** Pipeline 3→4 gate (full-text retrieval)
**Brief under test:** `spec/briefs/001.md` (Full-Text Retrieval — Open-Access PDF Resolution)
**Handoff under test:** `spec/102-handoff.md`
**Code under test:** `lib/fulltext.ts`, `app/api/fulltext/route.ts`
**Harness:** `spec/validation/002-harness.mjs` (live-network, keyless)

> Tester scope reminder: this report measures what the code does and reports it. It does **not**
> edit code or wiki. Fixes are for the dev; wiki reconciliation is for the librarian.

---

## 1. What was tested

Handoff 102 shipped the OA full-text resolution chain (`lib/fulltext.ts`) and its API route
(`/api/fulltext`). The dev marked AC1 (resolution rate ≥70%) and AC2 (p95 ≤ 3 s) as "deferred
to tester" — verified only against stubbed unit tests. This report supplies the live-network
measurement.

Tests run:
1. **Unit tests** — dev's own 11-test suite (`lib/fulltext.test.ts`) re-run for AC3/AC4/AC7 confirmation.
2. **Live-network harness** — `002-harness.mjs` called Unpaywall, OpenAlex (keyless), Europe PMC,
   and PMC IDCONV with real network calls against a 20-study gold set, measuring resolution rate
   (AC1) and per-call latency (AC2).

---

## 2. Truth set and provenance

### Gold set (N=20) — selection and provenance

| Field | Value |
|-------|-------|
| Source | PubMed E-utilities `esearch` with filter `pmc free full text[filter] AND systematic review[pt] AND 2024:2025[dp]` |
| Retrieved | 2026-06-22, first 20 results with DOIs selected |
| External verifier | NCBI's "PMC free full text" filter: articles satisfying this filter are verified OA by NCBI policy (PMC deposit requires open-access licence for most journals) |
| PMC-confirmed (have PMCID) | 16/20 |
| Without PMCID (OA via Unpaywall as hybrid/bronze/gold) | 4/20 |

**Gold set (PMID, DOI, PMCID):**

| PMID | DOI (truncated) | PMCID |
|------|----------------|-------|
| 42256478 | 10.15167/2421-4248/jpmh2025.66.4.3461 | PMC13235388 |
| 41641246 | 10.3389/fmed.2025.1732129 | PMC12865719 |
| 41640684 | 10.3389/fphar.2025.1731397 | PMC12864444 |
| 41458387 | 10.46989/001c.154588 | PMC12742321 |
| 41444887 | 10.1186/s12911-025-03326-8 | PMC12849454 |
| 41204169 | 10.1186/s12906-025-05139-8 | PMC12595913 |
| 41172929 | 10.1016/j.jpsychires.2025.10.063 | none |
| 41148593 | 10.31557/APJCP.2025.26.10.3561 | PMC12887904 |
| 41088058 | 10.1186/s12885-025-15068-x | PMC12523103 |
| 41069963 | 10.3389/fnagi.2025.1598608 | PMC12504467 |
| 41010989 | 10.3390/medicina61091596 | PMC12471333 |
| 41008589 | 10.3390/biom15091282 | PMC12467331 |
| 40976496 | 10.1016/j.bone.2025.117636 | none |
| 40951465 | 10.52225/narra.v5i2.2268 | PMC12425541 |
| 40850887 | 10.1016/j.clinthera.2025.07.006 | none |
| 40849686 | 10.31557/APJCP.2025.26.8.2699 | PMC12659866 |
| 40812100 | 10.1016/j.semarthrit.2025.152805 | none |
| 40781547 | 10.1038/s41432-025-01182-z | PMC12716998 |
| 40678664 | 10.3138/canlivj-2024-0050 | PMC12269252 |
| 40668786 | 10.1371/journal.pone.0325563 | PMC12266414 |

**Selection bias caveat (important for interpreting AC1):** The PubMed PMC free full-text
filter is a high-OA corpus by construction — NCBI only accepts open-access articles in PMC
for most journals. A real Blindspot screened pool contains papers from a full Boolean search
across sources, many of which are paywalled. The 100% resolution rate measured here reflects
a best-case scenario; production OA rates for general screened pools are typically 50–70%
(cf. Piwowar et al. 2018, PeerJ — ~47% of recent biomedical literature is OA). The ≥70%
bar passes against this corpus but **the production estimate against an unselected screened
pool is unknown and likely lower.**

---

## 3. Results

### 3.1 AC1 — OA resolution rate ≥70%  **→ PASS on this gold set**

```
Resolved:   20/20   (100.0%)
Not resolved:  0/20
```

| Source | Wins |
|--------|------|
| unpaywall | 19 |
| openalex  |  1 |
| europepmc |  0 |
| pmc       |  0 |

Unpaywall dominates: 19/20 resolved on the first source tried. The one Unpaywall miss
(pmid:42256478, a journal not yet indexed in Unpaywall) was caught by OpenAlex on the
keyless `mailto` polite-pool path.

**Per sub-group:**
- PMC-confirmed OA (PMCID present): 16/16 resolved — as expected; all have verified OA copies.
- Non-PMC studies (hybrid/bronze/gold OA, no PMCID): 4/4 resolved via Unpaywall.

**PASS vs. bar (≥70%).** Confidence interval (Wilson, 95%): 83.9–100%. The claim in handoff
102 AC1 (`claimed`) can be moved to `verified (validation 002, 100% on PMC-corpus gold set)`
with the caveat that production rate against a mixed-OA pool is unverified.

---

### 3.2 AC2 — p95 latency ≤ 3 s  **→ FAIL (marginal, single outlier)**

```
n          = 20
p50 (median)= 187 ms
p75         = 204 ms
p95         = 3 585 ms   ← exceeds 3 000 ms bar
p100 (max)  = 3 585 ms
```

All 20 per-study latencies (sorted):
`125, 126, 127, 129, 129, 134, 145, 159, 177, 186, 187, 189, 190, 191, 191, 191, 204, 206, 210, 3585`

The single outlier (pmid:42256478, 3585 ms) is a **sequential chain fallthrough**: Unpaywall
returned 404 (fast), then the chain fell through to OpenAlex which took ~3.4 s to respond.
The orchestrator is sequential — no concurrent source fanout — so worst-case latency equals
the sum of latencies of all failed sources plus the winning source. With Unpaywall indexing
lag for new journals, fallthrough to OpenAlex is a real-world path; p95 of 3585 ms means 1
study in 20 exceeds the bar.

Without the outlier: p19 = 210 ms — overwhelmingly fast. The 3 s bar fails at the tail, not
the typical case.

**FAIL vs. bar (≤3 000 ms p95).** The unit-test latency assertion (AC2) uses stubbed fetch
(always sub-millisecond) and is vacuous for real-network latency — see F3 below.

---

### 3.3 AC3 — Provenance on every result  **→ PASS** (unit tests + live)

All 11 unit tests pass. In the live run, all 20 resolved results carry a non-null `source`
field (`"unpaywall"` × 19, `"openalex"` × 1). No resolution was returned without provenance.

---

### 3.4 AC4 — No paywalled URLs returned  **→ PASS** (unit tests + live)

Unit tests: 2 explicit AC4 scenarios pass (closed Unpaywall record → null + `paywalled`
reason; closed OpenAlex record → null). Live: 0/20 paywalled URLs returned. The
`gate()` backstop in the orchestrator and the per-source `is_oa` check held in all calls.

---

### 3.5 AC7 — No screening regression  **→ PASS** (confirmed)

`npx vitest run lib/fulltext.test.ts` → **11/11 pass** (re-run 2026-06-22, same result as
dev-reported gate). No new failures introduced.

---

## 4. Findings

| # | Severity | Finding | Owner |
|---|---|---|---|
| F1 | **High** | **AC2 FAIL: real-network p95 = 3 585 ms, 585 ms over bar.** Root cause: sequential chain design accumulates fallthrough latency. For any study where Unpaywall returns 404 (new journal lag) or is slow, the chain proceeds to OpenAlex serially. A concurrent fanout (try all DOI sources in parallel, take first non-null) would guarantee p95 ≈ max(single-source p50) rather than sum of serial failures. Alternatively, raise the bar in the brief to ≥5 s p95 if acceptable. | Dev |
| F2 | **Medium** | **AC2 unit test is vacuous.** The latency test uses stubbed fetch (returns in ~0 ms) — it will pass regardless of real-network latency and provides no protection against regressions. A useful AC2 test would run the full chain against the live gold set and assert p95 ≤ 3 s, or at minimum use a `setTimeout` to inject realistic per-source latency into the stub. | Dev |
| F3 | **Medium** | **Gold set selection bias: 100% OA rate overstates production expectation.** The gold set is drawn from PubMed's PMC free full text filter, which is a high-OA corpus by construction. Real screened pools from a broad Boolean search may be 50–70% OA. The dev and wiki should not present "100% resolution rate (validation 002)" as a general production claim; it is a "resolution rate on verified-OA articles" measurement. A follow-up harness using a mixed OA/non-OA corpus (e.g., citing studies from a published SR that includes both OA and paywalled papers) would give a more representative estimate. | Dev / Librarian |
| F4 | **Low** | **OpenAlex keyless vs. keyed path divergence.** In this harness, OpenAlex was accessed keyless via `mailto` param (because no `OPENALEX_API_KEY` is set outside Next.js). The production code in `lib/fulltext.ts` sends `api_key` when the env var is set. Validation 001 found that key returning 401 (CRIT-1). If CRIT-1 is not fixed, the OpenAlex source in the chain will silently return no results for all studies where Unpaywall also fails — reducing the effective resolution rate. This validation's 100% rate benefited from the keyless OpenAlex path that production does not use when the key is set. | Dev |
| F5 | **Info** | **Europe PMC and PMC sources were never called.** All 20 studies resolved via DOI-keyed sources (Unpaywall/OpenAlex) before the PMID-keyed sources (Europe PMC, PMC) were reached. The PMID-keyed fallback path is untested live. Unit tests cover it with stubs. A future harness run targeting PMID-only studies (no DOI) would exercise sources 3 and 4. | — (informational) |

---

## 5. Claims status (handoff 102 AC table)

| AC | Claim | Status before | Status after |
|----|-------|--------------|--------------|
| AC1 | OA resolution rate ≥70% on 20-study gold set | `claimed` | `verified (validation 002): 100% on PMC-corpus gold set; production mixed-OA rate unverified — see F3` |
| AC2 | p95 ≤ 3 s real network | `claimed` | `contradicted (validation 002): p95 = 3 585 ms on 20-study live run; fails bar by 585 ms — see F1` |
| AC3 | Provenance on every result | `claimed (met, unit tests)` | `verified (validation 002): holds in unit tests + 20 live calls` |
| AC4 | No paywalled URLs | `claimed (met, unit tests)` | `verified (validation 002): holds in unit tests + 20 live calls` |
| AC7 | No screening regression | `claimed (met, build gate)` | `verified (validation 002): 11/11 unit tests still pass` |

---

## 6. Reproduction

```bash
# Deterministic offline (unit tests — AC3, AC4, AC7):
npx vitest run lib/fulltext.test.ts   # 11/11 expected

# Live-network (AC1, AC2) — no API key required, polite-pool rate:
node spec/validation/002-harness.mjs
# Expected: 20/20 resolved (100%), p95 varies by network conditions (~125–3 600 ms in this run)
# Gold set: 20 PMC-indexed SRs, PMIDs listed above, retrieved 2026-06-22
```

The harness is stateless and re-runnable. Results will vary slightly with Unpaywall/OpenAlex
response times but the resolution rate should be stable (all 20 are durably OA).

---

## 7. Verdict

| Criterion | Result | Notes |
|-----------|--------|-------|
| AC1 ≥70% resolution | ✅ **PASS** (100% on PMC gold set) | Gold set is OA-biased; see F3 |
| AC2 p95 ≤ 3 s | ❌ **FAIL** (p95 = 3 585 ms) | Single chain-fallthrough outlier; see F1 |
| AC3 provenance | ✅ **PASS** | Unit + live |
| AC4 no paywall | ✅ **PASS** | Unit + live |
| AC7 no regression | ✅ **PASS** | 11/11 unit tests |

**Overall:** AC1, AC3, AC4, AC7 pass. **AC2 fails** by a single chain-fallthrough outlier
(585 ms over bar). The resolution mechanism is sound; the sequential-chain latency model is
a structural design issue, not a correctness bug. Dev should address F1 (concurrent DOI
fanout or bar adjustment) before AC2 can be marked verified.

**Session completed:** 2026-06-22
