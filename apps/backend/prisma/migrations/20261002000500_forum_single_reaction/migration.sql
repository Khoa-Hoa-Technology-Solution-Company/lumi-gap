BEGIN;

LOCK TABLE "forum_reactions" IN SHARE ROW EXCLUSIVE MODE;

-- A member's most recent choice becomes their only reaction on each target.
WITH choices AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY target_type, target_id, user_id
    ORDER BY created_at DESC, id DESC
  ) AS position
  FROM forum_reactions
)
DELETE FROM forum_reactions
USING choices
WHERE forum_reactions.id = choices.id AND choices.position > 1;

CREATE UNIQUE INDEX "forum_reactions_target_type_target_id_user_id_key"
  ON "forum_reactions"("target_type", "target_id", "user_id");
DROP INDEX "forum_reactions_target_type_target_id_user_id_reaction_key";

COMMIT;
