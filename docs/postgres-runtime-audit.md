# PostgreSQL-only runtime audit

Audit date: 2026-09-24

## Enforced runtime boundary

- The API entry point connects only through Prisma/PostgreSQL.
- Every BullMQ worker connects only through Prisma/PostgreSQL.
- Readiness checks probe only PostgreSQL and Redis.
- `PERSISTENCE_PROVIDER=mongodb` is rejected outside isolated unit tests.
- The production import graph contains no Mongoose or legacy model imports.
- Docker Compose contains no MongoDB service or volume.
- `MONGODB_URI` is not part of the runtime environment schema, production
  validation, backend Compose environment, or checked-in runtime examples.

## Deliberate exception

The verified one-off MongoDB-to-PostgreSQL copy uses
`scripts/lib/postgres-migration-runtime.ts`. It reads the separately named
`MIGRATION_SOURCE_MONGODB_URI` variable and opens a small, explicit read-side
connection. This module is not imported by the API or any worker.

Historical data-copy scripts are isolated under `scripts/`, have no package
script entry, and are never imported by application or worker entry points.

## Regression protection

`src/infrastructure/database/postgres-only-runtime.test.ts` scans the API and
all worker entry points. It fails if a Mongo connector import/call returns or
if MongoDB is restored to the default Compose runtime. The backend build runs
this audit before TypeScript compilation.

## Converted runtime domains

The following runtime paths now use Prisma/PostgreSQL implementations:

- authentication, audit, bookmarks and notifications;
- home overview, trends overview, paper browse/detail/workflow and search;
- pgvector retrieval and embedding persistence;
- communities, forum, projects, recruitment and draft workspaces;
- AI run lifecycle and the PostgreSQL/Redis runtime boundary;
- reports/RAG, research gaps, submissions, reviewer workflow, project chat,
  OpenAlex ingestion/campaign state, quality checks, and trend analysis.

## Remaining test debt

Production services are Prisma-backed. Some historical unit tests still mock
Mongoose model chains and must be replaced with Prisma repository or PostgreSQL
integration fixtures. This does not add a runtime MongoDB dependency, but the
full legacy-oriented test suite must not be reported as green until those tests
are modernized.

Manual verification performed with the MongoDB container stopped:

1. `/ready`, `/api/v1/home/overview`, and `/api/v1/trends` returned HTTP 200.
2. A notification worker started successfully using PostgreSQL and Redis.
3. Windows reported zero active TCP connections to port 27017 while both the
   API and worker were running.
4. The backend build passed.
5. TypeScript production build passed.
6. The current legacy-heavy unit suite has 352/453 passing tests. The 101
   failures are concentrated in stale Mongoose-mock tests and several contracts
   that need PostgreSQL-era fixture updates. This is tracked separately from
   live smoke checks and must not be reported as a green full-suite result.
