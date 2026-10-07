CREATE TABLE "forum_reactions" (
  "id" UUID NOT NULL,
  "target_type" VARCHAR(16) NOT NULL,
  "target_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "reaction" VARCHAR(24) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "forum_reactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "forum_reactions_target_type_target_id_user_id_reaction_key"
  ON "forum_reactions"("target_type", "target_id", "user_id", "reaction");
CREATE INDEX "forum_reactions_target_type_target_id_reaction_idx"
  ON "forum_reactions"("target_type", "target_id", "reaction");
CREATE INDEX "forum_reactions_user_id_created_at_idx"
  ON "forum_reactions"("user_id", "created_at");
