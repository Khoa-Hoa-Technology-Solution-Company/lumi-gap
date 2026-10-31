-- Taxonomy, keyword and tag catalogue (mentor feedback: classify and manage the stored corpus).
-- research_topics becomes the OpenAlex taxonomy tree (domain > field > subfield > topic) that
-- paper_topics.topic_id already references; keywords gains aliases/merge; tags are admin-curated.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Rows are inserted by set-based backfill SQL, so the ids and timestamps need database defaults.
ALTER TABLE "research_topics"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "level" VARCHAR(16) NOT NULL DEFAULT 'topic',
  ADD COLUMN "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "openalex_keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "works_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "paper_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "status" VARCHAR(16) NOT NULL DEFAULT 'active',
  ADD COLUMN "synced_at" TIMESTAMPTZ(6),
  ADD CONSTRAINT "research_topics_level_check" CHECK ("level" IN ('domain', 'field', 'subfield', 'topic')),
  ADD CONSTRAINT "research_topics_status_check" CHECK ("status" IN ('active', 'hidden')),
  ADD CONSTRAINT "research_topics_counts_check" CHECK ("works_count" >= 0 AND "paper_count" >= 0);

CREATE UNIQUE INDEX "research_topics_level_openalex_id_key" ON "research_topics"("level", "openalex_id");
CREATE INDEX "research_topics_level_status_paper_count_idx" ON "research_topics"("level", "status", "paper_count");
CREATE INDEX "research_topics_topic_name_trgm_idx" ON "research_topics" USING GIN (lower("topic_name") gin_trgm_ops);
CREATE INDEX "research_topics_aliases_idx" ON "research_topics" USING GIN ("aliases");

ALTER TABLE "keywords"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "status" VARCHAR(16) NOT NULL DEFAULT 'active',
  ADD COLUMN "merged_into_id" UUID REFERENCES "keywords"("id") ON DELETE SET NULL,
  ADD COLUMN "paper_count" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "keywords_status_check" CHECK ("status" IN ('active', 'hidden', 'merged')),
  ADD CONSTRAINT "keywords_merge_check" CHECK (("status" = 'merged') = ("merged_into_id" IS NOT NULL)),
  ADD CONSTRAINT "keywords_merge_self_check" CHECK ("merged_into_id" IS NULL OR "merged_into_id" <> "id"),
  ADD CONSTRAINT "keywords_paper_count_check" CHECK ("paper_count" >= 0);

CREATE INDEX "keywords_status_paper_count_idx" ON "keywords"("status", "paper_count");
CREATE INDEX "keywords_merged_into_id_idx" ON "keywords"("merged_into_id");
CREATE INDEX "keywords_normalized_name_trgm_idx" ON "keywords" USING GIN ("normalized_name" gin_trgm_ops);
CREATE INDEX "keywords_aliases_idx" ON "keywords" USING GIN ("aliases");

CREATE TABLE "tags" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" VARCHAR(120) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "status" VARCHAR(16) NOT NULL DEFAULT 'active',
  "color" VARCHAR(16),
  "paper_count" INTEGER NOT NULL DEFAULT 0,
  "created_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tags_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT "tags_status_check" CHECK ("status" IN ('active', 'archived')),
  CONSTRAINT "tags_paper_count_check" CHECK ("paper_count" >= 0)
);
CREATE UNIQUE INDEX "tags_slug_key" ON "tags"("slug");
CREATE INDEX "tags_status_name_idx" ON "tags"("status", "name");

CREATE TABLE "tag_rules" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tag_id" UUID NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
  "rule_kind" VARCHAR(16) NOT NULL,
  "effect" VARCHAR(16) NOT NULL DEFAULT 'include',
  "research_topic_id" UUID REFERENCES "research_topics"("id") ON DELETE CASCADE,
  "keyword_id" UUID REFERENCES "keywords"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tag_rules_effect_check" CHECK ("effect" IN ('include', 'exclude')),
  CONSTRAINT "tag_rules_target_check" CHECK (
    ("rule_kind" = 'topic' AND "research_topic_id" IS NOT NULL AND "keyword_id" IS NULL)
    OR ("rule_kind" = 'keyword' AND "keyword_id" IS NOT NULL AND "research_topic_id" IS NULL)
  )
);
CREATE INDEX "tag_rules_tag_id_idx" ON "tag_rules"("tag_id");
CREATE INDEX "tag_rules_research_topic_id_idx" ON "tag_rules"("research_topic_id");
CREATE INDEX "tag_rules_keyword_id_idx" ON "tag_rules"("keyword_id");
CREATE UNIQUE INDEX "tag_rules_topic_unique" ON "tag_rules"("tag_id", "research_topic_id") WHERE "research_topic_id" IS NOT NULL;
CREATE UNIQUE INDEX "tag_rules_keyword_unique" ON "tag_rules"("tag_id", "keyword_id") WHERE "keyword_id" IS NOT NULL;

CREATE TABLE "paper_tags" (
  "paper_id" UUID NOT NULL REFERENCES "papers"("id") ON DELETE CASCADE,
  "tag_id" UUID NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
  "source" VARCHAR(16) NOT NULL,
  "confidence" DOUBLE PRECISION,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "paper_tags_pkey" PRIMARY KEY ("paper_id", "tag_id"),
  CONSTRAINT "paper_tags_source_check" CHECK ("source" IN ('rule', 'embedding', 'manual')),
  CONSTRAINT "paper_tags_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1))
);
CREATE INDEX "paper_tags_tag_id_paper_id_idx" ON "paper_tags"("tag_id", "paper_id");

-- Lookup paths the backfill and tag-aware search join on.
CREATE INDEX IF NOT EXISTS "paper_topics_paper_id_topic_id_idx" ON "paper_topics"("paper_id", "topic_id");
CREATE INDEX IF NOT EXISTS "paper_keywords_paper_id_keyword_id_idx" ON "paper_keywords"("paper_id", "keyword_id");
