CREATE TABLE "github_connections" (
  "user_id" UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "github_user_id" VARCHAR(32),
  "login" VARCHAR(100),
  "encrypted_access_token" TEXT,
  "encrypted_refresh_token" TEXT,
  "expires_at" TIMESTAMPTZ(6),
  "refresh_expires_at" TIMESTAMPTZ(6),
  "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision" >= 0),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "github_token_size" CHECK (
    length("encrypted_access_token") <= 8192 AND length("encrypted_refresh_token") <= 8192
  )
);
