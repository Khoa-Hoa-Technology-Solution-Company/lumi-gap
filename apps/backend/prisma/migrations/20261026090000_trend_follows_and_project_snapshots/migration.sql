-- Trend topic follows (verdict-change notifications) and trend snapshots attached to projects.

CREATE TABLE "trend_topic_follows" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "topic" VARCHAR(300) NOT NULL,
  "topic_key" VARCHAR(300) NOT NULL,
  "openalex_topic_id" VARCHAR(64),
  "note" VARCHAR(500),
  "last_verdict" VARCHAR(24),
  "last_data_source" VARCHAR(16),
  "last_checked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trend_topic_follows_topic_key_check" CHECK ("topic_key" = lower(btrim("topic")))
);
CREATE UNIQUE INDEX "trend_topic_follows_user_id_topic_key_key" ON "trend_topic_follows"("user_id", "topic_key");
CREATE INDEX "trend_topic_follows_last_checked_at_idx" ON "trend_topic_follows"("last_checked_at");

CREATE TABLE "project_trend_snapshots" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "created_by_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "topic" VARCHAR(300) NOT NULL,
  "openalex_topic_id" VARCHAR(64),
  "year_from" INTEGER NOT NULL,
  "year_to" INTEGER NOT NULL,
  "verdict" VARCHAR(24) NOT NULL,
  "data_source" VARCHAR(16) NOT NULL,
  "total_papers" INTEGER NOT NULL CHECK ("total_papers" >= 0),
  "statistics" JSONB NOT NULL,
  "note" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_trend_snapshots_years_check" CHECK ("year_from" <= "year_to")
);
CREATE INDEX "project_trend_snapshots_project_id_created_at_idx" ON "project_trend_snapshots"("project_id", "created_at");
