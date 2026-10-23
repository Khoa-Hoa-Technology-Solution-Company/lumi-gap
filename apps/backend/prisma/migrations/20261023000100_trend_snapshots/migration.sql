-- Research Trends P2.1: precomputed OpenAlex topic statistics (docs/research-trends/05_IMPLEMENTATION_PLAN.md §P2.1).
-- Written by hand (docs/prisma-migrations.md). CHECK constraints, foreign keys and the partial unique index
-- "one active snapshot per Data Scope" exist only here; the .prisma file cannot express them.

CREATE TABLE "trend_snapshots" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "snapshot_key" TEXT NOT NULL UNIQUE,
  "scope_hash" TEXT NOT NULL,
  "scope_filter" TEXT NOT NULL,
  "work_types" JSONB NOT NULL,
  "corpus" VARCHAR(16) NOT NULL,
  "year_from" INTEGER NOT NULL,
  "year_to" INTEGER NOT NULL,
  "last_complete_year" INTEGER NOT NULL,
  "collection_day" VARCHAR(10) NOT NULL,
  "collection_version" VARCHAR(32) NOT NULL,
  "analytics_version" VARCHAR(32),
  "status" VARCHAR(24) NOT NULL DEFAULT 'collecting',
  "is_active" BOOLEAN NOT NULL DEFAULT FALSE,
  "lease_owner_id" TEXT,
  "lease_expires_at" TIMESTAMPTZ(6),
  "requests" INTEGER NOT NULL DEFAULT 0 CHECK ("requests" >= 0),
  "credits_used" INTEGER NOT NULL DEFAULT 0 CHECK ("credits_used" >= 0),
  "paused_reason" TEXT,
  "resume_after" TIMESTAMPTZ(6),
  "failure_reason" TEXT,
  "validation" JSONB,
  "first_fetched_at" TIMESTAMPTZ(6),
  "last_fetched_at" TIMESTAMPTZ(6),
  "collected_at" TIMESTAMPTZ(6),
  "validated_at" TIMESTAMPTZ(6),
  "activated_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trend_snapshots_status_check" CHECK ("status" IN ('collecting', 'paused_budget', 'failed', 'validation_failed', 'validated', 'active', 'superseded')),
  CONSTRAINT "trend_snapshots_window_check" CHECK ("year_from" <= "last_complete_year" AND "last_complete_year" <= "year_to"),
  -- Only a validated snapshot with analytics can be the active one.
  CONSTRAINT "trend_snapshots_active_check" CHECK (NOT "is_active" OR ("status" = 'active' AND "analytics_version" IS NOT NULL AND "validated_at" IS NOT NULL))
);
CREATE INDEX "trend_snapshots_scope_hash_status_created_at_idx" ON "trend_snapshots" ("scope_hash", "status", "created_at");
-- At most one active snapshot per Data Scope: activation swaps it inside one transaction.
CREATE UNIQUE INDEX "trend_snapshots_one_active_per_scope" ON "trend_snapshots" ("scope_hash") WHERE "is_active";

CREATE TABLE "trend_snapshot_units" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "snapshot_id" UUID NOT NULL REFERENCES "trend_snapshots"("id") ON DELETE CASCADE,
  "level" VARCHAR(16) NOT NULL,
  "year" INTEGER NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
  "cursor" TEXT DEFAULT '*',
  "pages_fetched" INTEGER NOT NULL DEFAULT 0 CHECK ("pages_fetched" >= 0),
  "groups_fetched" INTEGER NOT NULL DEFAULT 0 CHECK ("groups_fetched" >= 0),
  "meta_count" INTEGER,
  "checkpoint_version" INTEGER NOT NULL DEFAULT 0 CHECK ("checkpoint_version" >= 0),
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trend_snapshot_units_level_check" CHECK ("level" IN ('catalogue', 'topic', 'domain', 'field', 'subfield')),
  CONSTRAINT "trend_snapshot_units_status_check" CHECK ("status" IN ('pending', 'complete')),
  CONSTRAINT "trend_snapshot_units_catalogue_year_check" CHECK (("level" = 'catalogue') = ("year" = 0)),
  -- A complete unit has no cursor left; a pending unit always has one.
  CONSTRAINT "trend_snapshot_units_cursor_check" CHECK (("status" = 'complete') = ("cursor" IS NULL)),
  CONSTRAINT "trend_snapshot_units_snapshot_level_year_key" UNIQUE ("snapshot_id", "level", "year")
);

