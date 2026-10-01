CREATE INDEX "forum_comments_post_id_status_author_id_created_at_idx"
  ON "forum_comments"("post_id", "status", "author_id", "created_at");
