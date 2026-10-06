# Archived MongoDB to PostgreSQL data-copy runbook

## Current status

The application cutover is complete. PostgreSQL is the only API and worker runtime provider (`PERSISTENCE_PROVIDER=postgresql`); normal development and deployment do not run MongoDB.

This document and the isolated scripts it references are retained only for a one-time read-only copy from a historical database. They are not application runtime commands and are not exposed through `package.json` scripts.

Implemented now:

- PostgreSQL 16 with pgvector 0.8.1 in Docker Compose;
- Prisma 7.10 with the PostgreSQL driver adapter and a process-wide lazy client;
- relational schema for the 75 persisted Mongoose models, including normalized child/junction tables;
- three reviewed SQL migrations for tables, indexes, pgvector, foreign keys, checks, FTS, and migration-control state;
- UUID primary keys plus nullable unique `legacy_mongo_id` values;
- dual-format UUID/ObjectId parsing and stable public-ID mapping helpers;
- parameterized pgvector cosine search and PostgreSQL FTS query helpers;
- resumable, fail-fast migration and verification for every currently non-empty local collection: users, refresh tokens, trusted institutions, academic profile handles, academic profiles, projects, forum posts, payment orders, search logs, and audit logs.
- PostgreSQL startup/readiness and Prisma runtime paths for all API domains and BullMQ workers;
- a build-time import-graph audit that rejects any server/worker path reaching Mongoose or legacy model files;
- a PostgreSQL-only default Compose stack containing PostgreSQL/pgvector and Redis.

Remaining maintenance work is test modernization: some historical unit tests still mock Mongoose models even though production services now use Prisma. Production build, runtime audit, migrations, readiness, API smoke tests, and worker startup checks are PostgreSQL-only.

The complete model inventory and design rationale are in [database-migration-audit.md](./database-migration-audit.md).

## Current runtime architecture

```text
React/Vite -> Express /api/v1 -> PostgreSQL + pgvector
                             -> Redis/BullMQ
                             -> FastAPI reviewer
```

PostgreSQL uses UUID primary keys. Rows copied from the historical database may retain an original identifier in `legacy_mongo_id`; compatibility parsing does not open or require a MongoDB connection.

## Environment variables

Application and Prisma:

```dotenv
DATABASE_URL=postgresql://USER:URL_ENCODED_PASSWORD@HOST:5433/lumigap_db
PERSISTENCE_PROVIDER=postgresql
```

Optional archived data-copy tooling only:

```dotenv
MIGRATION_SOURCE_MONGODB_URI=mongodb://READ_ONLY_USER:URL_ENCODED_PASSWORD@HOST:27017/source_db?authSource=admin
MIGRATION_SOURCE_DATABASE=source_db
MIGRATION_BATCH_SIZE=500
```

Compose additionally requires `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`. Keep secrets in the root `.env`; never commit them.

If the archived copier is ever used, use a read-only source account. Remove its credentials immediately after the copy; never add those variables to the application runtime environment.

## Local infrastructure

Run `pnpm setup` (or copy root `.env.example` to `.env`), set `GEMINI_API_KEY`, then start only the databases and queue:

```powershell
pnpm docker:infra
docker compose ps
```

The Docker pgvector database listens on host port `5433` so an existing native
PostgreSQL installation can keep port `5432`. MongoDB is started only for an
explicit migration/verification run and stopped again afterward.

Run the backend and frontend natively as before:

```powershell
pnpm --filter backend db:migrate:deploy
pnpm dev:backend
pnpm dev:web
```

The backend process starts and its readiness probe passes with only PostgreSQL and Redis. Routes still listed as legacy-only require repository migration before they can be exercised with MongoDB stopped.

## Prisma schema and migrations

The schema is split by domain under `apps/backend/prisma/`. Run:

```powershell
pnpm --filter backend db:validate
pnpm --filter backend db:generate
pnpm --filter backend db:migrate:deploy
pnpm --filter backend db:migrate:status
```

Migration history:

1. `20260924000100_postgresql_foundation` — pgvector and all normalized tables/indexes.
2. `20260924000200_relations_constraints_search` — foreign keys, partial uniqueness, CHECK constraints, generated FTS columns, and GIN indexes.
3. `20260924000300_data_migration_control` — runs, checkpoints, durable ObjectId-to-UUID maps, and failure ledger.

Production uses `migrate deploy`; `db push` is not a supported deployment workflow.

## Relational and JSONB decisions

Independent, filtered, authorized, or uniquely constrained records are relational. This includes memberships, paper authors/topics/keywords, report evidence, workspace members, submission authors/conflicts, profile identities/works/evidence, forum targets, and chat reads/citations.

JSONB is limited to document-shaped snapshots such as provider payloads, AI output, validation metrics, audit details, and flexible processing metadata. Relational IDs are not hidden in JSONB or PostgreSQL arrays.

