-- On-demand OpenAlex import for one catalogue entry with thin local coverage. A run imports only works the
-- corpus is missing, within its own budget. target_kind + target_id is a polymorphic reference (no foreign key).

CREATE TABLE "topic_backfill_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "target_kind" VARCHAR(16) NOT NULL,
  "target_id" UUID NOT NULL,
  "target_name" TEXT NOT NULL,
  "state" VARCHAR(16) NOT NULL DEFAULT 'queued',
  "trigger" VARCHAR(16) NOT NULL,
  "requested_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "max_new_papers" INTEGER NOT NULL,
  "paper_count_before" INTEGER NOT NULL DEFAULT 0,
  "fetched_count" INTEGER NOT NULL DEFAULT 0,
  "inserted_count" INTEGER NOT NULL DEFAULT 0,
  "skipped_count" INTEGER NOT NULL DEFAULT 0,
  "rejected_count" INTEGER NOT NULL DEFAULT 0,
  "pages_fetched" INTEGER NOT NULL DEFAULT 0,
  "error_message" TEXT,
  "started_at" TIMESTAMPTZ(6),
  "finished_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "topic_backfill_runs_target_kind_check" CHECK ("target_kind" IN ('topic', 'subfield', 'keyword', 'tag')),
  CONSTRAINT "topic_backfill_runs_state_check" CHECK ("state" IN ('queued', 'running', 'completed', 'failed')),
  CONSTRAINT "topic_backfill_runs_trigger_check" CHECK ("trigger" IN ('admin', 'search')),
  CONSTRAINT "topic_backfill_runs_budget_check" CHECK ("max_new_papers" > 0)
);

-- At most one live run per target, so concurrent requests attach to it instead of importing twice.
CREATE UNIQUE INDEX "topic_backfill_runs_active_target_key"
  ON "topic_backfill_runs"("target_kind", "target_id") WHERE "state" IN ('queued', 'running');
CREATE INDEX "topic_backfill_runs_target_kind_target_id_created_at_idx"
  ON "topic_backfill_runs"("target_kind", "target_id", "created_at" DESC);
CREATE INDEX "topic_backfill_runs_state_created_at_idx" ON "topic_backfill_runs"("state", "created_at");
CREATE INDEX "topic_backfill_runs_trigger_created_at_idx" ON "topic_backfill_runs"("trigger", "created_at");
CREATE INDEX "topic_backfill_runs_requested_by_id_idx" ON "topic_backfill_runs"("requested_by_id");
