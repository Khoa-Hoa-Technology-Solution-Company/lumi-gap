ALTER TABLE "project_invitations"
  ADD COLUMN IF NOT EXISTS "token_hash" VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS "project_invitations_token_hash_key"
  ON "project_invitations"("token_hash")
  WHERE "token_hash" IS NOT NULL;
