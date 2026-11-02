-- Platform-wide embedding endpoint managed by admins, chosen independently of the text-generation connection.
CREATE TABLE "platform_embedding_connections" (
  "id" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "base_url" TEXT NOT NULL,
  "encrypted_key" TEXT,
  "model" TEXT NOT NULL,
  "verified_similarity" DOUBLE PRECISION,
  "is_active" BOOLEAN NOT NULL DEFAULT false,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "platform_embedding_connections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_embedding_connections_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL
);
-- At most one active connection.
CREATE UNIQUE INDEX "platform_embedding_connections_single_active_idx" ON "platform_embedding_connections"("is_active") WHERE "is_active";
