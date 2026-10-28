-- Community names must be unique (ignoring case, accents and spacing) among live and pending communities.
-- Until now only an advisory lock in the application protected this; the database is the last line of defence.
--
-- unaccent() is STABLE, so it cannot appear in an index expression. This wrapper pins the dictionary,
-- which is what makes it safe to declare IMMUTABLE.
-- Prisma cannot express expression/partial indexes, so the .prisma schema is intentionally unchanged
-- (same as the other hand-written indexes, see docs/prisma-migrations.md).
-- The expression must stay identical to the one in `assertNameAvailable` (community.service.ts).

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION "immutable_unaccent"(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

CREATE UNIQUE INDEX "communities_active_name_key"
  ON "communities" ((regexp_replace(lower("immutable_unaccent"(btrim("name"))), '\s+', ' ', 'g')))
  WHERE "status" IN ('ACTIVE', 'PENDING_APPROVAL');
