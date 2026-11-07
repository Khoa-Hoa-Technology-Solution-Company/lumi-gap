-- OpenAlex writers (sync, campaigns, topic backfill, forum attach) deduplicate by lookup-then-insert,
-- so concurrent workers could store the same DOI-less work twice. Enforce one row per OpenAlex work.
-- NULLs stay allowed (user submissions and other providers have no OpenAlex id).
BEGIN;

DO $$
DECLARE duplicate_groups bigint;
BEGIN
 SELECT count(*) INTO duplicate_groups FROM (
  SELECT openalex_id FROM papers WHERE openalex_id IS NOT NULL GROUP BY openalex_id HAVING count(*) > 1
 ) d;
 IF duplicate_groups > 0 THEN
  RAISE EXCEPTION 'papers has % duplicated openalex_id values; merge them before applying this migration', duplicate_groups
   USING HINT = 'SELECT openalex_id, array_agg(id) FROM papers WHERE openalex_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1';
 END IF;
END $$;

DROP INDEX IF EXISTS "papers_openalex_id_idx";
CREATE UNIQUE INDEX "papers_openalex_id_key" ON "papers"("openalex_id");

COMMIT;
