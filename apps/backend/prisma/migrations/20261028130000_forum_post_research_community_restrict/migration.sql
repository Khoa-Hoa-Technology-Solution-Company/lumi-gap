-- ON DELETE SET NULL would turn the posts of a hard-deleted private community into public category posts.
-- Refuse the delete instead; communities are archived, and their posts must be removed or moved first.
ALTER TABLE "forum_posts" DROP CONSTRAINT "forum_posts_research_community_id_fkey";
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_research_community_id_fkey"
  FOREIGN KEY ("research_community_id") REFERENCES "communities"("id") ON DELETE RESTRICT;
