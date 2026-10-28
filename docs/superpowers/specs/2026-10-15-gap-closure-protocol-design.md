# Gap Closure Protocol (GCP v1) — design and implementation contract

Status: in implementation (2026-10-15). Branch `tori-22-verify-gap-fomular-for-manual-define-gap`.
Method for people: [docs/gap-closure-protocol.md](../../gap-closure-protocol.md) (written in wave 1).

## 1. Why

LumiGap labels a gap "Confirmed" when few corpus papers match two probe terms together. That is the
*CoMention* rule, which the team's GapClose study (ICAI-FAI 2026 submission, `D:\Workspace\research-paper-gap\ESV-Gap\gapclose`)
shows calls 19.7% of already-answered questions open on a complete corpus and much more on an incomplete one.
A low count is kept only as a ranking signal ("under-explored"). Whether a gap is open is decided by this protocol.

## 2. Method (every step can be done by a person; AI only speeds it up)

A gap is a **question** `q` with PICOC facets (population, intervention, comparison, outcome, context).

1. **Logged search.** Queries (hand-written, or proposed by the AI, max `GAP_CLOSURE_MAX_QUERIES`) run on the
   LumiGap corpus (`retrieve()`, top `GAP_CLOSURE_LOCAL_TOP_K`) and on OpenAlex (`searchOpenAlexWorksForClosure`,
   `GAP_CLOSURE_OPENALEX_PER_QUERY` per query). Each query is logged with source, time, result count and error.
2. **Screening rubric** for every document found: `ANSWERS` (a sentence reports a result on `q` and every stated
   facet matches), `PARTIAL` (a facet differs, or the paper only states it as a limitation / future work),
   `UNRELATED`. ANSWERS and PARTIAL need a quote that appears verbatim in title + abstract (`quoteAppearsIn`).
   The AI labels first; an AI ANSWERS/PARTIAL with an unverified quote waits for a person (`effectiveLabel`).
