# Validation 010 — Source-Presence Gate (Handoff 110, Brief 009 Slice 2a)

**Tester instance** · **Date:** 2026-10-12 · **Stage:** Stage 4→5 — Data extraction (check 1: source-presence gate)
**Spec under test:** Validation Strategy AC1, AC5; Brief 009 slice 2a
**Handoff under test:** `spec/110-handoff.md` — `lib/extraction-source.ts` (new, ~205 lines) +
  `lib/extraction-source.test.ts` (new, 14 unit tests)
**Code under test:** `lib/extraction-source.ts` — `checkSourcePresence`, `spelledOutForms`
**External ground truth:**
  - AMA Manual of Style, 11th ed. §8.3 (range dash) and §18.5 (number formatting in manuscripts)
  - Merriam-Webster Dictionary and AP Stylebook (English number-spelling conventions)
  - Published ketamine/TRD trial statistics (truth set, Field Report §2; same papers as validation 009)
  - ASCII vs Unicode punctuation standards (Unicode Standard §6.2, "General Punctuation")
**Prior validation:** `spec/validation/009-validation.md` (checks 3 & 4; this report adds check 1)

> Tester scope reminder: this report measures what the code does against external truth
> and reports it with numbers. It does **not** edit code or wiki. Fixes are for the dev;
> wiki reconciliation is for the librarian.

---

## 1. What was tested

Handoff 110 ships the source-presence gate — check 1 of the brief 009 4-check extraction gate.
Unlike checks 3 & 4 (pure statistical formulas), this gate operates on the text layer of a
resolved PDF and asks: does this number actually appear in this text, on this page?

The two shipped exports:
- `checkSourcePresence(value, pages, citedPage?)` — the main gate
- `spelledOutForms(value)` — helper that generates English word-forms for 0–999

Brief 009 acceptance criteria in scope:

| AC | Criterion | Scope for slice 2a |
|----|-----------|-------------------|
| AC1 | A fabricated number is NEVER `verified` → returns `not_in_source`; unit-proven | **In scope** — the gate mechanism is here |
| AC5 | Run against ≥3 ketamine/TRD truth-set trials; false-`verified` rate = 0 | **Partial** — source-presence check only; full `verified` status assignment is in deferred orchestrator |
| AC6 | Gates green | Confirmed by handoff 110 (14/14 pass, build/lint clean) |

AC2 (Ch 6 formulas) verified in validation 009. AC3/AC4 (provenance shape / two-pass) depend on deferred slice 2b.

---

## 2. Truth sets and provenance

### 2.1 Number formatting conventions (AMA Manual of Style)

AMA Manual of Style §18.5 (Numbers in manuscripts) establishes the journal formatting norms the gate must tolerate:
- **Comma-grouped thousands**: 1,234 for one thousand two hundred thirty-four
- **Decimal points**: period (US) or middle dot (UK/European journals, e.g., 3·92)
- **Negative values**: Unicode minus (U+2212) preferred in typeset text; ASCII hyphen in author manuscripts
- **Range dashes**: AMA §8.3 specifies **en-dash** (U+2013) for numeric ranges (e.g., "2–4")

The gate is designed around these conventions. The ASCII-hyphen-as-range-separator is a
known deviation from AMA style, documented as a limitation in handoff 110.

### 2.2 English number-spelling conventions

Per Merriam-Webster Dictionary and AP Stylebook:
- Integers 0–19: single-word forms (zero, one, … nineteen)
- Tens 20–90: single-word forms (twenty, thirty, … ninety)
- Compound tens (21–99): hyphenated (twenty-one) or spaced (twenty one) — both in use
- Hundreds: "[ones] hundred" with optional "and" before remainder (British English)
- British "and": standard in UK/Commonwealth usage (one hundred and twenty-three vs. one hundred twenty-three)

### 2.3 Ketamine/TRD truth-set papers (AC5 sub-validation)

The same three papers used in validation 009 (§2.3), with specific statistics verified from
published sources:

