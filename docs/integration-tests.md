# Integration tests (academic verification)

Six persistence suites are **skipped** by `pnpm test` unless an env flag is set, because they create users, projects
and evidence files and must only ever run against a throwaway database:

| Flag | Suites |
|---|---|
| `STUDENT_AFFILIATION_INTEGRATION=1` | `student-affiliation`, `shared-academic-profile`, `open-academic-onboarding`, `academic-relationships` |
| `LECTURER_VERIFICATION_INTEGRATION=1` | `adaptive-lecturer` |
| `MENTORSHIP_INTEGRATION=1` | `mentorship-workflow` |

Every suite refuses to start (`Use an isolated _test database`) when the flag is on and the `DATABASE_URL` database
name does not end in `_test`. CI runs all six after the normal test step (`.github/workflows/ci.yml`).

> **Never enable these flags against your dev database (`lumigap_db`).** The guard is the last line of defence, not
> permission to try. Cleanup deletes by the ids the suites created, but a `_test` database is the only safe place.

## Run them locally

1. Create a database whose name ends in `_test` (Compose exposes PostgreSQL on port `5433`):

   ```bash
   docker exec lumi-gap-postgres-1 createdb -U postgres lumigap_integration_test
   ```

2. Apply the migrations to it (not to `lumigap_db`):

   ```bash
   DATABASE_URL=postgresql://<user>:<password>@localhost:5433/lumigap_integration_test pnpm --filter backend db:migrate:deploy
   ```

3. Run the suites. The flags are passed by the caller on purpose; the `test:integration` script does not set them.
   Use a Redis you can throw away (CI uses database 15 of its own service):

   ```bash
   DATABASE_URL=postgresql://<user>:<password>@localhost:5433/lumigap_integration_test \
   REDIS_URL=redis://localhost:6379/15 NODE_ENV=test EMAIL_DELIVERY_MODE=disabled STORAGE_PROVIDER=local LOG_LEVEL=error \
   STUDENT_AFFILIATION_INTEGRATION=1 LECTURER_VERIFICATION_INTEGRATION=1 MENTORSHIP_INTEGRATION=1 \
   pnpm --filter backend test:integration
   ```

   Expect 6 files and 127 tests. The script runs them with one worker because they share the database.

4. Drop the database when you are done:

   ```bash
   docker exec lumi-gap-postgres-1 dropdb -U postgres --force lumigap_integration_test
   ```

`apps/backend/scripts/test-mentorship-integration.mjs` and `check-lecturer-verification-workflow.mjs` do the same with
a fresh database and Redis per run, and also replay the migrations.

## Writing a new integration suite

- Gate it with a flag and add the `_test` database guard before `describe`.
- Record the id of every row you create and delete them in `afterAll`, children first. Many foreign keys to users and
  projects are `RESTRICT`, so a bare `user.deleteMany` fails. The helper in
  `modules/projects/__tests__/academic-test-data.ts` covers users, projects, mentorships, papers and institutions.
- Never hard-code values for unique columns (for example `legacyMongoId`); the suite must pass when run twice.
