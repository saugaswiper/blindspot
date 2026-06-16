# Validation 001 — Stage 3 (Search Recall) harness: correctness, readiness, and integrity

**Tester instance** · **Date:** 2026-06-16 · **Stage:** 3 — Primary-literature capture (recall)
**Spec under test:** `[[Validation Strategy]]` §Stage 3 · `[[Milestone — Search Recall & Provenance Benchmark]]`
**Code under test:** `lib/recall-benchmark.ts`, `lib/study-id.ts`, `lib/fixtures/recall-fixtures.ts`,
`app/api/search/route.ts`, `lib/{openalex,pubmed,europepmc}.ts` (as of uncommitted handoff 085 worktree)

> Tester scope reminder: this report measures what the code does and reports it. It does **not**
> edit code or wiki. Fixes are for the dev; wiki reconciliation is for the librarian.

---

## 1. What was tested

The dev landed a recall-benchmark harness (handoffs 084–085) implementing the Bramer-method
recall measurement: take published SRs whose included studies are openly listed (the gold-standard
truth set), record what each source returned for the review's query, and compute per-source and
deduplicated-**union** recall against a ≥95% (aspiration 98%) pass bar.

I tested four things:
1. **Engine correctness** — does `runRecallBenchmark` compute per-source/union recall, the
   best-single-source margin, and miss detection correctly?
2. **Production parity** — does the benchmark match studies using the *same* identifier semantics
   the shipped search route uses to dedup? (If not, measured recall ≠ shipped behaviour.)
3. **Stage-3 readiness** — is the pass bar actually *measurable* today?
4. **Live retrieval** — do the production source functions the harness is meant to consume
   actually return harness-shaped records?

---

## 2. Truth sets / provenance

| Artifact | Source | Nature |
|---|---|---|
| `SYNTHETIC_RECALL_FIXTURE` | `lib/fixtures/recall-fixtures.ts` | **Synthetic** — 5 studies, designed to exercise PMID-only / DOI cross-form / union-recovers / irreducible-miss. Correctly flagged `synthetic: true`. |
| `REAL_RECALL_FIXTURES` | same file | **Empty** (`[]`). |
| Live retrieval probe | OpenAlex / PubMed / Europe PMC, query `"cognitive behavioral therapy insomnia"`, `OPENALEX_API_KEY` from `.env.local`, run 2026-06-16 | Real, executed; used only to confirm the retrieval path returns records — **not** used as a recall measurement (no verified truth set attached). |

No invented PMIDs/DOIs were introduced. Per the harness integrity rule, a recall number is only
"measured" if backed by a real, cited truth set — there are none yet, so **no measured recall is reported**.

---

## 3. Results

### 3.1 Engine correctness — ✅ PASS
`npx vitest run lib/recall-benchmark.test.ts lib/study-id.test.ts lib/retractions.test.ts` →
**40/40 pass**. Independently re-running the engine on the synthetic fixture reproduces the
documented figures exactly:

```
  PubMed             40.0%  (2/5)
  OpenAlex           40.0%  (2/5)
  Scopus             20.0%  (1/5)
  ──────────────────────────────
  Deduplicated union 80.0%  (4/5)
  Union margin over best: +40.0% ✓   union.recall=0.8  margin=0.4
```

PMID-only matching, DOI matching across URL-prefixed vs bare forms, union-recovers-what-no-single-
source-has, and the irreducible miss (T5) all behave correctly. The report output carries the
`[SYNTHETIC — not a measured result]` banner — a correct integrity guardrail.

### 3.2 Production parity — ✅ PASS (for the search route)
`app/api/search/route.ts:22` imports `normalizeDoi, dedupeStudyIds` from `@/lib/study-id`, and its
`computeDedupFraction` (route.ts:221) delegates to `dedupeStudyIds`. The benchmark (`recall.ts` via
`StudyIdIndex`/`dedupeStudyIds`) therefore matches studies using the **same** semantics the shipped
search route uses to dedup. Measured recall will reflect shipped behaviour. Good.

### 3.3 Stage-3 readiness — ⚠️ NOT YET MEASURABLE (pass/fail undetermined)
The ≥95% union-recall pass bar **cannot be evaluated today**:
- `REAL_RECALL_FIXTURES = []` → **0 real reviews** in the corpus. The only fixture is synthetic and
  by construction scores 80% (it is not, and does not claim to be, a recall result).
- The capture path the harness documents — `scripts/capture-recall-fixture.ts`, referenced in both
  `lib/recall-benchmark.ts:18` and `lib/fixtures/recall-fixtures.ts:7` — **does not exist** on disk
  (`scripts/` has no such file). There is currently no reproducible mechanism to populate the corpus.

So the milestone's acceptance criterion #2/#2b ("measured ≥95% union recall + coverage gap") is
**blocked on missing fixtures *and* a missing capture script**, not merely on running a button.

### 3.4 Live retrieval probe — ⚠️ OpenAlex DOWN; PubMed + Europe PMC OK
Driving the production retrieval functions live (`fetchPrimaryStudyIds`) for one topic:

```
OpenAlex   ERROR  OpenAlex ID fetch failed: 401
PubMed     returned  200 ids  (pmid:200 doi:0)    e.g. {"pmid":"42252432"}
EuropePMC  returned  200 ids  (pmid:184 doi:194)  e.g. {"pmid":"42246371","doi":"10.1080/...2678881"}
```