| Paper | PMID | Statistics used |
|-------|------|-----------------|
| Murrough JW et al. 2013 | 23832287 | MADRS: n=47, mean=14.33, SD=12.26, diff=−13.81 |
| Zarate CA Jr et al. 2006 | 16894061 | MADRS: 17.0 (SD 9.3) post-infusion; response rate 71% |
| Berman RM et al. 2000 | 11110514 | HDRS: 12.0 (SD 6.4) at 80 min; n=7 ("Seven") |

Representative text snippets for each paper were constructed following AMA formatting
conventions and checked against published figures. These are not verbatim OCR transcripts —
they are test fixtures that faithfully represent the statistical content as it would appear in
a journal PDF's text layer.

---

## 3. Verification methods

1. **Confirm unit tests pass**: run `npx vitest run lib/extraction-source.test.ts`
2. **Harness (37 additional tests)** in `spec/validation/010-harness.test.ts` covering:
   - E1: Number tokenizer edge cases (zero, p-values, large comma-grouped integers, embedded-number boundaries)
   - E2: ASCII-hyphen range-separator limitation — empirically verify the limitation exists and en/em-dash ranges work correctly
   - E3: `spelledOutForms` completeness for English conventions (0, 19, 20, 21, 100, 101, 200, 999; case-insensitive matching)
   - E4: AC5 sub-validation — 15 tests across three truth-set trial text snippets
3. **Confirm full-suite regression**: run `npx vitest run` and confirm pre-existing 12-failure baseline is unchanged

---

## 4. Results

### 4.1 Unit test suite (shipped with handoff)

```
npx vitest run lib/extraction-source.test.ts
  ✓ lib/extraction-source.test.ts (14 tests) 5ms
  Test Files: 1 passed
  Tests:      14 passed
```

**14/14 PASS.** Covers the fabrication/AC1 case, embedded-number non-match, present-on-cited-page,
present-with-no-cited-page, wrong_page mis-citation, four formatting variants (comma / middle-dot /
Unicode minus / percent), three spelled-out cases, `spelledOutForms` coverage and out-of-range cases.

---

### 4.2 Number tokenizer edge cases (E1)

| Test | Value | Text | Expected | Got |
|------|-------|------|----------|-----|
| Zero in text | 0 | "The score was 0 at discharge." | ok=true | ✅ ok=true |
| Zero NOT in "10" or "100" | 0 | "n=10 at week 100" | not_in_source | ✅ not_in_source |
| p-value 0.042 | 0.042 | "p = 0.042 (two-tailed)" | ok=true | ✅ ok=true |
| Unicode-minus negative −14.3 | −14.3 | "Mean change: −14.3 points" | ok=true | ✅ ok=true |
| Large comma-grouped 12,345 | 12345 | "12,345 records were identified" | ok=true | ✅ ok=true |
| 1234 NOT in 12340 | 1234 | "n = 12340 screened" | not_in_source | ✅ not_in_source |
| Middle-dot decimal (no cited page) | 3.92 | "odds ratio 3·92 (95% CI)" | ok=true | ✅ ok=true |
| Trailing percent | 68 | "Response rate: 68% at week 1" | ok=true | ✅ ok=true |

**All 8 edge cases pass.** The zero case is notable: `0` is a legitimate instrument score
(MADRS floor, PHQ-9 floor) that must be findable. The tokenizer correctly returns `[0]` for
standalone "0" in text. The "zero NOT in 10/100" case confirms the embedded-number protection
extends to zero — "10" tokenizes as 10, "100" tokenizes as 100; standalone 0 is absent.

---

### 4.3 ASCII-hyphen range-separator limitation (E2)

This is the known limitation documented in handoff 110 §"Known limitation". The tester's job
is to verify empirically that the limitation exists as described and that the en-dash/em-dash
cases work correctly.

| Case | Text | Looking for | Expected | Got |
|------|------|-------------|----------|-----|
| ASCII hyphen in "2-4" | "Scores ranged from 2-4 on the CGI." | 4 | NOT found (limitation) | ✅ not_in_source |
| En-dash in "2–4" (U+2013) | "Scores ranged from 2–4 on the CGI." | 4 | found | ✅ ok=true |
| Em-dash in "1—7" (U+2014) | "CGI scores: 1—7 (full range)." | 7 | found | ✅ ok=true |

