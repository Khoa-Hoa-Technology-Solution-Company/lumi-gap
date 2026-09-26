-- Durable, resumable state for the MongoDB -> PostgreSQL copy. These records
-- live only in PostgreSQL; the MongoDB source remains read-only.
CREATE TABLE "data_migration_runs" (
    "id" UUID NOT NULL,
    "migration_key" VARCHAR(120) NOT NULL,
    "source_database" VARCHAR(160) NOT NULL,
    "source_fingerprint" VARCHAR(128),
    "status" VARCHAR(24) NOT NULL DEFAULT 'running',
    "stats" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "data_migration_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "data_migration_runs_status_check" CHECK ("status" IN ('running', 'completed', 'failed'))
);

CREATE TABLE "data_migration_checkpoints" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "source_collection" VARCHAR(120) NOT NULL,
    "phase" VARCHAR(40) NOT NULL DEFAULT 'records',
    "last_source_id" VARCHAR(64),
    "scanned_count" INTEGER NOT NULL DEFAULT 0,
    "migrated_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "is_complete" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "data_migration_checkpoints_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "data_migration_checkpoints_counts_check" CHECK ("scanned_count" >= 0 AND "migrated_count" >= 0 AND "failed_count" >= 0),
    CONSTRAINT "data_migration_checkpoints_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "data_migration_runs"("id") ON DELETE CASCADE
);

CREATE TABLE "data_migration_id_maps" (
    "id" UUID NOT NULL,
    "source_collection" VARCHAR(120) NOT NULL,
    "source_id" VARCHAR(64) NOT NULL,
    "target_table" VARCHAR(120) NOT NULL,
    "target_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "data_migration_id_maps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "data_migration_failures" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "source_collection" VARCHAR(120) NOT NULL,
    "source_id" VARCHAR(64) NOT NULL,
    "phase" VARCHAR(40) NOT NULL,
    "error_code" VARCHAR(80),
    "error_message" TEXT NOT NULL,
    "safe_context" JSONB,
    "attempt_count" INTEGER NOT NULL DEFAULT 1,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "data_migration_failures_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "data_migration_failures_attempt_count_check" CHECK ("attempt_count" > 0),
    CONSTRAINT "data_migration_failures_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "data_migration_runs"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "data_migration_runs_migration_key_key" ON "data_migration_runs"("migration_key");
CREATE INDEX "data_migration_runs_status_started_at_idx" ON "data_migration_runs"("status", "started_at");
CREATE UNIQUE INDEX "data_migration_checkpoints_run_collection_phase_key" ON "data_migration_checkpoints"("run_id", "source_collection", "phase");
CREATE INDEX "data_migration_checkpoints_run_complete_idx" ON "data_migration_checkpoints"("run_id", "is_complete");
CREATE UNIQUE INDEX "data_migration_id_maps_source_target_key" ON "data_migration_id_maps"("source_collection", "source_id", "target_table");
CREATE INDEX "data_migration_id_maps_target_idx" ON "data_migration_id_maps"("target_table", "target_id");
CREATE UNIQUE INDEX "data_migration_failures_run_source_phase_key" ON "data_migration_failures"("run_id", "source_collection", "source_id", "phase");
CREATE INDEX "data_migration_failures_run_resolved_idx" ON "data_migration_failures"("run_id", "resolved_at");
