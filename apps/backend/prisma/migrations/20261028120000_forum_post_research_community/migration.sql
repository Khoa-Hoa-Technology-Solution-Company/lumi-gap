-- Optional research-community scope for forum posts. Every post keeps its required forum category
-- (communities.is_forum_category = true); a post may additionally belong to ONE research community.
ALTER TABLE "forum_posts" ADD COLUMN "research_community_id" uuid;
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_research_community_id_fkey"
  FOREIGN KEY ("research_community_id") REFERENCES "communities"("id") ON DELETE SET NULL;
CREATE INDEX "forum_posts_research_community_idx" ON "forum_posts"("research_community_id", "status", "created_at" DESC);

-- A CHECK cannot read another table, so a trigger keeps forum categories out of the research scope.
CREATE FUNCTION "forum_posts_research_community_guard"() RETURNS trigger AS $$
BEGIN
  IF NEW."research_community_id" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "communities" WHERE "id" = NEW."research_community_id" AND "is_forum_category"
  ) THEN
    RAISE EXCEPTION 'forum_posts.research_community_id must reference a research community, not a forum category'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "forum_posts_research_community_guard"
  BEFORE INSERT OR UPDATE OF "research_community_id" ON "forum_posts"
  FOR EACH ROW EXECUTE FUNCTION "forum_posts_research_community_guard"();

-- Data step: posts filed directly under a research community (seed leftovers from before categories)
-- keep that community as their research scope and move to the default category.
INSERT INTO "communities"("id", "name", "slug", "description", "owner_id", "is_forum_category", "sort_order", "updated_at")
SELECT gen_random_uuid(), 'General Research', 'general-research', 'Research discussions across fields.',
  c."owner_id", true, 6, now()
FROM "communities" c
WHERE c."is_forum_category" = true
  AND EXISTS (
    SELECT 1 FROM "forum_posts" p JOIN "communities" r ON r."id" = p."community_id"
    WHERE r."is_forum_category" = false
  )
ORDER BY c."sort_order", c."id" LIMIT 1
ON CONFLICT ("slug") DO NOTHING;
UPDATE "communities" SET "is_forum_category" = true WHERE "slug" = 'general-research' AND "visibility" = 'public';

UPDATE "forum_posts" p
SET "research_community_id" = p."community_id",
    "community_id" = (SELECT "id" FROM "communities" WHERE "slug" = 'general-research' AND "is_forum_category" = true)
WHERE p."research_community_id" IS NULL
  AND EXISTS (SELECT 1 FROM "communities" r WHERE r."id" = p."community_id" AND r."is_forum_category" = false)
  AND EXISTS (SELECT 1 FROM "communities" WHERE "slug" = 'general-research' AND "is_forum_category" = true);

-- thread_count of a research community = visible posts scoped to it; the default category absorbed the moved posts.
UPDATE "communities" c SET "thread_count" = (
  SELECT count(*)::int FROM "forum_posts" p
  WHERE p."research_community_id" = c."id" AND p."status" IN ('active', 'locked') AND p."visibility_status" = 'ACTIVE'
) WHERE c."is_forum_category" = false;
UPDATE "communities" c SET "thread_count" = (
  SELECT count(*)::int FROM "forum_posts" p
  WHERE p."community_id" = c."id" AND p."status" IN ('active', 'locked') AND p."visibility_status" = 'ACTIVE'
) WHERE c."slug" = 'general-research' AND c."is_forum_category" = true;