**Limitation confirmed empirically.** The ASCII-hyphen case ("2-4") causes "4" to be
tokenized as "-4" (via the leading `-?` in the regex), so standalone `4` is not found.
AMA §8.3 specifies en-dash for numeric ranges; modern journals follow this convention.
The limitation is therefore realistic only for:
- Legacy papers or informal manuscripts using ASCII hyphen instead of en-dash
- OCR that substitutes ASCII hyphen for a typeset en-dash

**Severity assessment:** Low. When the limitation fires, the gate conservatively returns
`not_in_source` (it does not falsely pass — it might falsely fail for a correctly-cited value
in ASCII-hyphen text). The false-`verified` rate is unaffected: no fabricated value can pass
through this. A false-`not_in_source` on a real value is a false flag for human review, not a
silent error. The field report (§4.1) notes that the model-pass slice (deferred check 2)
can disambiguate range dashes with context.

---

### 4.4 `spelledOutForms` coverage and English conventions (E3)

External reference: Merriam-Webster Dictionary entries for all tested number-words; AP Stylebook
§Numbers (both hyphenated and spaced variants are cited as acceptable).

| Value | Expected forms (representative) | Verified |
|-------|----------------------------------|---------|
| 0 | ["zero"] | ✅ contains "zero" |
| 19 | ["nineteen"] | ✅ |
| 20 | ["twenty"] | ✅ (single form, no units) |
| 21 | ["twenty-one", "twenty one"] | ✅ both present |
| 100 | ["one hundred"] | ✅ exactly ["one hundred"] |
| 101 | includes "one hundred and one" and "one hundred one" | ✅ both present |
| 200 | ["two hundred"] | ✅ exactly ["two hundred"] |
| 999 | includes "nine hundred ninety-nine" and "nine hundred and ninety-nine" | ✅ |
| 1000 | [] | ✅ empty (out of range) |
| −5 | [] | ✅ empty |
| 2.5 | [] | ✅ empty |
| 0.1 | [] | ✅ empty |

Case-insensitive matching (gate lowercases the haystack):
- "Twenty-Two patients" → `spelled_out` for value 22 ✅
- "FORTY-TWO participants" → `spelled_out` for value 42 ✅

**All 13 cases pass.** British "and" form is correctly generated for values with a non-zero
remainder after a hundred (101, 123, 999) and correctly absent for exact hundreds (100, 200).
Hyphenated and spaced compound variants (twenty-one / twenty one) both present as required by
the gate's design (different publications use different styles).

---

### 4.5 AC5 sub-validation — ketamine/TRD truth-set texts (E4)

Representative text snippets constructed from published trial statistics (see §2.3). Full table:

**Murrough 2013 (PMID 23832287):**

| Test | Value | Expected | Got |
|------|-------|----------|-----|
| Mean MADRS 14.33 on page 3 (cited correctly) | 14.33 | ok=true | ✅ |
| SD 12.26 on page 3 | 12.26 | ok=true | ✅ |
| Fabricated SD 11.99 (not in text) | 11.99 | not_in_source | ✅ |
| Mis-cited SD 12.09 (page 3, cited to page 2) | 12.09 | wrong_page | ✅ |
| Unicode-minus diff −13.81 | −13.81 | ok=true | ✅ |

**Zarate 2006 (PMID 16894061):**

| Test | Value | Expected | Got |
|------|-------|----------|-----|
| MADRS 17 (text has "17.0") | 17 | ok=true | ✅ |
| Response rate 71 (trailing percent) | 71 | ok=true | ✅ |
| Fabricated SD 8.9 (text has 9.3) | 8.9 | not_in_source | ✅ |

**Berman 2000 (PMID 11110514):**

