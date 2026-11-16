-- Records how each provider paper first entered the corpus, and why a low-quality record is low-quality.
ALTER TABLE "papers"
  ADD COLUMN "ingest_source" VARCHAR(32),
  ADD COLUMN "ingest_source_detail" TEXT;

CREATE INDEX "papers_ingest_source_idx" ON "papers" ("ingest_source");

-- Existing rows: the source was never stored, so it is inferred from the run that was active when the paper was
-- created. Each step only fills rows the earlier steps left empty. This is a best guess: two imports running at the
-- same moment cannot be told apart.

-- 1. Campaigns: a membership row links the paper to its campaign. A paper older than the campaign was already in the
--    corpus and only re-read by it.
UPDATE "papers" p
SET "ingest_source" = 'campaign',
    "ingest_source_detail" = COALESCE('tag: ' || NULLIF(src.tag_name, ''), src.campaign_key)
FROM (
  SELECT DISTINCT ON (m."paper_id") m."paper_id", c."campaign_key", c."manifest" -> 'tag' ->> 'name' AS tag_name, c."started_at"
  FROM "paper_cohort_memberships" m
  JOIN "openalex_ingest_campaigns" c ON c."id" = m."campaign_id"
  ORDER BY m."paper_id", m."selected_at"
) src
WHERE p."id" = src."paper_id"
  AND p."primary_provider" = 'openalex'
  AND p."ingest_source" IS NULL
  AND src."started_at" IS NOT NULL
  AND p."created_at" >= src."started_at";

-- 2. Catalogue and search imports (topic backfill runs).
UPDATE "papers" p
SET "ingest_source" = CASE WHEN src."trigger" = 'search' THEN 'search-import' ELSE 'catalogue-import' END,
    "ingest_source_detail" = src."target_kind" || ': ' || src."target_name"
FROM (
  SELECT DISTINCT ON (p2."id") p2."id" AS paper_id, r."trigger", r."target_kind", r."target_name"
  FROM "papers" p2
  JOIN "topic_backfill_runs" r
    ON r."started_at" IS NOT NULL
   AND p2."created_at" >= r."started_at"
   AND p2."created_at" <= COALESCE(r."finished_at", r."updated_at")
  WHERE p2."primary_provider" = 'openalex' AND p2."ingest_source" IS NULL AND r."inserted_count" > 0
  ORDER BY p2."id", r."started_at" DESC
) src
WHERE p."id" = src.paper_id;

-- 3. Sync runs: the daily topic watch records its runs as "[watch] <name>", the rest were free-text syncs.
UPDATE "papers" p
SET "ingest_source" = CASE WHEN src."search_text" LIKE '[watch] %' THEN 'topic-watch' ELSE 'free-text-sync' END,
    "ingest_source_detail" = CASE WHEN src."search_text" LIKE '[watch] %' THEN substr(src."search_text", 9) ELSE src."search_text" END
FROM (
  SELECT DISTINCT ON (p2."id") p2."id" AS paper_id, r."search_text"
  FROM "papers" p2
  JOIN "api_sync_runs" r
    ON p2."created_at" >= r."started_at"
   AND p2."created_at" <= COALESCE(r."finished_at", r."updated_at")
  WHERE p2."primary_provider" = 'openalex' AND p2."ingest_source" IS NULL AND r."total_inserted" > 0
  ORDER BY p2."id", r."started_at" DESC
) src
WHERE p."id" = src.paper_id;

-- 4. Everything else from the provider predates this column.
UPDATE "papers"
SET "ingest_source" = 'legacy'
WHERE "primary_provider" = 'openalex' AND "ingest_source" IS NULL;

-- Low-quality provider records never said why. The rule is the one the importer applies: no abstract, or one too
-- short to embed (AI_ANALYZABLE_MIN_ABSTRACT_CHARS = 250).
UPDATE "papers"
SET "rejection_reason" = CASE
  WHEN COALESCE(btrim("abstract_text"), '') = '' THEN 'No abstract from the provider'
  ELSE 'Abstract shorter than 250 characters'
END
WHERE "primary_provider" = 'openalex'
  AND "data_status" = 'low-quality'
  AND "rejection_reason" IS NULL;
