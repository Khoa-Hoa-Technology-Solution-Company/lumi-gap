# Gap Closure Protocol (GCP v1)

How to decide whether a research gap is real, in a way that a lecturer can audit and that anyone can repeat by hand without the software.

Vietnamese version: [gap-closure-protocol.vi.md](gap-closure-protocol.vi.md).
Software design and API contract: [superpowers/specs/2026-10-15-gap-closure-protocol-design.md](superpowers/specs/2026-10-15-gap-closure-protocol-design.md).
The rules are implemented in `apps/backend/src/modules/gap-closure/closure.rules.ts`; every number in this document is produced by that file and can be recomputed with a pencil or a spreadsheet.

Contents

1. [The problem](#1-the-problem)
2. [Definitions](#2-definitions)
3. [Manual procedure and worksheet](#3-manual-procedure-and-worksheet)
4. [Computing the Clopper-Pearson bound by hand](#4-computing-the-clopper-pearson-bound-by-hand)
5. [Worked examples](#5-worked-examples)
6. [Why the bound holds](#6-why-the-bound-holds)
7. [Reproducibility and the role of AI](#7-reproducibility-and-the-role-of-ai)
8. [Limitations](#8-limitations)
9. [References](#9-references)

---

## 1. The problem

"No paper found" is not the same as "research gap". A search can come back empty because nobody has studied the question, or because the answer is in a paper that our database does not hold, that our query did not reach, or whose abstract does not state the result. A tool or a student who treats every empty result as a gap will sooner or later propose a question that was settled years ago. We call that error **false novelty**.

LumiGap used to label a gap "Confirmed" when few papers in its own corpus mention two probe terms together. This is the *co-mention* rule (a count of how often two terms appear in the same paper). It is a fair way to rank candidates ("this pair looks under-explored"), but it cannot tell an unanswered question from one whose answer is missing from the corpus. In the Gap Closure Protocol, a low co-mention count is kept only as a **ranking signal**. It never decides whether a gap is open.

The team measured how bad the old rule is in its GapClose study (*Absence of Evidence Is Not a Research Gap: Certified Gap Claims under Corpus Incompleteness*, ICAI-FAI 2026 submission, under review, referred to below as "the team's paper"). The numbers below come from that paper's tables, built on GapClose-SciFact (1,109 questions with expert evidence labels):

| Finding in the team's paper | Number |
|---|---|
| Co-mention rule, false novelty on a **complete** corpus (Table II) | 0.197, i.e. about 1 answered question in 5 is called open |
| Accuracy-tuned (F1-optimal) thresholds, false novelty when the evidence is missing | up to 0.73 (BGE reranker: 0.236 on a complete corpus, 0.731 with all evidence missing) |
| Standard split-conformal calibration on a complete corpus | exceeds its 10% target once a tenth of the evidence is absent, for 10 of 12 scores |
| Certified rules (calibrated in situ or transferred), worst mean false novelty over 12 scores and all deletion rates | 0.101 and 0.100, i.e. the 10% target |
| Retrospective test, literature frozen at 2010 (Table VIII) | up to 68% of the gaps that later papers filled were certified open, and 96% of the gaps declared open were genuinely open at the cutoff |

A second illustration comes from the team's ESV-Gap case study (AMI 2026 submission, IoT intrusion detection): in a local corpus of 150 papers, five candidate gaps were found. Active search of external indexes (Semantic Scholar, OpenAlex) found counter-evidence for 4 of the 5; only 1 survived. Four "gaps" that looked unaddressed locally were not gaps at all.

The lesson is the same in both studies: a gap claim needs a **logged search outside the local corpus**, **quoted evidence** for every decision, and an **error statement**. That is what this protocol provides.

### Ranking signal (under-explored)

This subsection is about **ranking** candidate gaps. It is not the decision rule: only the closure check in section 3 can say that a gap is open. Do not quote the numbers below as evidence that a question is unanswered.

LumiGap counts the papers in its own corpus that mention both topics of a probe and compares that count with what chance would produce. Let

- `N`: active papers in the scope the counts are taken over (the corpus inside the chosen years, narrowed to the probe's own years when it gives any, the same window as `nA`, `nB`, `nAB`),
- `nA`, `nB`: papers that mention topic A, topic B (their words, or, when `GAP_PROBE_SEMANTIC_MIN_SIMILARITY > 0`, an embedding at least that close to the topic's; the gap then records the threshold),
- `nAB`: papers that mention both (the intersection),
- `k`: number of probes tested together (the gaps of one analysis or report whose probe survived grounding, i.e. both topics occur in the evidence papers).

Then

```
E = nA * nB / N          expected intersection if the two topics were independent
R = nAB / E              observed / expected (van Eck & Waltman 2009: association strength is proportional to nAB / E)
p = P(X <= nAB)          X ~ Poisson(E), i.e. p = exp(-E) * sum_{j=0..nAB} E^j / j!
```

A probe is flagged **under-explored** when all of these hold:

1. `N > 0` and `min(nA, nB) >= GAP_MIN_PARENT_PAPERS` (default 5), so each topic has enough papers to say anything;
2. `R <= GAP_UNDEREXPLORED_MAX_RATIO` (default 0.5), at most half of the expected intersection;
3. `p <= GAP_UNDEREXPLORED_ALPHA / k` (default 0.05 / k, a Bonferroni correction for testing `k` probes at once).

The ranking score stored with the gap (`evidenceConfidence`, 0 to 1) is `0.5 + 0.5 * (1 - R)` when the probe is flagged and `0.25 * max(0, 1 - R)` otherwise. If `N = 0` or `min(nA, nB) = 0` there is no signal and the score is 0. Growth of the parent topics is still shown but no longer part of the rule.

| | N | nA | nB | nAB | E | R | p | Under-explored? |
|---|---|---|---|---|---|---|---|---|
| Worked example | 20,000 | 400 | 300 | 1 | 6 | 0.167 | 0.0174 | Yes with `k = 1` (0.0174 <= 0.05). No with `k = 5` (0.0174 > 0.01). |
| False alarm | 1,000 | 20 | 15 | 0 | 0.3 | 0 | 0.7408 | No. An empty intersection is what chance predicts here. |
| Large topics | 20,000 | 5,000 | 4,000 | 200 | 1,000 | 0.2 | below 10^-100 | Yes. 200 papers is a lot, but 1,000 were expected. |

**OpenAlex veto.** When OpenAlex is reachable, LumiGap takes the same four counts there (`N` is every OpenAlex work in the same years) and runs the same test on them with the same `k`. If OpenAlex has at least `GAP_MIN_PARENT_PAPERS` papers per topic and does **not** flag the probe, the corpus signal is overruled: the gap is not marked under-explored, and the score falls back to `0.25 * max(0, 1 - R)` of the corpus `R`. A pair that is rare in a small corpus is often well studied elsewhere (see the ESV-Gap case above). Without OpenAlex counts, or for gaps saved before OpenAlex `N` was recorded, the corpus signal stands.

The first row reads "1 paper where 6 would be expected". The old rule counted only `nAB`, ignored `N`, and would have called the false-alarm row "scarce" (0 papers) and the large-topics row "common" (200 papers). Both verdicts are wrong in the sense that matters: the signal depends on how many papers chance would put in the intersection.

What the signal cannot do: it says nothing about papers that answer the question without using the probe terms, or that are absent from the corpus. That is exactly what the closure check searches for.

---

## 2. Definitions

**Question.** A gap is written as a question `q`. Break it into PICOC facets; empty facets are not checked.

| Facet | Meaning | Example |
|---|---|---|
| Population | who or what is studied | IoT edge devices |
| Intervention | what is applied | federated learning |
| Comparison | what it is compared with | centralized training |
| Outcome | what is measured | detection latency |
| Context | setting, dataset, period | smart-home networks |

**Decisions.** Every check ends in exactly one of three decisions.

| Decision | Meaning |
|---|---|
| `CLOSED` | At least one document answers the question. The gap does **not** exist. The answering sentence (the witness quote) is shown. |
| `OPEN_CERTIFIED` | No document answers it, nothing is unfinished, and the false-novelty bound `B` is at most the allowed maximum (default 0.20). The gap is plausible and the error level is stated. |
| `ABSTAIN` | The procedure cannot say. Every reason is listed. Abstaining is a normal, honest outcome, not a failure. |

**False novelty.** Calling a question open although some published work answers it. The protocol bounds the probability of this error.

**Screening labels.** Every document found is labelled against the question:

| Label | Rule |
|---|---|
| `ANSWERS` | A sentence in the title or abstract reports a result on the question, and **every stated facet matches**. |
| `PARTIAL` | The document addresses the question but at least one facet differs, or it only states the question as a limitation or future work. |
| `UNRELATED` | The document does not address the question. |

`ANSWERS` and `PARTIAL` need a **verbatim quote** from the title or abstract, at least 20 characters long after normalization (lower case, typographic quotes and dashes unified, repeated spaces collapsed, leading and trailing quote marks and dots removed).

---

## 3. Manual procedure and worksheet

Do the steps in order. Fix the settings in Step 0 **before** you look at any result, so that nobody can tune them to get a nicer answer.

### Step 0. Settings (write them down first)

| Setting | Default | Your value |
|---|---|---|
| Confidence parameter `delta` | 0.05 | |
| Maximum allowed bound `Bmax` | 0.20 | |
| Number of queries | up to 3 | |
| Results screened per query and source | 20 from the local corpus, 10 from OpenAlex | |
| Years searched (optional) | none | |
| Reviewer 1 / Reviewer 2 | | |
| Judge kind | HUMAN when you label every document yourself | |

### Step 1. Question and facets (Worksheet 1)

| Field | Content |
|---|---|
| Gap title / id | |
| Question `q` (one sentence, with the expected claim) | |
| Population | |
| Intervention | |
| Comparison | |
| Outcome | |
| Context | |

### Step 2. Logged search (Worksheet 2)

Write the queries yourself (keyword combinations from the facets and their synonyms), or let the AI propose them and review them. Run **every** query on **at least two** sources, for example the LumiGap corpus and OpenAlex (or Scopus, Google Scholar, a domain database). Log every query, including the ones that fail. A query that errors, times out or was skipped counts as "search error" and prevents `OPEN_CERTIFIED`.

| # | Source | Exact query text | Date and time | Results screened | Error (none / message) |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

Remove duplicates across queries (same DOI or same title) and keep the first occurrence.

### Step 3. Screening (Worksheet 3)

For every document, read the title and abstract, and label it with the rubric of section 2. For `ANSWERS` and `PARTIAL`, copy the quote **exactly** and check it with the "find" function of your PDF or browser; if it is not found verbatim, it is not a valid quote.

| # | Doc (title, DOI, year) | Found by query # | Label | Verbatim quote (>= 20 chars) | Facets: P / I / C / O / Ctx (match, differ, not mentioned) | Limitation or future-work statement? (Y/N) | Second reviewer label |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |

Rules for the labels:

- Label `ANSWERS` only when the sentence reports a result about the same relationship **and no stated facet contradicts it**. Different population, different outcome or different method means `PARTIAL`.
- A paper that says "future work should study q" is `PARTIAL` with the limitation flag set. It supports the gap's significance but never answers it.
- Every document needs a label. A document you could not judge (unreadable, no abstract and no way to get the text) counts as "pending", and pending documents make the check `ABSTAIN`.
- Label by yourself first. A second reviewer then labels the same documents independently (the optional but recommended last column), see section 7.

### Step 4. Coverage check (Worksheet 4)

Coverage tells you how likely it is that an answering paper is simply not in the sources you searched.

1. Get `m` reference DOIs of papers on the same topic from a source that is **independent of your search**: the reference list of a recent survey or systematic review, or a list from a domain expert. Use at least 50 if you can. Do not take them from the search results of Step 2.
2. For each DOI, check whether the paper can be found in the sources you searched in Step 2 (look it up by DOI). A DOI that is found in none of them is "missing".
3. Let `x` be the number of missing DOIs, `pHat = ClopperPearsonUpper(x, m, delta)` (section 4).

| Reference source (name, DOI, date) | |
|---|---|

| # | Reference DOI | Found in source A? | Found in source B? | Missing (found in none)? |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| ... | | | | |

| Quantity | Value |
|---|---|
| `m` (reference DOIs) | |
| `x` (missing) | |
| `pHat` (section 4, upper bound at confidence 1 - delta) | |

### Step 5. Calibration (Worksheet 5)

Calibration tells you how often **your own procedure** fails to find an answer that exists.

Build **at least 30** questions that are known to be answered, in the same field and in the same style as the gap you are checking. Two admissible sources:

- **Expert REJECT decisions with counter-evidence.** A gap that an expert rejected because a published paper already answers it gives a question and a witness DOI.
- **Findings of a survey or systematic review.** A statement such as "X improves Y in population Z, see [12]" gives the question "Does X improve Y in Z?" and the cited paper as the witness DOI.

Rules for building the set, to keep the estimate honest:

1. Write the questions and the witness DOIs from the survey or the expert note, **without using the LumiGap search** (or whichever tool you screen with). If the witness was found with the same search, the test would be circular and `epsHat` would be too small.
2. Phrase each question the way a real gap would be phrased. Do not copy the witness paper's title.
3. Write the queries for each calibration question **before** you look at the witness paper.
4. Use the same procedure as for the real gap: same number of queries, same sources, same number of results screened, same rubric, and the **same judge kind** (human labels with human labels, AI labels with AI labels).

For each question, run Steps 2 and 3. The question is **FOUND** if some document is labelled `ANSWERS` (with a valid quote), and **MISSED** if no document is, after every document was labelled and no query failed. A question with a failed query or an unlabelled document is "pending" and cannot be counted until it is completed.

| # | Question | Witness DOI | Where the label comes from (expert note / survey + reference) | Result (FOUND / MISSED) | Quote that closed it |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| ... | | | | | |
| 30 | | | | | |

| Quantity | Value |
|---|---|
| `n` (questions) | |
| `misses` (MISSED) | |
| `epsHat = ClopperPearsonUpper(misses, n, delta)` | |

Note: a question counts as MISSED also when its witness is not in the searched sources at all. That is deliberate (see section 6).

### Step 6. Decision (Worksheet 6)

Apply the rules in this order and stop at the first that fires.

1. **Is there a document with effective label `ANSWERS`?** Then the decision is `CLOSED`. Write the witness document and its quote. (If several, prefer one that a person confirmed.) Nothing else is needed: the quote is the proof.
2. Otherwise check each condition. Every one that applies is an ABSTAIN reason:

| Reason code | Applies when | Applies? |
|---|---|---|
| `SEARCH_ERRORS` | at least one query failed, timed out or was skipped | |
| `PENDING_REVIEW` | at least one document has no effective label (including an AI `ANSWERS` or `PARTIAL` whose quote was not found verbatim) | |
| `NO_COVERAGE` | you have no coverage check (Step 4) | |
| `NO_CALIBRATION` | you have no computed calibration (Step 5) | |
| `CALIBRATION_JUDGE_MISMATCH` | the calibration was run with a different judge kind than this check (see below) | |
| `BOUND_EXCEEDS_MAX` | `B = epsHat + pHat` is larger than `Bmax` | |

3. If none applies, the decision is `OPEN_CERTIFIED`. If at least one applies, it is `ABSTAIN`, and the list of reasons is part of the result.

Compute `B = epsHat + pHat`, rounded to 4 decimals (cap at 1). Because both parts are already rounded up to 4 decimals, add them as printed.

**Judge kind.** The check is `HUMAN` only if a person labelled **every** document; otherwise it is `AI`. A check in which nothing was screened (no documents at all) counts as `AI`, because only the queries decided; by hand, treat an empty search as a warning that the queries are too narrow and rewrite them. The calibration must have the same judge kind as the check.

| Item | Value |
|---|---|
| Decision | CLOSED / OPEN_CERTIFIED / ABSTAIN |
| Witness document and quote (if CLOSED) | |
| `epsHat` + `pHat` = `B` | |
| `B <= Bmax`? | |
| Reasons (if ABSTAIN) | |
| Corroborated? (a `PARTIAL` document with the limitation flag, from a paper the gap was **not** derived from) | |
| Decided by, date | |

Corroboration is reported because it shows that other authors also see the question as open. It is **not** part of the bound and is not required for `OPEN_CERTIFIED`.

---

## 4. Computing the Clopper-Pearson bound by hand

`ClopperPearsonUpper(x, m, delta)` is the one-sided upper confidence bound of a rate observed as `x` events out of `m` trials (Clopper and Pearson, 1934). It is the rate `p` for which a binomial experiment with `m` trials gives `x` or fewer events with probability exactly `delta`. It is deliberately larger than `x / m`: with few observations we must allow for bad luck. Always **round up** to 4 decimals, so the displayed number is never below the exact one.

**Case x = 0 (no events).** Closed form:

```
pUpper = 1 - delta ^ (1 / m)
```

Check with a calculator: `m = 50`, `delta = 0.05`: `0.05^(1/50) = exp(ln(0.05) / 50) = exp(-0.059915) = 0.941845`, so `pUpper = 0.058155`, rounded up to **0.0582**. For `m = 30`: `0.05^(1/30) = 0.904966`, `pUpper = 0.095034`, rounded up to **0.0951**. (A rough mental rule: about `3 / m` at delta = 0.05.)

**Case x >= 1.** Use a spreadsheet. In Excel, Google Sheets or LibreOffice Calc:

```
=BETA.INV(1 - delta, x + 1, m - x)
```

For example `=BETA.INV(0.95, 4, 27)` for `x = 3`, `m = 30` gives 0.238598, rounded up to **0.2386**. (The same formula also works for `x = 0`: `=BETA.INV(0.95, 1, m)`.) In older Excel versions the function is `BETAINV`. If `x = m` the bound is 1.

**Precomputed table for delta = 0.05** (rounded up to 4 decimals; values produced by bisection on the exact binomial distribution and cross-checked against the Beta quantile above):

| m \ x | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| 20 | 0.1392 | 0.2162 | 0.2827 | 0.3437 | 0.4011 | 0.4556 |
| 30 | 0.0951 | 0.1486 | 0.1954 | 0.2386 | 0.2797 | 0.3190 |
| 50 | 0.0582 | 0.0914 | 0.1207 | 0.1479 | 0.1738 | 0.1989 |
| 100 | 0.0296 | 0.0466 | 0.0617 | 0.0758 | 0.0892 | 0.1023 |

For other `m`, `x` or `delta`, use the spreadsheet formula.

**What you can afford** (default `Bmax = 0.20`, all values from the table):

- `n = 30` calibration questions with 0 misses (`epsHat = 0.0951`) and `m = 50` coverage references with 0 missing (`pHat = 0.0582`): `B = 0.1533`, certified. One single miss in the 30 questions (`epsHat = 0.1486`) already gives `B = 0.2068`, which is too large.
- `n = 50` with up to 2 misses (`0.1207`) plus `m = 50`, `x = 0` (`0.0582`): `B = 0.1789`, certified. With 3 misses (`0.1479`): `B = 0.2061`, too large.
- Fewer than about 20 questions on either side cannot reach `Bmax = 0.20` even with no misses (`n = 20`, `m = 20`, no events: `B = 0.1392 + 0.1392 = 0.2784`).

The bound is honest about small samples: if you want to certify gaps you must invest in a larger calibration set and a larger reference list.

---

## 5. Worked examples

All questions, papers and quotes below are **invented for teaching**; they are not real citations.

### Example (a): OPEN_CERTIFIED

**Question.** "Does model compression change the recognition accuracy of Vietnamese handwritten text on mobile devices?" Facets: population = Vietnamese handwritten text; intervention = model compression; outcome = recognition accuracy; context = mobile devices.

**Settings.** `delta = 0.05`, `Bmax = 0.20`. Judge kind HUMAN.

**Search.** 3 queries, each on the LumiGap corpus (top 20) and on OpenAlex (10 results): 6 searches logged, 0 errors. After removing duplicates, 41 documents were screened by one reviewer. Result: 33 `UNRELATED`, 8 `PARTIAL` (compression studied on Latin script, or handwritten text recognition without compression). No `ANSWERS`. Every document has a label, so no pending document. Two of the `PARTIAL` documents state in their abstracts that mobile deployment "remains to be studied", flagged as limitation statements.

**Coverage.** Reference source: the reference list of a 2025 survey on handwriting recognition. `m = 50` DOIs, all of them found in the LumiGap corpus or in OpenAlex, so `x = 0`.

```
pHat = 1 - 0.05^(1/50) = 0.058155  ->  0.0582
```

**Calibration.** 30 questions with witness DOIs taken from survey findings and written without the LumiGap search; the same procedure and the same human judge. The procedure closed all 30: `n = 30`, `misses = 0`.

```
epsHat = 1 - 0.05^(1/30) = 0.095034  ->  0.0951
```

**Decision.**

```
B = epsHat + pHat = 0.0951 + 0.0582 = 0.1533
0.1533 <= 0.20
```

No search error, no pending document, coverage present, calibration present with the same judge kind, bound within the maximum: **OPEN_CERTIFIED**, `B = 0.1533`. The statement is: "if this question were answered, the procedure would have called it open with probability at most 0.1533, with confidence at least 90%" (see section 6 for the exact meaning). It is also **corroborated** (two documents flag the question as future work).

### Example (b): CLOSED with a witness quote

**Question.** "Does federated learning reduce the detection latency of intrusion detection on IoT edge devices?" Facets: population = IoT edge devices; intervention = federated learning; outcome = detection latency.

**Search.** 2 queries on the local corpus and OpenAlex, no error, 27 documents screened. Document 9 (invented, "Paper D9", 2024) has this sentence in its abstract:

> "We find that federated learning reduces detection latency by 30% on edge devices."

Screening of Paper D9:

| Check | Result |
|---|---|
| Quote found verbatim in the abstract (use "find") | yes; the quote has 81 characters, more than the minimum of 20 |
| Population: edge devices | matches |
| Intervention: federated learning | matches |
| Outcome: detection latency | matches (reduced by 30%) |
| Any facet contradicted? | no |
| Label | `ANSWERS` |

**Decision.** `CLOSED`. The witness is Paper D9 and the quote above. The gap does not exist and nobody needs coverage or calibration to say so: one verified quote is enough. (If the same quote came with a different population, for instance "on servers", the label would be `PARTIAL`, and the question would stay open.)

A sensible safeguard: let a second person confirm the quote and the facet match for every `CLOSED` decision. A false `CLOSED` costs a student a good topic.

### Example (c): ABSTAIN

Same question and sources as example (a), but with these facts:

- One OpenAlex query returned an HTTP error and was not repeated.
- Two documents have an AI label `ANSWERS` whose quote could not be found verbatim in the abstract; nobody has reviewed them yet.
- The coverage check found 3 of 30 reference DOIs missing (`m = 30`, `x = 3`): `pHat = 0.2386`.
- The calibration set has `n = 30` and 3 misses: `epsHat = 0.2386`. It was run with a human judge, but the check has two unlabelled documents, so the check counts as `AI`.

```
B = 0.2386 + 0.2386 = 0.4772  >  0.20
```

Decision: **ABSTAIN**, with the reasons

| Reason | Why |
|---|---|
| `SEARCH_ERRORS` | one query failed |
| `PENDING_REVIEW` | two documents have no effective label |
| `CALIBRATION_JUDGE_MISMATCH` | the calibration is HUMAN, the check is AI |
| `BOUND_EXCEEDS_MAX` | 0.4772 is above 0.20 |

What to do next: repeat the failed query, review the two documents (one of them may turn out to be a real `ANSWERS`, in which case the decision becomes `CLOSED`), and improve coverage or calibration. Note that even with the first three reasons fixed, `B = 0.4772` shows the sources or the procedure are too weak to certify anything on this topic.

---

## 6. Why the bound holds

In plain words. A question that *is* answered can be wrongly called open for only two reasons:

1. **Every** document that answers it is missing from the sources we searched (coverage problem).
2. An answering document is there, but our search or our screening misses it (procedure problem).

We measure the chance of the first reason with the coverage check (`pHat`), and the chance of the second with the calibration (`epsHat`). The chance that one of the two happens is at most the sum of the two chances. Each is an upper confidence bound, so the sum is an upper confidence bound as well, with slightly less confidence.

In five lines:

```
q is closed; W = answering documents (at least 1); p = chance that one document of W is absent from the searched sources
(1) false novelty  =  "declared open although closed"  =>  A or E
    A = every document of W is absent        P(A) <= p^|W| <= p
    E = some document of W is present but the procedure does not label it ANSWERS      P(E) <= eps
(2) P(false novelty) <= P(A) + P(E) <= p + eps                       (union bound)
(3) pHat >= p with probability >= 1 - delta; epsHat >= eps with probability >= 1 - delta   (Clopper-Pearson)
(4) both hold together with probability >= 1 - 2 delta  =>  P(false novelty) <= pHat + epsHat = B
```

With the default `delta = 0.05` the statement holds with confidence 90%.

**What the statement means.** `B` bounds the probability that a question which *has* an answer is wrongly called open, for questions of the kind used in the calibration. It is a statement about the procedure's long-run error on answered questions. It is **not** the probability that one particular certified gap is wrong; that depends on how many candidate questions are truly open, which the protocol does not know.

**Assumptions** (the guarantee is only as good as these):

1. **Missing at random.** Answering documents are absent from the sources independently of the question (a paper is not more likely to be absent because it answers a gap). If a whole sub-field is missing, this fails.
2. **Representative calibration.** The calibration questions are drawn from the same field, with the same style of question, as the gaps being checked; their witnesses are independent of the LumiGap (or screening tool) search; and they are independent of each other.
3. **Same judge kind and same procedure.** The calibration uses the same type of judge (human or AI) and the same query budget, sources, number of results and rubric as the gap check. The software refuses to certify otherwise (`CALIBRATION_JUDGE_MISMATCH`).
4. **Representative coverage sample.** The reference DOIs are a fair sample of the papers that could answer such questions, and are independent of the search.

**A conservative detail.** A calibration question whose witness is absent from the sources is counted as MISSED. So `epsHat` already includes part of the coverage loss, and adding `pHat` partly counts it twice. The sum therefore overstates the true error rather than understating it. We keep the sum because it is simple, easy to explain and still valid.

**Relation to the team's paper.** The GapClose theorems calibrate a *threshold* on a continuous, monotone closure score by conformal prediction (in-situ calibration, Theorem 1; transfer with an upper bound on the missing rate, Theorem 2), and their corollary gives `P(false novelty) <= alpha + delta` when the missing rate is estimated with a Clopper-Pearson bound. This protocol does not use a score or a threshold: it works with discrete labels (a rubric applied by a person or an AI), measures the procedure's miss rate directly, and combines the two bounds by a plain union bound. It is the team's **adaptation** of the same idea to discrete human or AI labels. It is related to, but **not identical** to, the theorems of the team's paper, and this simplified union-bound form has **not itself been peer-reviewed**. The team's paper is under review (ICAI-FAI 2026 submission). Present it to your lecturer as a transparent, checkable argument, not as a published theorem.

---

## 7. Reproducibility and the role of AI

**Two reviewers.** For every gap check, a second person should label the documents independently (without seeing the first label) and record only their label. The agreement between the two reviewers is measured with **Cohen's kappa**:

```
po = share of documents where both labels are equal
pe = sum over labels L of (share of reviewer 1 giving L) * (share of reviewer 2 giving L)
kappa = (po - pe) / (1 - pe)
```

Example with 4 documents, labels (reviewer 1, reviewer 2): (ANSWERS, ANSWERS), (ANSWERS, ANSWERS), (UNRELATED, UNRELATED), (UNRELATED, ANSWERS). `po = 3/4`. Reviewer 1 gives ANSWERS 2/4 and UNRELATED 2/4; reviewer 2 gives ANSWERS 3/4 and UNRELATED 1/4, so `pe = 0.5 * 0.75 + 0.5 * 0.25 = 0.5` and `kappa = (0.75 - 0.5) / (1 - 0.5) = 0.5`. A kappa of 1 is perfect agreement and 0 is agreement no better than chance. Report it with the number of documents; with fewer than 2 pairs it is not defined. When the two reviewers disagree on an `ANSWERS`, discuss the quote and the facets and agree on one label before deciding; low kappa means the question or the facets need to be written more precisely.

**The dossier.** Every check produces a dossier that contains everything needed to redo the decision by hand:

- protocol version, question, facets, years, `delta` and `Bmax`;
- the full query log (source, query text, time, result count, error);
- every document with its AI label and quote, the reviewer's label, quote and facets, the second reviewer's label, and the limitation flag;
- the coverage check (reference source, every DOI with found or missing) and the calibration (every question, witness DOI and FOUND or MISSED);
- `epsHat`, `pHat`, `B`, the decision, the witness quote or the list of abstain reasons, the corroboration flag and Cohen's kappa;
- the arithmetic in plain lines, for example `B = 0.0951 + 0.0582 = 0.1533 <= 0.2`.

**How AI is used.** The AI does two things only: it **proposes search queries** (at most three, which a person can replace or edit) and it **pre-labels** every document with the rubric, quoting a sentence. The software then checks that each AI quote really appears verbatim in the title or abstract; an AI `ANSWERS` or `PARTIAL` whose quote cannot be found is not counted until a person reviews it. A person's label always overrides the AI label. The AI never computes `epsHat`, `pHat` or `B`, and never makes the decision: those come from the deterministic rules and the person who presses "decide" (the gap creator or the project owner). Because the AI is optional, everything in this document can be done without it.

---

## 8. Limitations

State these when you present the method.

1. **Small corpus, many abstentions.** With a small calibration set or reference list the bound is large (section 4) and the honest result is `ABSTAIN`. Expect many abstentions on narrow topics.
2. **Abstracts may not contain the answer.** The screening uses title and abstract. A paper whose result is only in the full text will look `UNRELATED` or `PARTIAL`. This is not hidden: such failures show up as MISSED calibration questions and raise `epsHat`.
3. **Owner bias.** If the person who proposed the gap also screens the documents, they may want to see the gap survive. Use a second reviewer who did not propose it, record kappa, and let someone else confirm every `CLOSED` and every `OPEN_CERTIFIED`.
4. **Calibration domain mismatch.** If the calibration questions come from another field, another decade or another style of question, `epsHat` does not describe the gap at hand. The team's paper also warns that calibration questions should come from the same field and the same type of question as the candidates (its hold-out experiment gave somewhat higher false novelty than the resampled ones, though sampling noise could not be excluded).
5. **Coverage sample bias.** A survey's reference list reflects what the survey authors chose to cite and may over-represent well-known papers.
6. **Corroboration is not in the bound.** `PARTIAL` documents and limitation statements only add significance. A gap can be `OPEN_CERTIFIED` without corroboration, and corroboration does not make a gap more "certain".
7. **Gap type is a separate, qualitative step.** Classifying a gap (for example contradictory evidence, methodological, population, theoretical; see the frameworks of Robinson et al. and Müller-Bloch and Kranz) is a human judgement made after the gap is certified. The bound says nothing about it.
8. **Scope of the claim.** The bound concerns answered questions called open. It does not certify that a question is worth researching, feasible, or novel against sources that were not searched (paywalled full text, grey literature, other languages).
9. **Not peer-reviewed.** The union-bound form (section 6) and the team's paper are under review. Evidence from the paper (section 1) comes from benchmark and retrospective experiments on SciFact and Climate-FEVER, not from LumiGap users.

---

## 9. References

1. Snilstveit B, Vojtkova M, Bhavsar A, Stevenson J, Gaarder M (2016). Evidence & Gap Maps: A tool for promoting evidence informed policy and strategic research agendas. *Journal of Clinical Epidemiology* 79:120-129. doi:10.1016/j.jclinepi.2016.05.015
2. Robinson KA, Saldanha IJ, McKoy NA (2011). Development of a framework to identify research gaps from systematic reviews. *Journal of Clinical Epidemiology* 64(12):1325-1330. doi:10.1016/j.jclinepi.2011.06.009
3. Müller-Bloch C, Kranz J (2015). A Framework for Rigorously Identifying Research Gaps in Qualitative Literature Reviews. *ICIS 2015 Proceedings*.
4. Sandberg J, Alvesson M (2011). Ways of constructing research questions: gap-spotting or problematization? *Organization* 18(1):23-44. doi:10.1177/1350508410372151
5. Swanson DR (1986). Fish oil, Raynaud's syndrome, and undiscovered public knowledge. *Perspectives in Biology and Medicine* 30(1):7-18.
6. van Eck NJ, Waltman L (2009). How to normalize co-occurrence data? An analysis of some well-known similarity measures. *Journal of the American Society for Information Science and Technology* 60(8):1635-1651. doi:10.1002/asi.21075
7. Clopper CJ, Pearson ES (1934). The use of confidence or fiducial limits illustrated in the case of the binomial. *Biometrika* 26(4):404-413.
8. Cohen J (1960). A coefficient of agreement for nominal scales. *Educational and Psychological Measurement* 20(1):37-46.
9. Le AH, Phan LVK, Nguyen DT, Nguyen DH, Ho DA, Truong L. *Absence of Evidence Is Not a Research Gap: Certified Gap Claims under Corpus Incompleteness* (the GapClose manuscript). ICAI-FAI 2026 submission, under review. Code and theory notes: `ESV-Gap/gapclose` in the team's research repository.
10. ESV-Gap: *An Auditable Autonomous Scientific Reasoning Framework for Evidence-Grounded Hypothesis Triage (A Case Study in IoT Cybersecurity)*. AMI 2026 submission.
