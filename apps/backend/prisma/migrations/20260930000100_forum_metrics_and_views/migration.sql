ALTER TABLE "forum_posts" ADD COLUMN "last_activity_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "forum_posts" AS post
SET "last_activity_at" = GREATEST(
  post."updated_at",
  COALESCE((SELECT MAX(comment."updated_at") FROM "forum_comments" AS comment WHERE comment."post_id" = post."id" AND comment."status" = 'active'), post."updated_at")
);

CREATE INDEX "forum_posts_status_is_pinned_last_activity_at_idx"
  ON "forum_posts"("status", "is_pinned", "last_activity_at");

CREATE TABLE "forum_post_views" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "post_id" UUID NOT NULL,
  "viewer_key" VARCHAR(160) NOT NULL,
  "bucket" INTEGER NOT NULL,
  "viewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "forum_post_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "forum_post_views_post_id_viewer_key_bucket_key"
  ON "forum_post_views"("post_id", "viewer_key", "bucket");
CREATE INDEX "forum_post_views_post_id_viewed_at_idx"
  ON "forum_post_views"("post_id", "viewed_at");
ALTER TABLE "forum_post_views"
  ADD CONSTRAINT "forum_post_views_post_id_fkey"
  FOREIGN KEY ("post_id") REFERENCES "forum_posts"("id") ON DELETE CASCADE;
