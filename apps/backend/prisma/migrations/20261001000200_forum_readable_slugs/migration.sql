BEGIN;

ALTER TABLE "forum_posts" ADD COLUMN "public_slug_aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE INDEX "forum_posts_public_slug_aliases_idx" ON "forum_posts" USING GIN ("public_slug_aliases");

-- Reserve every published URL before changing canonical slugs. No content is removed.
UPDATE "forum_posts"
SET "public_slug_aliases" = ARRAY["public_slug"]
WHERE "public_slug" IS NOT NULL;
UPDATE "forum_posts" SET "public_slug" = NULL;

DO $$
DECLARE
  topic RECORD;
  base TEXT;
  candidate TEXT;
  suffix INTEGER;
BEGIN
  FOR topic IN SELECT id, title, public_slug_aliases FROM forum_posts ORDER BY created_at, id LOOP
    -- Existing generated slugs already contain the normalized title.
    base := regexp_replace(topic.public_slug_aliases[1], '-[a-f0-9]{12}$', '');
    IF base IS NULL OR base = '' THEN
      base := trim(both '-' from regexp_replace(lower(translate(topic.title, 'đĐ', 'dd')), '[^a-z0-9]+', '-', 'g'));
    END IF;
    base := rtrim(left(coalesce(nullif(base, ''), 'discussion'), 260), '-');
    candidate := base;
    suffix := 1;
    WHILE EXISTS (
      SELECT 1 FROM forum_posts
      WHERE id <> topic.id AND (public_slug = candidate OR candidate = ANY(public_slug_aliases))
    ) LOOP
      suffix := suffix + 1;
      candidate := base || '-' || suffix;
    END LOOP;
    UPDATE forum_posts SET public_slug = candidate WHERE id = topic.id;
  END LOOP;
END $$;

COMMIT;
