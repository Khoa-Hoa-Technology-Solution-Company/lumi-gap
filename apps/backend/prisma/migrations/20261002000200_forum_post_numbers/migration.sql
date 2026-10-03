ALTER TABLE "forum_comments" ADD COLUMN "post_number" INTEGER;

-- Reserve 1 for the opening post. Include hidden and deleted replies so their
-- removal never changes a link to a later reply.
WITH numbered AS (
  SELECT id, (ROW_NUMBER() OVER (PARTITION BY post_id ORDER BY created_at, id) + 1)::integer AS number
  FROM forum_comments
)
UPDATE forum_comments AS comment SET post_number = numbered.number
FROM numbered WHERE comment.id = numbered.id;

ALTER TABLE "forum_comments" ALTER COLUMN "post_number" SET NOT NULL;
ALTER TABLE "forum_comments" ADD CONSTRAINT "forum_comments_post_number_check" CHECK ("post_number" >= 2);
CREATE UNIQUE INDEX "forum_comments_post_id_post_number_key" ON "forum_comments"("post_id", "post_number");
