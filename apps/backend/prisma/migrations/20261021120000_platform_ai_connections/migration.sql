-- Platform-wide AI connection managed by admins (text generation only; embeddings stay on the env Gemini key).
CREATE TABLE "platform_ai_connections" (
  "id" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "provider" VARCHAR(24) NOT NULL,
  "base_url" TEXT NOT NULL,
  "encrypted_key" TEXT,
  "fast_model" TEXT NOT NULL,
  "deep_model" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT false,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "platform_ai_connections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_ai_connections_provider_check" CHECK ("provider" IN ('gemini', 'openai-compatible')),
  CONSTRAINT "platform_ai_connections_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL
);
-- At most one active connection.
CREATE UNIQUE INDEX "platform_ai_connections_single_active_idx" ON "platform_ai_connections"("is_active") WHERE "is_active";
