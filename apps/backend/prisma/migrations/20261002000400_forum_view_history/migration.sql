ALTER TABLE "forum_posts"
  ADD COLUMN "views_tracked_since" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Older lifetime totals have no daily breakdown. Start recording daily counts
-- from this migration instead of attributing historical views to invented days.
CREATE TABLE "forum_post_daily_views" (
  "post_id" UUID NOT NULL,
  "day" DATE NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "forum_post_daily_views_pkey" PRIMARY KEY ("post_id", "day"),
  CONSTRAINT "forum_post_daily_views_count_check" CHECK ("count" >= 0),
  CONSTRAINT "forum_post_daily_views_post_id_fkey" FOREIGN KEY ("post_id")
    REFERENCES "forum_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
