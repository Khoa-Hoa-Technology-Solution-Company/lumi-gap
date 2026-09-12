# AI Core Post-Merge Audit

Date: 2026-07-01
Branch: `codex/audit-ai-core-e2e`
Base merged commit: `b8b328c`

## Why This Audit Exists

Smart Reasoning Core F1-F4 was merged before human review. This audit verifies the merged code with Superpowers review plus live smoke tests, then fixes issues in a follow-up PR that must not be merged without human review.

## Superpowers Review Findings

Reviewer flagged:

1. P1: invalid LLM JSON could be cached before downstream validation.
2. P1: project chat retrieval filtered project papers after global vector search, which could miss relevant project papers outside the global top 1000.
3. P2: compare cache key lacked prompt/input hash.

Fixes in this branch:

1. `cachedGenerate` now accepts `validate`, validates generated output before caching, validates cached output before returning it, and evicts poisoned cached values.
2. Gap/directions/compare callers validate output before it can be cached.
3. Project chat ranks within the project corpus again using stored paper embeddings and cosine selection.
4. Compare cache key now includes a prompt/system hash.

## Live E2E Smoke Evidence

Environment: local machine with `apps/backend/.env`, MongoDB Atlas, Upstash Redis, Gemini.

Verified:

1. Mongo connectivity: `pnpm --filter backend test:mongo`
   - DB: `publication_trend`
   - `research_papers`: 15081
   - `rag_queries`: 19 before audit report smoke
   - `research_gaps`: 69 before audit gap smoke

2. Corpus readiness query:
   - `totalPapers`: 15081
   - `activeWithEmbedding`: 6991
   - `activeAnalyzable`: 12876
   - `analyzedCurrent`: 0 before F2 smoke

3. Redis:
   - Direct ping returned `PONG` in 156ms.
   - One cache wrapper set/get returned `redisSetGet: true`, but logged one `redis set timed out after 1500ms` warning. This means Redis is reachable but cache writes can be flaky under the current strict timeout.

4. F1 shared retriever:
   - `retrieve({ queryText: "large language model education", topK: 3 })` returned 3 real Atlas Vector Search results.

5. F2 structured paper knowledge:
   - `runPaperAnalysis({ maxPapers: 1, batchSize: 1 })`
   - Result: `{ analyzed: 1, failed: 0, skipped: 0 }`
   - DB changed from `analyzedCurrent: 0` to `1`.
   - Wrote one real `aiAnalysis` record with prompt version `paper-ai-analysis-v1`.

6. Report RAG:
   - Created audit report `6a441f5edfc836e0687b0694`.
   - Pipeline completed with `status: ready`, `groundingCount: 8`, `gapsCount: 2`, `promptVersion: report-v2`.

7. Standalone gap pipeline:
   - Created audit gap analysis `6a441f7ad969c6efe10cf268`.
   - Pipeline completed with `status: ready`, `gapCount: 3`, `promptVersion: gaps-v2`.

8. Production start:
   - Initial `pnpm --filter backend start` failed because `@trend/shared-types` exported `./src/index.ts`.
   - Fixed by building/exporting `packages/shared-types/dist`.
   - Production backend then booted on port 4100, connected Mongo/Redis, `/health` returned 200, `/api/v1/search` returned 200.

## Known Residual Risks

1. Live project chat E2E was not completed because it needs a seeded project with enough embedded papers and an authenticated user token. The risky retrieval regression was fixed by reverting chat selection to project-local cosine ranking.
2. Redis cache writes may occasionally time out at 1500ms. The cache wrapper degrades safely, but this can reduce token savings.
3. Audit smoke created real DB records:
   - one `aiAnalysis` on a paper
   - report `6a441f5edfc836e0687b0694`
   - gap analysis `6a441f7ad969c6efe10cf268`

## Required Review Rule

This PR must be reviewed by the human lead before merge.
