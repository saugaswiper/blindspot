# Validation 003 — Concurrent DOI Fanout (handoff 103)

**Tester instance** · **Date:** 2026-06-23 · **Stage:** Pipeline 3→4 gate (full-text retrieval)
**Brief under test:** `spec/briefs/002.md` (Full-Text Retrieval Stage 2, item 1 only)
**Handoff under test:** `spec/103-handoff.md`
**Code under test:** `lib/fulltext.ts` (orchestrator + `fanout()` helper), `lib/fulltext.test.ts`
**Harness:** `spec/validation/003-harness.mjs` (live-network, concurrent fanout, keyless)
**Prior validation:** `spec/validation/002-validation.md` (handoff 102)

> Tester scope reminder: this report measures what the code does and reports it. It does **not**
> edit code or wiki. Fixes are for the dev; wiki reconciliation is for the librarian.

---

## 1. What was tested

Handoff 103 addressed validation 002 finding **F1** (AC2 latency fail: p95 = 3 585 ms, 585 ms
over the 3 000 ms bar) and **F2** (vacuous AC2 unit test). The fix: the sequential DOI source
chain (`tryUnpaywall` → `tryOpenAlex`) was replaced with a **concurrent DOI fanout** that races
both sources and returns the first OA hit without waiting for slower misses. PMID-keyed fallbacks
(Europe PMC, PMC) remain sequential and unchanged.

Tests run:
1. **Unit tests** — full vitest suite for `lib/fulltext.test.ts` (13 tests, +2 new AC2-unit tests
   from handoff 103) run to verify AC2-unit, AC3, AC4, AC7 and confirm no regression.
2. **Live-network harness** — `003-harness.mjs`, a new harness that **mirrors the concurrent
   fanout** from `lib/fulltext.ts` (unlike `002-harness.mjs`, which was a sequential mirror and
   could not measure the latency fix). Called Unpaywall and OpenAlex concurrently against the same
   20-study gold set from validation 002, measuring AC1 and AC2-live.

---

## 2. Truth set and provenance

### Gold set — same 20 studies as validation 002 (no changes)

| Field | Value |
|-------|-------|
| Source | PubMed E-utilities `esearch`, filter: `pmc free full text[filter] AND systematic review[pt] AND 2024:2025[dp]` |
| Retrieved | 2026-06-22 (validation 002); re-used unchanged for comparability |
| External verifier | NCBI PMC free full text filter (verified OA by NCBI policy) |
| PMC-confirmed (PMCID present) | 16/20 |
| Non-PMC (OA via Unpaywall, no PMCID) | 4/20 |

Selection bias caveat (carried from validation 002): this is a high-OA corpus by construction.
The ≥70% AC1 bar passes against it, but production OA rates for unselected screened pools are
typically lower (~50–70%; Piwowar et al. 2018, PeerJ). See also F3 from validation 002.

### Harness fidelity note

The new `003-harness.mjs` mirrors `lib/fulltext.ts`'s `fanout()` function structurally. One
minor logging artefact: when one source wins the race before the other settles, the losing
source's outcome is not pushed to `sourceLog` (the `if (done) return;` guard fires first).
This affects the per-study log readability but **not the latency measurement** — wall-clock
time is measured at the `resolveFulltext()` call boundary and captures the concurrent race
correctly.

---

## 3. Results

### 3.1 AC2-unit — Concurrent fanout timing (new deterministic tests)  **→ PASS**

```
npx vitest run lib/fulltext.test.ts
13/13 pass   (was 11/11 in validation 002)
```

The two new AC2-unit tests (added by handoff 103) proved:

| Test | Setup | Result |
|------|-------|--------|
| "races DOI sources concurrently: a slow miss never delays a faster hit" | Unpaywall miss at 400 ms delay; OpenAlex hit at 200 ms delay | Elapsed ≤ 350 ms (actual: ~200 ms); sequential would be ~600 ms |
| "does not serially accumulate latency when both DOI sources are slow" | Unpaywall 404 at 300 ms; OpenAlex hit at 300 ms | Elapsed ≤ 450 ms (actual: ~300 ms); sequential would be ~600 ms |

