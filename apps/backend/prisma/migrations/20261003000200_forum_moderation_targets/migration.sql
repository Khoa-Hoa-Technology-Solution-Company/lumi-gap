BEGIN;

-- A response has one canonical target and may carry its parent discussion as
-- context. A moderation action may also retain the report that triggered it.
ALTER TABLE "forum_content_reports"
  DROP CONSTRAINT "forum_content_reports_exactly_one_target_check";
ALTER TABLE "forum_content_reports"
  ADD CONSTRAINT "forum_content_reports_canonical_target_check" CHECK ((
    ("target_id" IS NULL AND num_nonnulls("post_id", "comment_id") = 1)
    OR ("target_id" IS NOT NULL AND (
      ("target_type" = 'THREAD' AND "post_id" IS NOT NULL AND "target_id" = "post_id" AND "comment_id" IS NULL)
      OR ("target_type" = 'RESPONSE' AND "comment_id" IS NOT NULL AND "target_id" = "comment_id")
    ))
  ) IS TRUE);

ALTER TABLE "forum_moderation_actions"
  DROP CONSTRAINT "forum_moderation_actions_one_target_check";
ALTER TABLE "forum_moderation_actions"
  ADD CONSTRAINT "forum_moderation_actions_canonical_target_check" CHECK ((
    ("target_type" IS NULL AND "target_id" IS NULL AND num_nonnulls("post_id", "comment_id", "report_id") = 1)
    OR ("target_type" = 'THREAD' AND "target_id" IS NOT NULL AND "post_id" IS NOT NULL AND "target_id" = "post_id" AND "comment_id" IS NULL)
    OR ("target_type" = 'RESPONSE' AND "target_id" IS NOT NULL AND "comment_id" IS NOT NULL AND "target_id" = "comment_id")
  ) IS TRUE);

COMMIT;
