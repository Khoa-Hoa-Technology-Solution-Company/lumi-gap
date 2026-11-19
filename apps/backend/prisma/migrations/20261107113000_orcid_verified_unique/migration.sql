-- Enforce that one authenticated ORCID iD (verification_status = 'PROVIDER_CONNECTED')
-- can only be linked to a single LumiGap user account at a time.
-- Self-declared manual ORCID entries (verification_status = 'UNVERIFIED') do not block
-- the legitimate ORCID owner from completing OAuth verification.

WITH duplicate_verified_orcid AS (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "identifier"
           ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
         ) AS rn
  FROM "academic_identity_links"
  WHERE "provider" = 'ORCID'
    AND "verification_status" = 'PROVIDER_CONNECTED'
    AND "identifier" IS NOT NULL
)
UPDATE "academic_identity_links"
SET "connection_method" = 'MANUAL',
    "status" = 'SELF_DECLARED',
    "verification_status" = 'UNVERIFIED',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "id" IN (
  SELECT "id" FROM duplicate_verified_orcid WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "academic_identity_links_verified_orcid_unique"
  ON "academic_identity_links" ("identifier")
  WHERE "provider" = 'ORCID'
    AND "verification_status" = 'PROVIDER_CONNECTED'
    AND "identifier" IS NOT NULL;