CREATE TABLE "trend_snapshot_pages" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "snapshot_id" UUID NOT NULL REFERENCES "trend_snapshots"("id") ON DELETE CASCADE,
  "unit_id" UUID NOT NULL REFERENCES "trend_snapshot_units"("id") ON DELETE CASCADE,
  "page_index" INTEGER NOT NULL CHECK ("page_index" >= 0),
  "cursor_in" TEXT NOT NULL,
  "cursor_out" TEXT,
  "group_count" INTEGER NOT NULL CHECK ("group_count" >= 0),
  "first_key" TEXT,
  "last_key" TEXT,
  "meta_count" INTEGER,
  "response_hash" VARCHAR(64) NOT NULL,
  "credits_used" INTEGER NOT NULL CHECK ("credits_used" >= 0),
  "remaining" INTEGER,
  "fetched_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "trend_snapshot_pages_unit_page_key" UNIQUE ("unit_id", "page_index")
);
CREATE INDEX "trend_snapshot_pages_snapshot_id_idx" ON "trend_snapshot_pages" ("snapshot_id");
-- Daily collection budget: credits spent by trend collection since 00:00 UTC.
CREATE INDEX "trend_snapshot_pages_fetched_at_idx" ON "trend_snapshot_pages" ("fetched_at");

CREATE TABLE "trend_snapshot_counts" (
  "snapshot_id" UUID NOT NULL REFERENCES "trend_snapshots"("id") ON DELETE CASCADE,
  "level" VARCHAR(16) NOT NULL,
  "unit_key" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "count" INTEGER NOT NULL CHECK ("count" >= 0),
  "display_name" TEXT NOT NULL,
  -- The primary key is what makes a group appearing twice (duplicated cursor page) an error, not a silent overwrite.
  PRIMARY KEY ("snapshot_id", "level", "unit_key", "year"),
  CONSTRAINT "trend_snapshot_counts_level_check" CHECK ("level" IN ('topic', 'domain', 'field', 'subfield'))
);

CREATE TABLE "trend_snapshot_topics" (
  "snapshot_id" UUID NOT NULL REFERENCES "trend_snapshots"("id") ON DELETE CASCADE,
  "topic_id" TEXT NOT NULL,
  "topic_name" TEXT NOT NULL,
  "subfield_id" TEXT NOT NULL,
  "subfield_name" TEXT NOT NULL,
  "field_id" TEXT NOT NULL,
  "field_name" TEXT NOT NULL,
  "domain_id" TEXT NOT NULL,
  "domain_name" TEXT NOT NULL,
  PRIMARY KEY ("snapshot_id", "topic_id")
);

CREATE TABLE "trend_snapshot_results" (
  "snapshot_id" UUID NOT NULL REFERENCES "trend_snapshots"("id") ON DELETE CASCADE,
  "baseline_level" VARCHAR(16) NOT NULL,
  "topic_id" TEXT NOT NULL,
  "baseline_unit" TEXT NOT NULL,
  "total_papers" INTEGER NOT NULL CHECK ("total_papers" >= 0),
  "years_used" INTEGER NOT NULL CHECK ("years_used" >= 0),
  "share_series" JSONB NOT NULL,
  "mann_kendall" JSONB,
  "sen_slope" DOUBLE PRECISION,
  "sen_slope_ci95" JSONB,
  "relative_change_pct" DOUBLE PRECISION,
  "p_value" DOUBLE PRECISION,
  "q_value" DOUBLE PRECISION,
  "q_family_key" TEXT NOT NULL,
  "q_family_size" INTEGER NOT NULL CHECK ("q_family_size" >= 0),
  "verdict" VARCHAR(16) NOT NULL,
  "confidence" VARCHAR(16),
  "reasons" JSONB NOT NULL,
  "ggt" JSONB NOT NULL,
  "ggt_mean_pct" DOUBLE PRECISION,
  "ggt_sem_pct" DOUBLE PRECISION,
  "ggt_years" INTEGER NOT NULL CHECK ("ggt_years" >= 0),
  "ggt_conditions_met" BOOLEAN NOT NULL,
  "nelis_threshold_group" VARCHAR(32),
  "stability_checked" BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY ("snapshot_id", "baseline_level", "topic_id"),
  CONSTRAINT "trend_snapshot_results_baseline_check" CHECK ("baseline_level" IN ('global', 'domain', 'field', 'subfield')),
  CONSTRAINT "trend_snapshot_results_verdict_check" CHECK ("verdict" IN ('rising', 'declining', 'stable', 'insufficient')),
  -- A Nelis threshold group is only given when both unambiguous conditions hold.
  CONSTRAINT "trend_snapshot_results_nelis_check" CHECK ("nelis_threshold_group" IS NULL OR "ggt_conditions_met")
);
CREATE INDEX "trend_snapshot_results_snapshot_baseline_verdict_idx" ON "trend_snapshot_results" ("snapshot_id", "baseline_level", "verdict");
