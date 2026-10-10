-- Visibility is independent of provider ownership. Manual, admin and system
-- profile links do not prove an OAuth connection.
ALTER TABLE "academic_identity_links"
  ADD COLUMN "verification_status" VARCHAR(24) NOT NULL DEFAULT 'UNVERIFIED';

UPDATE "academic_identity_links"
SET "verification_status" = 'PROVIDER_CONNECTED'
WHERE "provider" = 'ORCID'
  AND "connection_method" = 'OAUTH'
  AND "status" IN ('CONNECTED', 'LINKED');

ALTER TABLE "academic_identity_links"
  ADD CONSTRAINT "academic_identity_links_verification_status_check"
    CHECK ("verification_status" IN ('UNVERIFIED', 'PROVIDER_CONNECTED')),
  ADD CONSTRAINT "academic_identity_links_provider_connection_check"
    CHECK ("verification_status" <> 'PROVIDER_CONNECTED'
      OR ("provider" = 'ORCID' AND "connection_method" = 'OAUTH'
        AND "status" IN ('CONNECTED', 'LINKED')));

CREATE UNIQUE INDEX "academic_identity_links_one_orcid_per_user"
  ON "academic_identity_links" ("user_id") WHERE "provider" = 'ORCID';
