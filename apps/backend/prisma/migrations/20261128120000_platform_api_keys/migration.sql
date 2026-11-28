-- Admin-managed pool of platform API keys (Gemini, OpenAlex) with automatic failover between keys.
CREATE TABLE "platform_api_keys" (
  "id" UUID NOT NULL,
  "provider" VARCHAR(16) NOT NULL,
  "label" VARCHAR(100) NOT NULL,
  "encrypted_key" TEXT NOT NULL,
  "key_hint" VARCHAR(8) NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "is_enabled" BOOLEAN NOT NULL DEFAULT true,
  "cooldown_until" TIMESTAMPTZ(6),
  "invalid_at" TIMESTAMPTZ(6),
  "last_error" TEXT,
  "last_error_at" TIMESTAMPTZ(6),
  "last_used_at" TIMESTAMPTZ(6),
  "success_count" BIGINT NOT NULL DEFAULT 0,
  "failure_count" INTEGER NOT NULL DEFAULT 0,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "platform_api_keys_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_api_keys_provider_check" CHECK ("provider" IN ('GEMINI', 'OPENALEX')),
  CONSTRAINT "platform_api_keys_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX "platform_api_keys_provider_priority_idx" ON "platform_api_keys"("provider", "priority");