These tests **fail if `fanout()` is removed and the orchestrator is reverted to a sequential
loop** — they are the authoritative structural proof of the concurrent behavior. Both passed.

The original vacuous latency test (F2 from validation 002) is retained but is still vacuous
(uses zero-delay stubs). The new tests supersede it for AC2 coverage.

---

### 3.2 AC2-live — p95 ≤ 3 s, concurrent harness  **→ PASS**

```
n          = 20
p50 (median)= 131 ms
p75         = 141 ms
p95         = 926 ms   ← within 3 000 ms bar
p100 (max)  = 926 ms
```

All 20 per-study latencies (sorted, ms):
`124, 124, 125, 125, 125, 126, 128, 128, 128, 130, 131, 131, 133, 136, 139, 141, 142, 143, 280, 926`

**The former outlier (pmid:42256478) at 3 585 ms in validation 002 resolved in 926 ms in this
run.** In validation 002 it forced a serial Unpaywall-miss → OpenAlex chain; with the concurrent
fanout, OpenAlex's response lands at 926 ms without waiting for Unpaywall's sequential 404.

**Caveat — network variance vs. fanout effect:** The 3 585 ms in validation 002 was dominated by
OpenAlex responding slowly (~3.4 s) on that day for that DOI, on top of the sequential miss
penalty. Today OpenAlex responded in 926 ms for the same DOI. We cannot disentangle how much of
the improvement is the concurrent fanout vs. OpenAlex being faster today. The **unit tests** are
the clean proof of the structural fix; the live harness confirms no regression and p95 well within
bar. A definitive structural demonstration on live traffic would require a run where Unpaywall is
reliably slow (e.g. same-day miss + OpenAlex fast), which is not controllable.

**PASS vs. bar (≤3 000 ms p95).**

---

### 3.3 AC1 — OA resolution rate ≥70%  **→ PASS** (unchanged)

```
Resolved:   20/20   (100.0%)
Not resolved:  0/20
```

| Source | Wins |
|--------|------|
| unpaywall | 18 |
| openalex  | 2  |
| europepmc | 0  |
| pmc       | 0  |

Two studies that resolved via OpenAlex (pmid:42256478, pmid:41641246): in both cases OpenAlex
settled the fanout before Unpaywall's response arrived. Unpaywall's outcome for these was not
logged (see harness fidelity note above); the resolution rate is unaffected.

**PASS vs. bar (≥70%).** Wilson 95% CI: 83.9–100%. Same caveat as validation 002 (OA-biased
gold set; production mixed-OA rate unverified).

---

### 3.4 AC3 — Provenance on every result  **→ PASS**

All 13 unit tests pass (includes explicit AC3 scenarios). All 20 live results carry a non-null
`source` field. No change to the provenance/reason-code logic in handoff 103.

---

### 3.5 AC4 — No paywalled URLs returned  **→ PASS**

All 13 unit tests pass (includes explicit AC4 scenarios). 0/20 paywalled URLs in live run. The
`gate()` backstop and per-source `oa_status` checks are unchanged from handoff 102.

---

### 3.6 AC7 — No screening regression  **→ PASS**

```
npx vitest run lib/fulltext.test.ts   → 13/13 pass
npx vitest run                        → 857 pass, 15 fail
```

The 15 failures are the same pre-existing, unrelated failures documented in handoff 083 §8
(`boolean-search-builder`, `cache-freshness`, `cache-topic-search`, `keyboard-shortcuts`,
`protocol-storage`, `study-design`, `use-persistent-*`). Zero new failures. AC7 holds.

---

## 4. Findings

