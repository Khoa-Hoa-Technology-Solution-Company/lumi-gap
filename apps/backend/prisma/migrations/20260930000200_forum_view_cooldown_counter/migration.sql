ALTER TABLE "forum_posts" ADD COLUMN "view_count" INTEGER NOT NULL DEFAULT 0;
UPDATE "forum_posts" AS post SET "view_count" = (
  SELECT COUNT(*)::INTEGER FROM "forum_post_views" AS view WHERE view."post_id" = post."id"
);

DELETE FROM "forum_post_views" AS view
USING "forum_post_views" AS newer
WHERE view."post_id" = newer."post_id"
  AND view."viewer_key" = newer."viewer_key"
  AND (view."viewed_at", view."id") < (newer."viewed_at", newer."id");

DROP INDEX "forum_post_views_post_id_viewer_key_bucket_key";
ALTER TABLE "forum_post_views" DROP COLUMN "bucket";
CREATE UNIQUE INDEX "forum_post_views_post_id_viewer_key_key"
  ON "forum_post_views"("post_id", "viewer_key");
