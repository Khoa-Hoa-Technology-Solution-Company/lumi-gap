CREATE TABLE "user_ai_connections" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "provider" VARCHAR(24) NOT NULL,
  "base_url" TEXT NOT NULL,
  "encrypted_key" TEXT,
  "model" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "user_ai_connections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_ai_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "user_ai_connections_user_id_idx" ON "user_ai_connections"("user_id");
CREATE TABLE "user_ai_preferences" (
  "user_id" UUID NOT NULL,
  "connection_id" UUID,
  CONSTRAINT "user_ai_preferences_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "user_ai_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "user_ai_preferences_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "user_ai_connections"("id") ON DELETE SET NULL
);
