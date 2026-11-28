-- Additive migration: preserve exact citation numbers, source coverage provenance, and chat idempotency keys.
ALTER TABLE "project_chat_messages"
  ADD COLUMN IF NOT EXISTS "client_key" UUID,
  ADD COLUMN IF NOT EXISTS "retrieval_meta" JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS "project_chat_messages_project_id_user_id_scope_role_client_key_key"
  ON "project_chat_messages"("project_id", "user_id", "scope", "role", "client_key");

ALTER TABLE "project_chat_citations"
  ADD COLUMN IF NOT EXISTS "citation_number" INTEGER,
  ADD COLUMN IF NOT EXISTS "source_kind" VARCHAR(24),
  ADD COLUMN IF NOT EXISTS "excerpt" TEXT,
  ADD COLUMN IF NOT EXISTS "page_number" INTEGER,
  ADD COLUMN IF NOT EXISTS "chunk_id" UUID;
