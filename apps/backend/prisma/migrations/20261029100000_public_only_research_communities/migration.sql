-- Research communities are public-only. Forum categories keep using `visibility`.
UPDATE "communities" SET "visibility" = 'public' WHERE "is_forum_category" = false AND "visibility" <> 'public';

-- Join requests no longer exist: pending requests become active memberships, declined ones are removed.
-- `banned` rows stay. The status CHECK (pending/active/declined/banned) is left as is because forum categories share it.
UPDATE "community_memberships" m SET "status" = 'active' FROM "communities" c
WHERE m."community_id" = c."id" AND c."is_forum_category" = false AND m."status" = 'pending';

DELETE FROM "community_memberships" m USING "communities" c
WHERE m."community_id" = c."id" AND c."is_forum_category" = false AND m."status" = 'declined';

UPDATE "communities" c SET "member_count" = (
  SELECT count(*) FROM "community_memberships" m WHERE m."community_id" = c."id" AND m."status" = 'active'
) WHERE c."is_forum_category" = false;

ALTER TABLE "communities" ADD CONSTRAINT "communities_research_public_check" CHECK ("is_forum_category" OR "visibility" = 'public');