3. **Coverage `pHat`.** m reference DOIs from an independent source (a survey's reference list, an expert list);
   x of them are found neither in LumiGap nor in OpenAlex. `pHat = clopperPearsonUpper(x, m, delta)`.
4. **Calibration `epsHat`.** n questions known to be answered (witness DOI from an expert REJECT with counter
   evidence, or from a survey) run through steps 1–2 with the same judge kind. A question is MISSED when the
   procedure does not close it. `epsHat = clopperPearsonUpper(misses, n, delta)`.
5. **Decision** (`decideClosure`): CLOSED if any document effectively ANSWERS (witness quote shown);
   OPEN_CERTIFIED if no ANSWERS, no failed query, no pending document, a calibration of the same judge kind exists
   and `B <= GAP_MAX_FALSE_NOVELTY`, where `B = epsHat` for an IN_SITU calibration and `B = epsHat + pHat` (coverage
   required) for a TRANSFER one; ABSTAIN otherwise with every reason. The check stores the formula as `boundMode`.
   Corroboration (a PARTIAL limitation statement from another paper) is reported, not required.

Guarantee: a closed question is called open only if all its answering documents are missing (≤ p) or the
procedure misses one that is present (≤ eps). Union bound: P(false novelty) ≤ eps + p; with both upper bounds
at confidence 1 − delta, B holds with probability ≥ 1 − 2·delta. Assumptions: answering documents are missing
independently of the question (MCAR), and calibration questions are representative of real gap questions.

## 3. Foundation (done, do not edit — report needed changes instead)

| File | Content |
|---|---|
| `apps/backend/prisma/research.prisma` | `ResearchGap.closureStatus/questionFacets/latestClosureCheckId`; models `GapClosureCheck`, `GapClosureDocument`, `CoverageCheck`, `CoverageCheckItem`, `ClosureCalibration`, `CalibrationQuestion` |
| `apps/backend/prisma/migrations/20261015120000_gap_closure_protocol/migration.sql` | hand-written SQL incl. CHECK constraints and FKs |
| `apps/backend/src/modules/gap-closure/closure.rules.ts` (+ tests) | `GAP_CLOSURE_PROTOCOL_VERSION`, `GAP_CLOSURE_JOB`, `GapClosureJob`, `clopperPearsonUpper`, `falseNoveltyBound`, `quoteAppearsIn`, `normalizeDoi`, `effectiveLabel`, `judgeKindOf`, `decideClosure`, `calibrationOutcome`, `cohenKappa`, `describeBoundArithmetic` |
| `packages/shared-types/src/gap-closure.ts` | every view / request type of this contract; `ResearchGapItem.closureStatus/questionFacets/latestClosureCheck`; `CreateGapCandidateRequest.questionFacets` |
| `apps/backend/src/config/env.ts` | `GAP_MAX_FALSE_NOVELTY` (0.2), `GAP_CLOSURE_DELTA` (0.05), `GAP_CLOSURE_LOCAL_TOP_K` (20), `GAP_CLOSURE_OPENALEX_PER_QUERY` (10), `GAP_CLOSURE_MAX_QUERIES` (3) |
| credits | action `gap_closure_check` = 10 (`credit-policy.ts`, shared `credit.ts`) |
| `openalex.client.ts` | `searchOpenAlexWorksForClosure`, `fetchOpenAlexWorksByDois` (≤ 50 per call) |

Column semantics: `gap_closure_checks.status` QUEUED → SEARCHING → SCREENING → DECIDED (or FAILED);
`queries` is `ClosureQueryLog[]`; `decision_reasons` is `ClosureAbstainReason[]`;
`gap_closure_documents.dedupe_key` = paper id, else `openalex:<W id>`, else `doi:<doi>`.

## 4. Job contract (runner ↔ API)

The API creates the `gap_closure_checks` row (status QUEUED, `question`, `facets`, years, `queries: []`).
`queries` only ever holds executed queries (`ClosureQueryLog[]`), so hand-written queries travel in the job:

```ts
gapsQueue.add(GAP_CLOSURE_JOB, { checkId, queries } satisfies GapClosureJob, { jobId: checkId })
```

The runner (`runGapClosureCheck(job)` in `closure.runner.ts`):
1. claims the row atomically (QUEUED/SEARCHING → SEARCHING), skips otherwise;
2. uses the given queries or asks the LLM for up to `GAP_CLOSURE_MAX_QUERIES` (cached, `promptVersion`);
3. for each query runs LOCAL and OPENALEX searches, logs every query (an error is logged, never thrown away);
4. dedupes documents per check, stores them (title, abstract snapshot, year, DOI, OpenAlex id, paper id when the
   work is in `papers` by DOI or OpenAlex id);
5. AI-screens every document (rubric above, cached `cachedGenerateJSON`, batched), sets `aiQuoteVerified` with
   `quoteAppearsIn(aiQuote, title + "\n" + abstract)`;
6. sets status SCREENING. It never decides. On final failure: status FAILED, `error_message`, refund
   `credit_transaction_id` once (`creditService.refundCreditsOnce`).
The worker wraps the run in `withUserAi(check.createdById, ...)`.

## 5. HTTP contract (all `requireAuth`, envelope `{ success, data, meta? }`, mounted at `/api/v1/gap-closure`)

| Method + path | Body / query | Returns | Who |
|---|---|---|---|
| `POST /gaps/:gapId/checks` | `StartGapClosureCheckRequest` | 202 `GapClosureCheckView` (status QUEUED, no documents) | can access the gap (creator, project owner, ACTIVE member). 400 when neither body nor gap has a question. Charges `gap_closure_check`, refunds if enqueue fails. Also stores `questionFacets` on the gap when given |
| `GET /gaps/:gapId/checks` | — | `GapClosureCheckView[]` newest first, `documents: []` | can access the gap |
| `GET /checks/:checkId` | — | `GapClosureCheckView` with documents (each with `effectiveLabel`) | GAP target: can access the gap; CALIBRATION_QUESTION target: calibration creator or `GAP_VALIDATION` capability |
| `PATCH /checks/:checkId/documents/:docId` | `ReviewClosureDocumentRequest` | `GapClosureDocumentView` | same as GET. ANSWERS/PARTIAL need a verbatim quote (400 otherwise). Second reviewer must differ from the first. A deciding label on a DECIDED check moves it back to SCREENING, clears the decision and sets the gap's `closure_status` to NOT_CHECKED |
| `POST /checks/:checkId/decide` | `DecideGapClosureRequest` | `GapClosureCheckView` | GAP target only; gap creator or project owner. 409 unless status SCREENING or DECIDED. Picks the latest coverage check of the gap's normalized topic and the latest COMPUTED calibration with the check's judge kind unless ids are given. Persists every decision field, sets `research_gaps.closure_status` and `latest_closure_check_id`; on CLOSED with a corpus witness, upserts a `GapEvidenceRecord` (COUNTER, evidenceType `CLOSURE_WITNESS`, excerpt = quote) |
| `GET /checks/:checkId/dossier?format=json\|markdown` | — | `GapClosureDossier`, or `{ filename, markdown }` | same as GET |
| `POST /coverage-checks` | `CreateCoverageCheckRequest` (≤ 200 DOIs) | 201 `CoverageCheckView` | any user; projectId requires membership. DOIs normalized with `normalizeDoi` (invalid → 400 listing them). Local lookup by `papers.doi`, OpenAlex by `fetchOpenAlexWorksByDois` in batches of 50; any OpenAlex failure → 503 and nothing stored |
| `GET /coverage-checks?topic=&projectId=` | — | `CoverageCheckView[]` newest first (items included) | own checks and checks of projects the user belongs to |
| `POST /calibrations` | `CreateClosureCalibrationRequest` | 201 `ClosureCalibrationView` | `GAP_VALIDATION` capability or admin |
| `GET /calibrations` / `GET /calibrations/:id` | — | list / one with `questions` | any authenticated user (read-only, no personal data) |
| `POST /calibrations/:id/questions` | `CreateCalibrationQuestionRequest` | 201 `CalibrationQuestionView` | calibration creator; only while DRAFT or RUNNING |
| `DELETE /calibrations/:id/questions/:questionId` | — | 204-style envelope `{ success: true, data: null }` | calibration creator; question PENDING only |
| `POST /calibrations/:id/run` | — | `ClosureCalibrationView` | creator. Creates one check (target CALIBRATION_QUESTION) per PENDING question without a check, enqueues it, status RUNNING. Charges no credits (platform calibration) |
| `POST /calibrations/:id/compute` | — | `ClosureCalibrationView` | creator. For each question: `calibrationOutcome(docs, failedQueries)`; 409 with the pending count if any is PENDING; else n, misses, `epsHat`, status COMPUTED |

Rate limit: `createRateLimiter("gap-closure-start", ...)` on starting checks and coverage checks.
Gap list (`GET /api/v1/gaps`) items gain `closureStatus`, `questionFacets`, `latestClosureCheck`.
`POST /api/v1/gaps/candidates` accepts optional `questionFacets` (Zod: each facet ≤ 300 chars).

## 6. Wave 1 ownership (parallel agents, same working tree, disjoint files)

| Agent | Owns |
|---|---|
| **runner** | `modules/gap-closure/closure.runner.ts`, `closure.search.ts`, `closure.queries.prompt.ts`, `closure.screening.prompt.ts`, `closure.sweep.ts`, their `__tests__`, `workers/gaps.worker.ts` |
| **api** | `modules/gap-closure/closure.routes.ts`, `closure.controller.ts`, `closure.service.ts`, `closure.access.ts`, `coverage.service.ts`, `calibration.service.ts`, `dossier.ts`, `dto/closure.schema.ts`, their `__tests__`, `routes/index.ts`, `modules/gaps/gap-presenter.ts`, `modules/gaps/gaps.service.ts` (list mapping only), `modules/gaps/dto/gaps.schema.ts`, `modules/gaps/gap-validation.service.ts` (createCandidate only) |
| **web** | `apps/web/src/features/gap-closure/**`, `apps/web/src/constants/api.ts`, `features/gaps/components/gap-card.tsx`, `gap-detail-drawer.tsx`, the manual gap form, `routes/app-routes.tsx`, new page under `pages/`, `i18n/locales/*` |
| **docs** | `docs/gap-closure-protocol.md`, `docs/gap-closure-protocol.vi.md` |

Wave 2 (after wave 1): replace `computeGapEvidence` with an observed/expected + Poisson ranking signal and
relabel "Confirmed" as "Under-explored" (done: signal in `gaps/gap-evidence.ts`, presenter re-ranks old rows from stored
counts, web labels and docs updated, env `GAP_UNDEREXPLORED_MAX_RATIO` / `GAP_UNDEREXPLORED_ALPHA` replace
`GAP_SCARCE_ABS` / `GAP_SCARCE_PCT` / `GAP_PARENT_RISING_MIN`); retrospective evaluation script; Flutter badge.

Rules for every agent: follow CLAUDE.md §6; do not commit; do not edit files owned by another agent or the
foundation (report instead); `pnpm typecheck` errors in files you do not own are not yours to fix; Docker may be
down, so persistence tests may not run — write them, run unit tests, and say what could not run.
