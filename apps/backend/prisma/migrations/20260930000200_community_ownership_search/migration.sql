-- Owners get an explicit "owner" membership role instead of "moderator".
UPDATE "community_memberships" AS membership
SET "role" = 'owner'
FROM "communities" AS community
WHERE membership."community_id" = community."id"
  AND membership."user_id" = community."owner_id"
  AND membership."role" <> 'owner';

-- Every community has exactly one owner membership row (repair legacy rows that lost it).
INSERT INTO "community_memberships" ("id", "community_id", "user_id", "role", "status", "updated_at")
SELECT gen_random_uuid(), community."id", community."owner_id", 'owner', 'active', CURRENT_TIMESTAMP
FROM "communities" AS community
WHERE NOT EXISTS (
  SELECT 1 FROM "community_memberships" AS membership
  WHERE membership."community_id" = community."id" AND membership."user_id" = community."owner_id"
);

UPDATE "communities" AS community
SET "member_count" = (
  SELECT COUNT(*)::INTEGER FROM "community_memberships" AS membership
  WHERE membership."community_id" = community."id" AND membership."status" = 'active'
);

CREATE UNIQUE INDEX "community_memberships_one_owner_idx"
  ON "community_memberships"("community_id") WHERE "role" = 'owner';

-- Accent-insensitive search (Vietnamese without diacritics, etc.).
CREATE EXTENSION IF NOT EXISTS unaccent;
