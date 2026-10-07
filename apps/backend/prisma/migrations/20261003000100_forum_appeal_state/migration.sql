ALTER TABLE "forum_moderation_actions" ADD COLUMN IF NOT EXISTS "previous_state" JSONB;

-- Old response reports can contain both identifiers. The target is the response.
UPDATE "forum_content_reports"
SET "target_type" = 'RESPONSE', "target_id" = "comment_id"
WHERE "comment_id" IS NOT NULL AND "target_id" IS DISTINCT FROM "comment_id";