| Test | Value | Expected | Got |
|------|-------|----------|-----|
| n=7 ("Seven" in text; digit 7 only in decimals) | 7 | spelled_out | ✅ |
| HDRS 12.0 | 12.0 | ok=true | ✅ |
| p-value 0.003 | 0.003 | ok=true | ✅ |
| Fabricated CI endpoint −20.0 (text has −21.0) | −20.0 | not_in_source | ✅ |

**AC1 composite (3 plausible-but-absent fabrications across all three trials):**

| Value | Trial | Code |
|-------|-------|------|
| 11.5 | Murrough 2013 | not_in_source ✅ |
| 13.0 | Zarate 2006 | not_in_source ✅ |
| 0.025 | Berman 2000 | not_in_source ✅ |

**All 15 E4 tests pass. Zero fabricated values passed the gate. False-`verified` rate via
source-presence check = 0/3 fabrications = 0%** (within this test set).

The Berman 2000 `n=7` case is worth noting: "7" in "Seven patients" is correctly identified as
`spelled_out`, not fabricated. The gate correctly distinguishes the case where an integer appears
only in decimal context (7.4, −7.0) from a standalone integer. This is a correct behavior —
flagging for a human reviewer is the right conservative response; calling it fabricated would be wrong.

---

### 4.6 Full-suite regression check

```
npx vitest run
  Test Files: 9 failed | 37 passed (46)
  Tests:      12 failed | 943 passed (955)
```

Baseline per handoff 110: 906 pass / 12 fail / 918 total.
After validation 010 harness (+37 tests): **943 pass / 12 fail / 955 total** = +37 passing tests.

The 12 failures are the same pre-existing modules recorded in handoffs 109 and 110
(`boolean-search-builder`, `cache-freshness`, `cache-topic-search`, `keyboard-shortcuts`,
`protocol-storage`, `study-design`, `use-persistent-*` hooks). **Zero new failures.**

---

## 5. Findings

| # | Severity | Finding |
|---|----------|---------|
| F1 | **Confirmed Correct — AC1 mechanism** | The source-presence gate reliably returns `not_in_source` for values absent from the text layer. Tested across 14 unit tests + 37 harness probes including 6 explicit fabrication cases across 3 published trial simulations. **False-`verified` rate from source-presence check = 0%** within this test set. The claim "a fabricated number can never be `verified`" is mechanically sound; enforcement of the `verified` status label is still deferred to the orchestrator (slice 2b). |
| F2 | **Confirmed — ASCII-hyphen range limitation exists as documented** | The limitation claimed in handoff 110 is real and empirically verified (E2). Value `4` is NOT found in "2-4" (ASCII hyphen) because it tokenizes as `-4`. Value `4` IS found in "2–4" (en-dash) and "1—7" (em-dash). AMA §8.3 specifies en-dash for numeric ranges; the limitation is expected to affect only legacy manuscripts or imperfect OCR. False-`verified` rate is unaffected (the gate conservatively misses, not falsely passes). Severity: Low. |
| F3 | **Note — `n=7` in spelled-out context returns `spelled_out`, not `ok`** | In the Berman 2000 representative text, the value 7 appears only in decimal contexts (7.4, −7.0) and as "Seven" in the narrative. The gate correctly returns `spelled_out`. This is correct behavior per the brief (spelled-out integers must not be called fabrications). A human reviewer can confirm the value. No bug. |
| F4 | **Confirmed Correct — integer/decimal match** | `17` matches "17.0" in text (E4, Zarate 2006). The `numbersEqual` function uses a tiny absolute tolerance (`5e-10 × max(1, |a|, |b|)`) that correctly passes `17.0 == 17`. No false positives or false negatives observed. |
| F5 | **Full AC5 boundary — deferred** | The false-`verified` rate at the gate level (check 1 alone) is 0%. But full AC5 — which specifies a false-`verified` rate of 0 across the complete 4-check orchestrated gate including the `verified` status assignment — cannot be measured until the orchestrator (slice 2b) ships. This is the same deferral noted in validation 009. |

---

## 6. Claims status

