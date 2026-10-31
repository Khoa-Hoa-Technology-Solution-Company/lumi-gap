-- Anti-spam and community moderation for the forum.

-- A moderator who restores auto-hidden content exempts it from being auto-hidden again.
ALTER TABLE "forum_posts" ADD COLUMN "auto_hide_exempt_at" timestamptz(6);
ALTER TABLE "forum_comments" ADD COLUMN "auto_hide_exempt_at" timestamptz(6);

-- Duplicate-post detection: sha256 of the normalized body, filled on create and update.
ALTER TABLE "forum_posts" ADD COLUMN "body_hash" varchar(64);
CREATE INDEX "forum_posts_author_id_body_hash_created_at_idx" ON "forum_posts"("author_id", "body_hash", "created_at");

-- System actions (auto-hide) have no human actor. The existing foreign key stays; NULL skips it.
ALTER TABLE "forum_moderation_actions" ALTER COLUMN "actor_id" DROP NOT NULL;

-- Reports of a post in a research community are routed to that community's moderators.
ALTER TABLE "forum_content_reports" ADD COLUMN "research_community_id" uuid;
ALTER TABLE "forum_content_reports" ADD CONSTRAINT "forum_content_reports_research_community_id_fkey"
  FOREIGN KEY ("research_community_id") REFERENCES "communities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "forum_content_reports_research_community_id_status_created_at_idx"
  ON "forum_content_reports"("research_community_id", "status", "created_at");

UPDATE "forum_content_reports" r SET "research_community_id" = p."research_community_id"
FROM "forum_posts" p
WHERE r."post_id" = p."id" AND p."research_community_id" IS NOT NULL AND r."research_community_id" IS NULL;

UPDATE "forum_content_reports" r SET "research_community_id" = p."research_community_id"
FROM "forum_comments" c JOIN "forum_posts" p ON p."id" = c."post_id"
WHERE r."comment_id" = c."id" AND p."research_community_id" IS NOT NULL AND r."research_community_id" IS NULL;
