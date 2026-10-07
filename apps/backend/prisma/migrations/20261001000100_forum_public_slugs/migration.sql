ALTER TABLE "forum_posts" ADD COLUMN "public_slug" VARCHAR(280);

WITH normalized AS (
  SELECT
    id,
    COALESCE(
      NULLIF(TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(title), '[^a-z0-9]+', '-', 'g')), ''),
      'discussion'
    ) AS base_slug
  FROM "forum_posts"
)
UPDATE "forum_posts" AS post
SET "public_slug" = LEFT(normalized.base_slug, 260) || '-' || LEFT(REPLACE(post.id::text, '-', ''), 12)
FROM normalized
WHERE normalized.id = post.id;

CREATE UNIQUE INDEX "forum_posts_public_slug_key" ON "forum_posts"("public_slug");