## Search migration

Paper embeddings are `vector(768)`, matching the configured Gemini embedding dimension. The migration rejects non-768 embeddings; it never pads or truncates them.

The initial query path uses exact cosine distance. Its compatibility score is `1 - cosine_distance / 2`, matching MongoDB Atlas cosine scores on a 0..1 scale. Weighted PostgreSQL FTS over title and abstract supplies keyword fallback. Community FTS also includes its text topic list.

No ANN index is created yet. Add HNSW or IVFFlat only after measuring the actual corpus, PostgreSQL/pgvector version, recall, latency, memory, and write cost.

## Data migration

Current executable tranche (ordered by dependency):

1. `users`
2. `refreshtokens`
3. `trusted_institutions`
4. `academic_profile_handles`
5. `academic_profiles` (including normalized external identities, featured works, and verification evidence)
6. `research_projects` (including normalized members and paper links)
7. `forum_posts` (including normalized paper links and references)
8. `paymentorders`
9. `search_logs`
10. `audit_logs`

This list covers all collections that currently contain records in the local MongoDB database. Empty collections still require their own reviewed adapters before production cutover, because they may contain data in another environment later.

Run it with a stable rehearsal key:

```powershell
pnpm --filter backend postgres:migrate-data -- --run-key=rehearsal-2026-09-24
```

The migration:

- reads MongoDB in bounded `_id` order;
- stores ObjectId-to-UUID mappings in PostgreSQL;
- preserves timestamps, roles, account state, points, credits, and token expiry/revocation state;
- upserts by `legacy_mongo_id`;
- commits each record atomically with its mapping;
- stops at the first failed record and leaves the cursor at the last successful record;
- records a sanitized failure without document values or credentials;
- resumes with the same `--run-key` after the cause is fixed.

A run key is bound to one hashed MongoDB endpoint/database marker. Reusing it against another source is rejected. Use a new run key for a new immutable source snapshot or rehearsal.

## Verification

```powershell
pnpm --filter backend postgres:verify-migration -- --run-key=rehearsal-2026-09-24
```

The current verifier compares Mongo/PostgreSQL counts for all ten collections above and checks:

- migration-run status;
- incomplete checkpoints;
- unresolved failures;
- orphan refresh-token references;
- invalid vector dimensions.

It exits non-zero on any mismatch. As each domain adapter lands, its count, relationship, invariant, and cached-counter checks must be added before that domain can pass the cutover gate.

## Entity mapping

The detailed 75-model table is maintained in [database-migration-audit.md](./database-migration-audit.md). Core examples:

| MongoDB | PostgreSQL |
| --- | --- |
| `users` | `users` |
| `refreshtokens` | `refresh_tokens` |
| `research_papers` | `papers`, `paper_authors`, `paper_keywords`, `paper_topics` |
| `research_projects` | `projects`, `project_members`, `project_papers` |
| `llm_analysis_reports` | `reports`, `report_grounding_papers`, `report_selected_papers` |
| embedded project/profile/forum relations | explicit junction/child tables |

## Cutover gate

Cut over only when all items are true:

1. every Mongo collection has a reviewed adapter and completed checkpoint;
2. verifier reports equal authoritative counts, zero unresolved failures, zero orphan references, and reconciled counters/ledgers;
3. auth, API contracts, search, semantic search, projects, credits, reviews, admin, and workers pass against PostgreSQL;
4. ingestion pause/resume, idempotency, and bounded-batch behavior pass;
5. a fresh production-like migration rehearsal meets the downtime/lag budget;
6. a MongoDB backup or read-only snapshot is retained;
7. observability and rollback owners are assigned.

Then stop writes, drain BullMQ workers, perform the final delta copy, rerun verification, set `PERSISTENCE_PROVIDER=postgresql`, deploy API/workers, and run smoke tests before reopening writes.

## Rollback

Before the final cutover, rollback is a configuration change because MongoDB remains authoritative:

1. stop API/workers to prevent split writes;
2. restore `PERSISTENCE_PROVIDER=mongodb`;
3. deploy/restart API and workers;
4. verify auth, one read endpoint, one write endpoint, and BullMQ connectivity;
5. retain the failed PostgreSQL database for investigation.

Do not delete or modify MongoDB as part of rollback. After PostgreSQL begins accepting authoritative writes, rollback requires an explicit reverse-sync/reconciliation plan; a simple provider flip is no longer safe.

## Security and failure handling

- All runtime search values use Prisma tagged templates; no user value is concatenated into SQL.
- Dynamic migration table identifiers are not accepted from CLI input.
- Credentials are environment-only and error messages redact database URLs.
- Unique indexes, checks, foreign keys, and transactions are the final race-condition boundary.
- Migration failures are durable and block success; they are never silently skipped.
- MongoDB cleanup and Mongoose removal are separate final-phase changes, not migration-script behavior.
