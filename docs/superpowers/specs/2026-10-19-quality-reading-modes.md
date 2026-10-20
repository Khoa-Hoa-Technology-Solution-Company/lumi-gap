# AI Quality Evaluation: reference mode, project mode and reading context

Builds on [2026-10-17-ai-quality-evaluation.md](2026-10-17-ai-quality-evaluation.md). The data
contract is fixed in `packages/shared-types/src/quality.ts` and `quality-rubric.ts`.

## Problem

Scores alone ("3/5") do not help a reader decide anything. Most readers (students starting out)
have no project yet: they browse trends and want to know what a paper is good for. Readers with a
project want to know how a paper serves their own research plan.

## Context ladder (paper targets)

The evaluation uses the strongest context available; nothing is required from the reader.

| Context | Source | Question answered |
|---|---|---|
| Project | reader picks a project they belong to | How does this paper serve my plan? |
| Topic / query | `?topic=` or `?q=` from the trend/search page that linked here | Where does this paper sit in the topic I am exploring? |
| None | the paper only | What is this paper useful for? |

Reference mode is the default and is always available. Project mode is opt-in.

## 1. Reference mode (paper, LLM, shared)

Same endpoint and storage as today (`quality_evaluations`, one row per paper, cache shared by all
users). Rubric `quality-v3` adds to `QualityAssessment` for papers:

- `facts: PaperReadingFacts` — study design, sample/data, setting, measures, key results (≤4),
  author-stated limitations (≤4). Each `reported` fact carries a verbatim quote validated like
  criterion evidence; otherwise `not_reported` with `value: null, evidence: null`. Never infer.
- `guidance: PaperReadingGuidance` — 1–3 reading purposes (overview/method/data/results/
  counterpoint/background) with a concrete explanation, audience level with reason, one caution.

The three rubric criteria, actions and research questions stay. Actions must advise the reader
(reading, verification, own study design), never rewriting the author's paper.

## 2. Reading context (paper, deterministic, no LLM)

`GET /api/v1/quality/paper/:paperId/reading-context?topic=&query=` → `PaperReadingContext`.
`optionalAuth`-compatible read; respects paper visibility (`dataStatus = active`).

- Trend: requested topic if it matches a known topic name (case-insensitive), else the paper's
  highest-scored `paper_topics` entry. Use the local PostgreSQL trend computation
  (`trendService.topicDetailOnly` / postgres helpers), never OpenAlex network calls here.
- Related (≤5, excluding the paper): pgvector neighbours of the paper's own stored embedding via
  existing retrieval helpers (no new embedding API call), labelled `same_topic_newer`,
  `same_topic_most_cited` or `semantic_neighbor`, with shared topic names.
- Redis cache via `infrastructure/cache.ts`, TTL 6 hours, key includes paperId + normalized topic.
  No LLM call, so it is allowed on page load.

## 3. Project mode (paper, LLM, shared by project members)

`POST /quality/evaluate { targetKind: "paper", targetId, projectId, language }`.

- Authorization: `requireCurrentProjectMembership(projectId, user)` before any cache or DB read.
- Prerequisite: a current reference assessment for the paper in the same language. The worker
  computes it first when missing/outdated, then makes one extra LLM call for the project.
- Input: reference assessment facts/summary + abstract + project title, description, research
  field, `ResearchPlan` problem/objectives/questions/scope/methodology, inclusion/exclusion criteria.
- Output `QualityProjectAssessment`. Validation: quotes verbatim against the supplied paper text;
  `questionLinks[].planItem` and `screening.criteria[]` must match plan/criteria text verbatim
  (normalized whitespace); otherwise drop the item (never fail the whole evaluation for one item).
- Storage: new table `quality_project_assessments` (project_id, paper_id unique pair, assessment
  JSONB, input_fingerprint, model, prompt_version, language, timestamps; FKs to projects/papers
  ON DELETE CASCADE). Hand-written migration, never `prisma migrate dev`.