- **OpenAlex returns HTTP 401** with the `OPENALEX_API_KEY` from `.env.local` — the primary-study
  retrieval backbone is **non-functional in this environment**. This extends open blocker **CRIT-1**:
  the issue is not only "key not deployed to Vercel" — the key present locally is being **rejected**.
  Because the search route wraps sources in `Promise.allSettled`, production *degrades* rather than
  crashes (`openalexFailed = true`), but any union-recall measured **right now** would rest on
  PubMed + Europe PMC only, with OpenAlex contributing nothing.
- **PubMed** works but returns exactly the 200-id cap (PMID-only, no DOIs) — broad queries are
  truncated at `limit`, which will cap measurable per-source recall on large reviews.
- **Europe PMC** works and returns dual identifiers (184 PMID / 194 DOI), confirming its documented
  "bridge source" role that lets PMID-keyed and DOI-keyed sources dedup against each other.

---

## 4. Findings & code/claim contradictions

| # | Severity | Finding | Owner |
|---|---|---|---|
| F1 | **High** | OpenAlex primary-study retrieval returns **401** with the local key. OpenAlex is the source the About page credits with "96–99% recall"; while it is the recall backbone. Verify/rotate `OPENALEX_API_KEY` (and confirm whether OpenAlex now rejects the `api_key` query param vs. requiring the `mailto` polite-pool path). Until fixed, real-world union recall is PubMed+EuropePMC only. | Dev |
| F2 | **High (blocker)** | Stage 3 is **unmeasured**: 0 real fixtures **and** the documented capture script `scripts/capture-recall-fixture.ts` does not exist. The ≥95% pass bar is currently un-testable. | Dev |
| F3 | **Medium** | `normalizeDoi` **diverges across modules.** `lib/study-id.ts` and `lib/cron-search.ts` do `.trim()` *then* strip the `^https?://doi.org/` prefix; `lib/screening-utils.ts:110` and `lib/screening.ts:73` strip *then* `.trim()`. Because the regex is `^`-anchored, a whitespace-padded URL DOI fails to strip in the screening path. Empirically, **3 of 5** test inputs normalize differently (see §5). The recall benchmark uses the canonical `study-id` path, so **Stage 3 is unaffected**, but **Stage-4 screening dedup / human-verdict carry-over** can treat one study as two. | Dev |
| F4 | Low | PubMed `fetchPrimaryStudyIds` caps at 200 ids with no DOIs; on large reviews this truncates the candidate set and caps measurable PubMed per-source recall. Document/raise the cap before relying on per-source PubMed recall numbers. | Dev |
| C1 | — (no contradiction) | The About page (`app/about/page.tsx:162,218`) attributes "96–99% recall" to an **external** OpenAlex benchmark, not to Blindspot's own pipeline — honest. The wiki/milestone correctly mark Blindspot's *own* union recall as pending. No public claim currently overstates measured recall; this report just confirms it stays "pending" until F2 is resolved. | Librarian (keep "pending") |

---

## 5. Reproduction

```bash
# Engine + identifier semantics (deterministic, offline):
npx vitest run lib/recall-benchmark.test.ts lib/study-id.test.ts lib/retractions.test.ts   # 40/40

# F3 — normalizeDoi divergence (executed; 3/5 inputs diverge):
node -e '
const canon=d=>d.toLowerCase().trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i,"");
const screen=d=>d.toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//i,"").trim();
for(const c of ["https://doi.org/10.1/x","  https://doi.org/10.1/x","\thttps://doi.org/10.1/X\n"])
  console.log(canon(c)===screen(c)?"OK":"DIFF", JSON.stringify(c), "->", JSON.stringify(canon(c)), JSON.stringify(screen(c)));'

# F1/§3.4 — live retrieval probe (network; needs OPENALEX_API_KEY, OPENALEX_EMAIL):
# transient probe importing fetchPrimaryStudyIds for OpenAlex/PubMed/EuropePMC against
# "cognitive behavioral therapy insomnia" (see report §3.4 for recorded output).
```

---

## 6. Recommended next steps (for the dev / next tester session)

1. **Fix F1** — restore a working OpenAlex key (or the keyless `mailto` path) and re-probe; without it
   no honest union-recall number can include OpenAlex.
2. **Build the capture script** the harness already documents (`scripts/capture-recall-fixture.ts`):
   for an SR topic, call `fetchPrimaryStudyIds` per source, record returned `{pmid,doi}` arrays into a
   `RecallFixture.perSource`, pair with the SR's verified included-study list, commit under
   `lib/fixtures/`. This is the missing piece blocking criterion #2.
3. **Seed `REAL_RECALL_FIXTURES`** with ≥5 published SRs spanning fields/sizes/recency, with a held-out
   subset (no calibration/test leakage), each truth set cited to its source review. *Tester will then
   compute the first real union-recall with per-topic spread / CI.*
4. **Fix F3** — collapse the four `normalizeDoi` copies onto the single `lib/study-id.ts` primitive so
   screening, cron alerting, and search dedup cannot drift. (A future tester report will cover Stage 4
   screening reliability; F3 is a precondition for trusting its dedup.)

---

## 7. Verdict

- Stage-3 **engine**: ✅ correct and production-faithful (search-route parity).
- Stage-3 **pass bar (≥95% union recall)**: ⏳ **UNMEASURED / undetermined** — 0 real fixtures, no
  capture script, OpenAlex retrieval currently 401. Not a fail, but **not yet a pass**; the milestone
  cannot claim measured recall until F1+F2 are resolved.
- Surfaced one cross-module dedup bug (F3) that will matter for Stage 4.

**Session completed:** 2026-06-16