| # | Severity | Finding | Owner |
|---|---|---|---|
| F1 | **Resolved** | AC2 FAIL from validation 002 (p95 = 3 585 ms). Concurrent fanout shipped; unit tests structurally prove max-not-sum timing; live p95 = 926 ms. | — |
| F2 | **Resolved (partial)** | Vacuous AC2 unit test from validation 002. Two new deterministic timing tests added (fail on sequential revert). The original vacuous test is retained but now redundant — future cleanup is low priority. | — |
| F3 | **Carried — Open** | Gold set selection bias: 100% OA rate overstates production expectation. Not addressed by handoff 103 (out of scope). A mixed-OA corpus harness remains the correct follow-up. | Dev / Librarian |
| F4 | **Carried — Open** | OpenAlex keyless vs. keyed path divergence (CRIT-1, validation 001). Not addressed by handoff 103. Production `lib/fulltext.ts` sends `api_key` when env var is set; if the key returns 401 (CRIT-1 unresolved), OpenAlex is silently skipped — the concurrent fanout still races, but OpenAlex always fails-fast, reducing effective coverage to Unpaywall-only. | Dev |
| F5 | **Carried — Informational** | Europe PMC and PMC fallback paths were never called in the live harness (all studies resolved via DOI sources). PMID-keyed fallbacks are tested only by unit tests with stubs. | — (informational) |
| F6 | **New — Low** | Harness sourceLog is incomplete for the fanout-winner scenario: when one source wins the race, the losing source's outcome is not pushed to `sourceLog` because `if (done) return;` fires before logging. This does not affect latency measurement or AC1/AC2 results, but makes per-study source attribution partial (e.g., pmid:42256478 shows only `openalex:hit`, not `unpaywall:miss`). Future harness improvement: collect all outcomes and mark the winner. | — (harness, informational) |

---

## 5. Claims status

| AC | Claim | Status before (validation 002) | Status after (validation 003) |
|----|-------|-------------------------------|-------------------------------|
| AC1 | OA resolution rate ≥70% | `verified (002): 100% on PMC-corpus gold set; production rate unverified` | Unchanged — `verified (002)` |
| AC2 | p95 ≤ 3 s real network | `contradicted (002): p95 = 3 585 ms` | `verified (003): p95 = 926 ms on 20-study live run, concurrent harness; structural proof via 2 deterministic unit tests (see §3.1)` |
| AC3 | Provenance on every result | `verified (002)` | Unchanged — `verified (002, 003)` |
| AC4 | No paywalled URLs | `verified (002)` | Unchanged — `verified (002, 003)` |
| AC7 | No screening regression | `verified (002)` | Unchanged — `verified (002, 003)` |

---

## 6. Reproduction

```bash
# Deterministic offline (all ACs except AC2-live):
npx vitest run lib/fulltext.test.ts
# Expected: 13/13 pass. The two AC2-unit tests prove concurrent timing structurally.

# Live-network (AC1, AC2-live) — no API key required:
node spec/validation/003-harness.mjs
# Expected: 20/20 resolved (100%), p95 well under 3 000 ms (this run: 926 ms)
# Gold set: same 20 PMC-indexed SRs as validation 002, PMIDs listed in 002-validation.md
# Network variance: p95 should remain stable on the 18 Unpaywall-direct studies (~130 ms);
# the 2 OpenAlex-resolved studies (pmid:42256478, pmid:41641246) will vary with OpenAlex
# response time but should remain well under 3 s.
```

---

## 7. Verdict

| Criterion | Result | Notes |
|-----------|--------|-------|
| AC1 ≥70% resolution | ✅ **PASS** (100% on PMC gold set) | Unchanged from validation 002; selection bias caveat applies |
| AC2 p95 ≤ 3 s | ✅ **PASS** (p95 = 926 ms, concurrent harness) | Was ❌ FAIL (3 585 ms) in validation 002; structural fix verified by unit tests |
| AC2-unit concurrent | ✅ **PASS** (2 new timing tests, both pass) | Deterministic; fail on sequential revert |
| AC3 provenance | ✅ **PASS** | Unit + live |
| AC4 no paywall | ✅ **PASS** | Unit + live |
| AC7 no regression | ✅ **PASS** | 13/13 unit tests; 15 pre-existing failures unchanged |

**Overall:** All ACs pass. The AC2 failure from validation 002 is resolved. The concurrent DOI
fanout is structurally proven by the new unit tests and confirmed on live traffic. The open items
(F3 mixed-OA corpus, F4 OpenAlex key path) are carry-forwards for future validation runs.

**Session completed:** 2026-06-23
