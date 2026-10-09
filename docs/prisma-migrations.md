# Prisma migrations: schema drift and the safe workflow

Last checked: 2026-10-09, against `apps/backend/prisma/migrations` up to `20261009120000_submissions_project_restrict`.

## The problem

The database is built by the checked-in SQL migrations, but the `.prisma` schema files do not
describe everything those migrations create. `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma`
(run against a throwaway pgvector shadow database) produces a script that would:

| Change Prisma would generate | Count | Why it is wrong |
|---|---|---|
| `DROP CONSTRAINT ..._fkey` | 297 | Foreign keys exist only in SQL migrations; most `.prisma` files declare no `@relation` |
| `DROP INDEX` | 7 | Includes `paper_chunks_embedding_idx` (pgvector) and the `papers` / `communities` full-text GIN indexes, which Prisma cannot express |
| `ALTER COLUMN ... DROP DEFAULT` | 15 | Defaults set in SQL (`gen_random_uuid()`, `now()`, generated `search_document`) that the schema leaves to Prisma |

So **`pnpm --filter backend db:migrate:dev` must not be used**: the migration it creates would delete
every foreign key, the vector index and the search indexes.

Two more things block `migrate dev` today:

- `prisma/migrations/migration_lock.toml` was missing (added with this document; `provider = "postgresql"`).
- `20260924000600_legacy_email_verification_recovery` reads `_prisma_migrations`, which does not exist in a
  shadow database, so replaying the migrations there fails (P3018). It is a data-only migration; do not edit
  it (that changes its checksum on databases where it already ran).

## Safe workflow for a schema change

1. Edit the model in `apps/backend/prisma/*.prisma` and run `pnpm --filter backend db:generate`.
2. Create `prisma/migrations/<yyyymmddHHMMSS>_<name>/migration.sql` and write the SQL by hand.
   To get a starting point, diff your local database against the schema and keep **only** the statements
   for your change:

   ```bash
   pnpm --filter backend exec prisma migrate diff --config prisma7.config.ts --from-config-datasource --to-schema prisma --script
   ```

   Delete every unrelated `DROP CONSTRAINT`, `DROP INDEX` and `DROP DEFAULT` line from the output.
3. Apply it with `pnpm --filter backend db:migrate:deploy` and check `db:migrate:status`.
4. Review the SQL in the pull request like code.

## Long-term fix

Declare the relations, the defaults and (where Prisma supports it) the indexes in the `.prisma` files until
the diff above is empty, in a dedicated pull request. Introspecting a database built from the migrations
(`prisma db pull` into a scratch copy of the schema) shows the missing `@relation` fields. After that,
`migrate dev` becomes safe again.
