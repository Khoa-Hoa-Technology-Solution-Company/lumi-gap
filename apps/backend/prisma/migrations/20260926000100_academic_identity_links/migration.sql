-- Flexible scholarly identity links. The legacy academic_external_identities
-- table remains available for old clients and verification evidence.
CREATE TABLE "academic_identity_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "label" VARCHAR(120),
    "identifier" VARCHAR(255),
    "profile_url" TEXT,
    "connection_method" VARCHAR(24) NOT NULL DEFAULT 'MANUAL',
    "status" VARCHAR(24) NOT NULL DEFAULT 'SELF_DECLARED',
    "visibility" VARCHAR(24) NOT NULL DEFAULT 'PUBLIC',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "academic_identity_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "academic_identity_links_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "academic_identity_links_provider_check"
      CHECK ("provider" IN ('ORCID', 'OPENALEX', 'GOOGLE_SCHOLAR', 'SEMANTIC_SCHOLAR', 'OTHER')),
    CONSTRAINT "academic_identity_links_connection_method_check"
      CHECK ("connection_method" IN ('MANUAL', 'OAUTH', 'SYSTEM', 'ADMIN')),
    CONSTRAINT "academic_identity_links_status_check"
      CHECK ("status" IN ('SELF_DECLARED', 'CONNECTED', 'LINKED', 'INVALID')),
    CONSTRAINT "academic_identity_links_visibility_check"
      CHECK ("visibility" IN ('PUBLIC', 'REGISTERED_USERS', 'PRIVATE')),
    CONSTRAINT "academic_identity_links_value_check"
      CHECK ("identifier" IS NOT NULL OR "profile_url" IS NOT NULL)
);

CREATE UNIQUE INDEX "academic_identity_links_user_provider_identifier_key"
  ON "academic_identity_links" ("user_id", "provider", "identifier");
CREATE UNIQUE INDEX "academic_identity_links_user_provider_value_key"
  ON "academic_identity_links" ("user_id", "provider", COALESCE("identifier", "profile_url", ''));
CREATE INDEX "academic_identity_links_user_provider_idx"
  ON "academic_identity_links" ("user_id", "provider");
CREATE INDEX "academic_identity_links_visibility_provider_idx"
  ON "academic_identity_links" ("visibility", "provider");

-- Backfill the academic providers already stored in the legacy profile table.
-- GitHub intentionally stays in the legacy external-profile surface.
INSERT INTO "academic_identity_links" (
  "user_id", "provider", "identifier", "profile_url", "connection_method", "status", "visibility", "created_at", "updated_at"
)
SELECT DISTINCT ON (u."id", old."provider", COALESCE(old."external_id", old."profile_url"))
  u."id",
  old."provider",
  old."external_id",
  old."profile_url",
  CASE old."source" WHEN 'OAUTH' THEN 'OAUTH' WHEN 'SYSTEM' THEN 'SYSTEM' WHEN 'ADMIN' THEN 'ADMIN' ELSE 'MANUAL' END,
  CASE old."status" WHEN 'LINKED' THEN 'LINKED' WHEN 'VERIFIED' THEN 'LINKED' ELSE 'SELF_DECLARED' END,
  CASE
    WHEN old."provider" = 'ORCID' AND ap."privacy_settings"->>'orcid' = 'PRIVATE' THEN 'PRIVATE'
    WHEN old."provider" = 'ORCID' AND ap."privacy_settings"->>'orcid' = 'REGISTERED_USERS' THEN 'REGISTERED_USERS'
    ELSE 'PUBLIC'
  END,
  COALESCE(old."linked_at", ap."created_at"),
  CURRENT_TIMESTAMP
FROM "academic_external_identities" old
JOIN "academic_profiles" ap ON ap."id" = old."profile_id"
JOIN "users" u ON u."id" = ap."user_id"
WHERE old."provider" IN ('ORCID', 'OPENALEX', 'GOOGLE_SCHOLAR', 'SEMANTIC_SCHOLAR', 'OTHER')
  AND (old."external_id" IS NOT NULL OR old."profile_url" IS NOT NULL)
ORDER BY u."id", old."provider", COALESCE(old."external_id", old."profile_url"), old."position", old."id";
