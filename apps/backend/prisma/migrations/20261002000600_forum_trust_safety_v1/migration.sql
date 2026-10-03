BEGIN;

ALTER TABLE "community_memberships"
  ADD COLUMN IF NOT EXISTS "assigned_by_id" UUID,
  ADD COLUMN IF NOT EXISTS "assigned_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "revoked_at" TIMESTAMPTZ(6);

ALTER TABLE "forum_posts"
  ADD COLUMN IF NOT EXISTS "visibility_status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "is_locked" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "moderation_version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "forum_comments"
  ADD COLUMN IF NOT EXISTS "visibility_status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "is_locked" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "moderation_version" INTEGER NOT NULL DEFAULT 0;

UPDATE "forum_posts"
SET "visibility_status" = CASE WHEN "status" IN ('hidden', 'deleted') THEN UPPER("status") ELSE 'ACTIVE' END,
    "is_locked" = ("status" = 'locked')
WHERE "visibility_status" = 'ACTIVE' AND ("status" <> 'active' OR "status" IS NULL);

UPDATE "forum_comments"
SET "visibility_status" = CASE WHEN "status" IN ('hidden', 'deleted') THEN UPPER("status") ELSE 'ACTIVE' END
WHERE "visibility_status" = 'ACTIVE' AND ("status" <> 'active' OR "status" IS NULL);

ALTER TABLE "forum_moderation_actions"
  ADD COLUMN IF NOT EXISTS "target_type" VARCHAR(16),
  ADD COLUMN IF NOT EXISTS "target_id" UUID,
  ADD COLUMN IF NOT EXISTS "user_id" UUID,
  ADD COLUMN IF NOT EXISTS "source_appeal_id" UUID,
  ADD COLUMN IF NOT EXISTS "policy_rule_code" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "policy_version" VARCHAR(40);

ALTER TABLE "forum_content_reports"
  ADD COLUMN IF NOT EXISTS "target_type" VARCHAR(16) NOT NULL DEFAULT 'THREAD',
  ADD COLUMN IF NOT EXISTS "target_id" UUID,
  ADD COLUMN IF NOT EXISTS "assigned_to_id" UUID,
  ADD COLUMN IF NOT EXISTS "assigned_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "claim_expires_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "reported_revision_id" UUID,
  ADD COLUMN IF NOT EXISTS "content_snapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "resolved_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "resolution_note" TEXT,
  ADD COLUMN IF NOT EXISTS "escalated_at" TIMESTAMPTZ(6);

UPDATE "forum_content_reports"
SET "target_type" = CASE WHEN "comment_id" IS NULL THEN 'THREAD' ELSE 'RESPONSE' END,
    "target_id" = COALESCE("post_id", "comment_id")
WHERE "target_id" IS NULL;

-- Preserve the newest active report if old data contains duplicates before the
-- partial unique index is installed.
WITH duplicates AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY reporter_id, target_type, target_id
    ORDER BY created_at DESC, id DESC
  ) AS row_number
  FROM "forum_content_reports"
  WHERE target_id IS NOT NULL AND status IN ('open', 'claimed', 'under_review', 'escalated')
)
UPDATE "forum_content_reports" reports
SET status = 'dismissed', resolved_at = CURRENT_TIMESTAMP,
    resolution_note = 'Superseded by a newer active report during moderation migration.'
FROM duplicates
WHERE reports.id = duplicates.id AND duplicates.row_number > 1;

CREATE INDEX IF NOT EXISTS "forum_content_reports_assigned_to_id_status_created_at_idx"
  ON "forum_content_reports"("assigned_to_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "forum_content_reports_target_type_target_id_status_idx"
  ON "forum_content_reports"("target_type", "target_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "forum_content_reports_active_reporter_target_key"
  ON "forum_content_reports"("reporter_id", "target_type", "target_id")
  WHERE "target_id" IS NOT NULL
    AND "status" IN ('open', 'claimed', 'under_review', 'escalated');

CREATE TABLE IF NOT EXISTS "forum_restrictions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "scope" VARCHAR(16) NOT NULL,
  "community_id" UUID,
  "restriction_type" VARCHAR(24) NOT NULL,
  "reason" TEXT NOT NULL,
  "starts_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6),
  "created_by" UUID NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "revoked_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "forum_restrictions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "forum_restrictions_user_id_restriction_type_idx"
  ON "forum_restrictions"("user_id", "restriction_type", "starts_at", "expires_at");
CREATE INDEX IF NOT EXISTS "forum_restrictions_community_id_restriction_type_idx"
  ON "forum_restrictions"("community_id", "restriction_type", "starts_at", "expires_at");

CREATE TABLE IF NOT EXISTS "moderation_appeals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "moderation_action_id" UUID NOT NULL,
  "appellant_id" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'SUBMITTED',
  "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submit_deadline_at" TIMESTAMPTZ(6) NOT NULL,
  "reviewed_by" UUID,
  "reviewed_at" TIMESTAMPTZ(6),
  "decision_reason" TEXT,
  "sole_admin_exception" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "moderation_appeals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "moderation_appeals_moderation_action_id_key"
  ON "moderation_appeals"("moderation_action_id");
CREATE INDEX IF NOT EXISTS "moderation_appeals_appellant_id_status_submitted_at_idx"
  ON "moderation_appeals"("appellant_id", "status", "submitted_at");
CREATE INDEX IF NOT EXISTS "moderation_appeals_status_submitted_at_idx"
  ON "moderation_appeals"("status", "submitted_at");

CREATE TABLE IF NOT EXISTS "copyright_claims" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "claimant_name" VARCHAR(200) NOT NULL,
  "claimant_email" VARCHAR(320) NOT NULL,
  "claimant_organization" VARCHAR(240),
  "target_type" VARCHAR(16) NOT NULL,
  "target_id" UUID NOT NULL,
  "copyrighted_work_description" TEXT NOT NULL,
  "ownership_basis" TEXT NOT NULL,
  "original_source_url" TEXT,
  "details" TEXT NOT NULL,
  "source_report_id" UUID,
  "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING_EMAIL_VERIFICATION',
  "assigned_to" UUID,
  "email_verification_token_hash" TEXT,
  "email_verification_expires_at" TIMESTAMPTZ(6),
  "email_verified_at" TIMESTAMPTZ(6),
  "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMPTZ(6),
  "resolution_note" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "copyright_claims_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "copyright_claims_email_verification_token_hash_key"
  ON "copyright_claims"("email_verification_token_hash")
  WHERE "email_verification_token_hash" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "copyright_claims_status_submitted_at_idx"
  ON "copyright_claims"("status", "submitted_at");
CREATE INDEX IF NOT EXISTS "copyright_claims_target_type_target_id_idx"
  ON "copyright_claims"("target_type", "target_id");
CREATE INDEX IF NOT EXISTS "copyright_claims_source_report_id_idx"
  ON "copyright_claims"("source_report_id");

COMMIT;
