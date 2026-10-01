UPDATE "forum_posts" AS post
SET "comment_count" = (
  SELECT COUNT(*)::INTEGER FROM "forum_comments" AS comment
  WHERE comment."post_id" = post."id" AND comment."status" = 'active'
);

-- Votes/views also touch updated_at; only creation and content edits are activity.
UPDATE "forum_posts" AS post
SET "last_activity_at" = GREATEST(
  post."created_at",
  COALESCE(post."edited_at", post."created_at"),
  COALESCE((SELECT MAX(GREATEST(comment."created_at", COALESCE(comment."edited_at", comment."created_at")))
   FROM "forum_comments" AS comment
   WHERE comment."post_id" = post."id" AND comment."status" = 'active'), post."created_at")
);

UPDATE "forum_posts" AS post SET "accepted_comment_id" = NULL
WHERE "accepted_comment_id" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "forum_comments" AS comment
  WHERE comment."id" = post."accepted_comment_id" AND comment."status" = 'active'
);
