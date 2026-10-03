CREATE TABLE "forum_post_revisions" (
  "id" UUID NOT NULL,
  "post_id" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "body" TEXT NOT NULL,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "edited_by_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "forum_post_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "forum_post_revisions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "forum_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "forum_post_revisions_edited_by_id_fkey" FOREIGN KEY ("edited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "forum_post_revisions_post_id_revision_key"
  ON "forum_post_revisions"("post_id", "revision");
CREATE INDEX "forum_post_revisions_post_id_created_at_idx"
  ON "forum_post_revisions"("post_id", "created_at");
CREATE INDEX "forum_post_revisions_edited_by_id_created_at_idx"
  ON "forum_post_revisions"("edited_by_id", "created_at");

CREATE TABLE "forum_comment_revisions" (
  "id" UUID NOT NULL,
  "comment_id" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "body" TEXT NOT NULL,
  "edited_by_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "forum_comment_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "forum_comment_revisions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "forum_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "forum_comment_revisions_edited_by_id_fkey" FOREIGN KEY ("edited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "forum_comment_revisions_comment_id_revision_key"
  ON "forum_comment_revisions"("comment_id", "revision");
CREATE INDEX "forum_comment_revisions_comment_id_created_at_idx"
  ON "forum_comment_revisions"("comment_id", "created_at");
CREATE INDEX "forum_comment_revisions_edited_by_id_created_at_idx"
  ON "forum_comment_revisions"("edited_by_id", "created_at");