- Fingerprint covers paper text, reference fingerprint, plan version/text, criteria, language and
  `QUALITY_PROJECT_ASSESSMENT_VERSION`. LLM cache key includes projectId + fingerprint.
- `GET /quality/paper/:id?projectId=` adds `projectEvaluation` / `projectEvaluationTask`.
- Job id distinct from reference jobs (include projectId); same ai-jobs worker, `withUserAi`.

## 4. Reliability (all targets)

- An unverifiable quote is dropped, not fatal. A scored criterion that loses its required
  citations becomes `score: null` / `insufficient_evidence` with an explanatory missingEvidence note.
  A `reported` fact without a valid quote becomes `not_reported`.
- Only a structural (schema) failure triggers one repair retry with cache bypass.
- Deduplicate the forced "no supporting abstracts" note against the model's similar notes.

## 5. Interface

Web and Flutter, same hierarchy:

1. Mode switch: "Đọc tham khảo" (default) / "Theo dự án". Project picker lists the reader's
   projects; with none, show a short explanation and a "Tạo dự án" link instead of a picker.
2. Reference view: summary → reading card (facts table; "Không nêu trong tóm tắt" for gaps) →
   "Đọc bài này để…" purposes + audience + caution → criteria rows (click → detail dialog, as now)
   → first action → "Xem chi tiết đánh giá".
3. Reading context card (loads on page open, no button): trend line for the topic with the
   paper's year marked, growth figures, and "Đọc tiếp" list with reason labels linking to papers.
   Linking pages (trend topic, search results) pass `?topic=` / `?q=` to the paper detail URL.
4. Project view: verdict badge + reason, plan questions this paper helps with (with quotes),
   reusable methods/data, tensions, screening suggestion citing the project's own criteria, and an
   "Thêm vào dự án" action using the existing project-papers API when the paper is not yet added.

Old results without `facts` show the existing view plus a re-evaluate prompt.

## Ownership for parallel implementation

| Area | Files | Owner |
|---|---|---|
| Contract | `packages/shared-types/src/quality*.ts` | coordinator only; request changes |
| Backend | `apps/backend/**` (quality module, migration, prisma, worker, routes) | backend session |
| Web | `apps/web/**` | web session |
| Mobile | `apps/flutter_mobile/**` | Flutter session |

## Verification

Unit tests for validation (facts, drops, downgrade, project verbatim checks), fingerprints and
authorization before cache reads; web component tests for both modes, empty-project state and
context card; Flutter widget tests. Persistence tests only on an isolated `lumi_gap_qa_quality_*`
database — never the developer database.

## Addendum after end-to-end QA (docs/qa/quality-reading-modes-2026-10-19)

- **Lenient normalization before validation (B1):** trim arrays to their maxima, wrap a single
  object where an array is expected, treat a missing optional explanation as empty. Only output
  that is still structurally unusable triggers the one repair retry.
- **Unverified facts (B2):** a fact whose value the model reports but whose quote is not verbatim
  becomes `status: "unverified"` (value kept, evidence null), shown as "could not verify the quote".
- **Diagnosable failures (B3/B4):** log the root cause (Zod issues, provider status) before
  mapping to a client error; failures carry `QualityErrorCode` (`task.errorCode` and the error
  envelope `code`), translated by clients.
- **Transient provider errors (B5):** quality jobs retry provider overload with exponential
  backoff (repo convention: attempts 5, 2000 ms base); non-retryable failures stop immediately.
- **Content depth:** ask for 2–4 actions and 2–3 research questions, all key results present in the
  abstract (up to 4), fact values and labels in the output language, a specific audience reason,
  and review/survey papers judged on synthesis and coverage rather than experimental results.
- **Reading context:** when the trend topic came from the request, related papers follow that
  topic; `cagr3yPct` is null when the base year has fewer than 5 papers; `partialYear` marks the
  current incomplete year.
- **Layout (U1):** no badge or mode-switch label wraps at 320/390 px.