| Claim | Prior status | Status after validation 010 |
|-------|-------------|------------------------------|
| AC1: fabricated number returns `not_in_source` from the gate | `claimed (handoff 110)` | **`verified (validation 010)`** — 6 explicit fabrications across 3 truth-set paper simulations all return `not_in_source`; 14 unit tests + 37 harness tests all pass |
| ASCII-hyphen range-separator limitation (handoff 110 §Known limitation) | `documented (handoff 110)` | **`verified empirically (validation 010)`** — limitation confirmed; en/em-dash ranges work correctly; false-`verified` rate unaffected |
| `spelledOutForms` covers English conventions 0–999 with British "and" variants | `claimed (handoff 110)` | **`verified (validation 010)`** — all forms checked against Merriam-Webster/AP Stylebook; case-insensitive matching confirmed |
| Number formatting tolerates comma-grouped, middle-dot, Unicode-minus, trailing-percent | `claimed (handoff 110)` | **`verified (validation 010)`** — all 4 variants tested in unit suite and edge cases; zero is also findable as a standalone token |
| AC5: false-`verified` rate = 0 across full 4-check gate | `claimed (handoff 109)` | **`partially verified (validation 010)`** — source-presence gate alone: 0/6 fabrications pass; full AC5 (4-check orchestrated gate) deferred to slice 2b |

---

## 7. Reproduction

```bash
cd /Users/dharmayudesai/blindspot

# Shipped unit tests (no network; pure deterministic logic):
npx vitest run lib/extraction-source.test.ts
# Expected: 14/14 PASS in < 200ms

# Validation harness (edge cases + AC5 sub-validation):
npx vitest run spec/validation/010-harness.test.ts
# Expected: 37/37 PASS in < 200ms

# Full regression check:
npx vitest run
# Expected: 955 total (943 pass / 12 fail); the 12 failures are pre-existing baseline

# Key harness cases for manual review:
#
# E2: ASCII-hyphen limitation
#   checkSourcePresence(4, [{page:1, text:"Scores ranged from 2-4 on the CGI."}], 1)
#   → { ok: false, code: "not_in_source" }   ← limitation confirmed
#
#   checkSourcePresence(4, [{page:1, text:"Scores ranged from 2–4 on the CGI."}], 1)
#   → { ok: true, foundOnPages: [1] }         ← en-dash works correctly
#
# E4: AC1 composite
#   checkSourcePresence(11.99, [{page:3, text:"...mean 14.33, SD 12.26..."}], 3)
#   → { ok: false, code: "not_in_source" }   ← fabricated value blocked
```

---

## 8. Verdict

| AC | Criterion | Result | Notes |
|----|-----------|--------|-------|
| AC1 | Fabricated number returns `not_in_source`; unit-proven | ✅ **VERIFIED** | 6 explicit fabrications; 14+37 tests; 0% false-pass rate |
| AC5 (source-presence) | Gate does not pass absent values | ✅ **VERIFIED** | 3 truth-set paper sims; 0 fabrications pass |
| AC5 (full false-`verified` rate) | Must be 0 across 4-check gate | 🔵 **DEFERRED** | Requires orchestrator slice 2b |
| AC6 | Gates green | ✅ **CONFIRMED** | 14/14 pass; build/lint clean per handoff 110 |
| ASCII limitation | Exists and behaves as documented | ✅ **VERIFIED** | en/em-dash cases work; ASCII-hyphen limitation is a conservative miss, not a false pass |

**Overall verdict for slice 2a:**

The source-presence gate is **correctly implemented** as the fabrication guard for the extraction
pipeline. No fabricated value passes the gate in any tested configuration. The known limitation
(ASCII-hyphen range dashes) is real, correctly documented, conservative (never produces false
passes), and expected to be rare in modern typeset journal PDFs following AMA style.

Together with validation 009 (checks 3 & 4 correct against Cochrane Ch 6), checks 1, 3, and 4
of the 4-check gate are now independently verified. Check 2 (two-pass model agreement) and the
orchestrating status-assignment layer remain the last deferred pieces before full AC5 can be
measured.

**Session completed:** 2026-10-12
