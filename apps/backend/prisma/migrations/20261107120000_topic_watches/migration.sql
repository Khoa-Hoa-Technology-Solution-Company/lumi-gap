-- A catalogue entry an admin keeps following. The daily OpenAlex job first works through the entry's older works
-- (backlog), resuming from a stored cursor, then follows newly published ones (tracking). target_kind + target_id is a
-- polymorphic reference (no foreign key on it), like topic_backfill_runs.

CREATE TABLE "topic_watches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "target_kind" VARCHAR(16) NOT NULL,
  "target_id" UUID NOT NULL,
  "target_name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "phase" VARCHAR(16) NOT NULL DEFAULT 'backlog',
  "daily_max_new_papers" INTEGER,
  "backlog_target_papers" INTEGER NOT NULL,
  "backlog_inserted" INTEGER NOT NULL DEFAULT 0,
  "query_fingerprint" TEXT,
  "query_index" INTEGER NOT NULL DEFAULT 0,
  "cursor" TEXT,
  "window_from" DATE,
  "window_started_on" DATE,
  "last_window_completed_on" DATE,
  "quota_day" DATE,
  "inserted_on_quota_day" INTEGER NOT NULL DEFAULT 0,
  "total_inserted" INTEGER NOT NULL DEFAULT 0,
  "total_skipped" INTEGER NOT NULL DEFAULT 0,
  "last_run_at" TIMESTAMPTZ(6),
  "last_error" TEXT,
  "created_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "topic_watches_target_kind_check" CHECK ("target_kind" IN ('topic', 'subfield', 'keyword', 'tag')),
  CONSTRAINT "topic_watches_phase_check" CHECK ("phase" IN ('backlog', 'tracking')),
  CONSTRAINT "topic_watches_daily_max_check" CHECK ("daily_max_new_papers" IS NULL OR "daily_max_new_papers" > 0),
  CONSTRAINT "topic_watches_backlog_target_check" CHECK ("backlog_target_papers" >= 0)
);

CREATE UNIQUE INDEX "topic_watches_target_kind_target_id_key" ON "topic_watches"("target_kind", "target_id");
CREATE INDEX "topic_watches_enabled_last_run_at_idx" ON "topic_watches"("enabled", "last_run_at");
CREATE INDEX "topic_watches_created_by_id_idx" ON "topic_watches"("created_by_id");
