-- LumiGap identity/authentication redesign.
-- Legacy role/profile columns remain temporarily for API compatibility; all new
-- authorization decisions use system_role, account_status and capabilities.

ALTER TABLE "users"
  ADD COLUMN "system_role" VARCHAR(32) NOT NULL DEFAULT 'RESEARCH_USER',
  ADD COLUMN "account_status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "email_verified_at" TIMESTAMPTZ(6),
  ADD COLUMN "last_login_at" TIMESTAMPTZ(6),
  ADD COLUMN "onboarding_completed_at" TIMESTAMPTZ(6);

UPDATE "users"
SET "system_role" = CASE WHEN lower("role") = 'admin' THEN 'ADMIN' ELSE 'RESEARCH_USER' END,
    "account_status" = CASE WHEN "is_active" THEN 'ACTIVE' ELSE 'DISABLED' END,
    "email_verified_at" = CASE WHEN "google_id" IS NOT NULL THEN COALESCE("updated_at", CURRENT_TIMESTAMP) ELSE NULL END;

ALTER TABLE "users"
  ADD CONSTRAINT "users_system_role_check" CHECK ("system_role" IN ('RESEARCH_USER', 'ADMIN')),
  ADD CONSTRAINT "users_account_status_check" CHECK ("account_status" IN ('ACTIVE', 'SUSPENDED', 'DISABLED'));

CREATE INDEX "users_system_role_account_status_idx" ON "users"("system_role", "account_status");

ALTER TABLE "refresh_tokens"
  ADD COLUMN "family_id" UUID,
  ADD COLUMN "rotated_to_id" UUID,
  ADD COLUMN "revocation_reason" VARCHAR(64),
  ADD COLUMN "last_used_at" TIMESTAMPTZ(6);

UPDATE "refresh_tokens" SET "family_id" = gen_random_uuid() WHERE "family_id" IS NULL;
ALTER TABLE "refresh_tokens" ALTER COLUMN "family_id" SET NOT NULL;
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

ALTER TABLE "academic_profiles"
  ADD COLUMN "primary_position" VARCHAR(40),
  ADD COLUMN "identity_status" VARCHAR(24) NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "email_status" VARCHAR(24) NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "affiliation_status" VARCHAR(24) NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "position_status" VARCHAR(24) NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "orcid_status" VARCHAR(24) NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "onboarding_completed_at" TIMESTAMPTZ(6);

UPDATE "academic_profiles" ap
SET "primary_position" = CASE lower(COALESCE(u."academic_profile_type", u."role"))
      WHEN 'student' THEN 'STUDENT'
      WHEN 'lecturer' THEN 'LECTURER'
      WHEN 'researcher' THEN 'OTHER'
      ELSE NULL
    END,
    "email_status" = CASE WHEN u."email_verified_at" IS NOT NULL THEN 'VERIFIED' ELSE 'UNVERIFIED' END,
    "identity_status" = CASE WHEN u."email_verified_at" IS NOT NULL THEN 'VERIFIED' ELSE 'UNVERIFIED' END,
    "position_status" = CASE WHEN ap."verification_status" = 'VERIFIED' THEN 'VERIFIED' ELSE 'UNVERIFIED' END,
    "affiliation_status" = CASE WHEN ap."institutional_email_verified_at" IS NOT NULL THEN 'VERIFIED' ELSE 'UNVERIFIED' END,
    "onboarding_completed_at" = CASE
      WHEN COALESCE(u."institution", '') <> '' AND lower(COALESCE(u."academic_profile_type", u."role")) IN ('student', 'lecturer', 'researcher')
      THEN COALESCE(ap."updated_at", CURRENT_TIMESTAMP)
      ELSE NULL
    END
FROM "users" u
WHERE u."id" = ap."user_id";

UPDATE "academic_profiles" ap
SET "orcid_status" = CASE WHEN EXISTS (
  SELECT 1 FROM "academic_external_identities" ai
  WHERE ai."profile_id" = ap."id" AND ai."provider" = 'ORCID' AND ai."status" IN ('LINKED', 'VERIFIED')
) THEN 'VERIFIED' ELSE 'UNVERIFIED' END;

ALTER TABLE "academic_profiles"
  ADD CONSTRAINT "academic_profiles_primary_position_check" CHECK ("primary_position" IS NULL OR "primary_position" IN ('STUDENT', 'LECTURER', 'RESEARCH_STAFF', 'INDUSTRY_PRACTITIONER', 'OTHER')),
  ADD CONSTRAINT "academic_profiles_identity_status_check" CHECK ("identity_status" IN ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED')),
  ADD CONSTRAINT "academic_profiles_email_status_check" CHECK ("email_status" IN ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED')),
  ADD CONSTRAINT "academic_profiles_affiliation_status_check" CHECK ("affiliation_status" IN ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED')),
  ADD CONSTRAINT "academic_profiles_position_status_check" CHECK ("position_status" IN ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED')),
  ADD CONSTRAINT "academic_profiles_orcid_status_check" CHECK ("orcid_status" IN ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED'));

CREATE INDEX "academic_profiles_primary_position_position_status_idx" ON "academic_profiles"("primary_position", "position_status");

CREATE TABLE "affiliations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "institution_name" VARCHAR(200) NOT NULL,
  "institution_domain" VARCHAR(255),
  "ror_id" VARCHAR(64),
  "department" VARCHAR(200),
  "academic_title" VARCHAR(120),
  "affiliation_type" VARCHAR(24) NOT NULL DEFAULT 'EXTERNAL',
  "verification_status" VARCHAR(24) NOT NULL DEFAULT 'UNVERIFIED',
  "verification_source" VARCHAR(48) NOT NULL DEFAULT 'SELF_DECLARED',
  "is_primary" BOOLEAN NOT NULL DEFAULT true,
  "valid_from" DATE,
  "valid_until" DATE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "affiliations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "affiliations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "affiliations_type_check" CHECK ("affiliation_type" IN ('INTERNAL', 'EXTERNAL')),
  CONSTRAINT "affiliations_status_check" CHECK ("verification_status" IN ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED'))
);
CREATE INDEX "affiliations_user_id_is_primary_idx" ON "affiliations"("user_id", "is_primary");
CREATE INDEX "affiliations_type_status_idx" ON "affiliations"("affiliation_type", "verification_status");
CREATE UNIQUE INDEX "affiliations_one_primary_per_user" ON "affiliations"("user_id") WHERE "is_primary" = true;

INSERT INTO "affiliations" (
  "user_id", "institution_name", "institution_domain", "ror_id", "department", "academic_title",
  "affiliation_type", "verification_status", "verification_source", "is_primary", "created_at", "updated_at"
)
SELECT u."id", u."institution",
  CASE WHEN ap."institutional_email" LIKE '%@%' THEN lower(split_part(ap."institutional_email", '@', 2)) ELSE NULL END,
  ap."affiliation_ror_id", ap."affiliation_department", ap."academic_title",
  CASE
    WHEN ap."institutional_email_verified_at" IS NOT NULL
      AND lower(split_part(ap."institutional_email", '@', 2)) IN ('fpt.edu.vn', 'fe.edu.vn')
    THEN 'INTERNAL' ELSE 'EXTERNAL'
  END,
  CASE WHEN ap."institutional_email_verified_at" IS NOT NULL THEN 'VERIFIED' ELSE 'UNVERIFIED' END,
  CASE WHEN ap."institutional_email_verified_at" IS NOT NULL THEN 'EMAIL' ELSE 'SELF_DECLARED' END,
  true, u."created_at", CURRENT_TIMESTAMP
FROM "users" u
LEFT JOIN "academic_profiles" ap ON ap."user_id" = u."id"
WHERE COALESCE(u."institution", '') <> '';

CREATE TABLE "verification_evidence" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "academic_profile_id" UUID,
  "verification_type" VARCHAR(40) NOT NULL,
  "source_type" VARCHAR(48) NOT NULL,
  "source_reference" VARCHAR(500),
  "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  "reviewed_by_id" UUID,
  "reviewed_at" TIMESTAMPTZ(6),
  "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6),
  "rejection_reason" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "verification_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "verification_evidence_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "verification_evidence_profile_id_fkey" FOREIGN KEY ("academic_profile_id") REFERENCES "academic_profiles"("id") ON DELETE CASCADE,
  CONSTRAINT "verification_evidence_reviewer_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "verification_evidence_status_check" CHECK ("status" IN ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED'))
);
CREATE INDEX "verification_evidence_user_type_status_idx" ON "verification_evidence"("user_id", "verification_type", "status");
CREATE INDEX "verification_evidence_status_submitted_at_idx" ON "verification_evidence"("status", "submitted_at");

CREATE TABLE "user_capabilities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "capability" VARCHAR(48) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  "source" VARCHAR(48) NOT NULL,
  "granted_by_id" UUID,
  "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_capabilities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_capabilities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "user_capabilities_granted_by_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "user_capabilities_name_check" CHECK ("capability" IN ('BASIC_RESEARCH', 'RESEARCH_SUPPORT', 'STRUCTURED_REVIEW', 'GAP_VALIDATION')),
  CONSTRAINT "user_capabilities_status_check" CHECK ("status" IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
  CONSTRAINT "user_capabilities_user_capability_key" UNIQUE ("user_id", "capability")
);
CREATE INDEX "user_capabilities_capability_status_idx" ON "user_capabilities"("capability", "status");

INSERT INTO "user_capabilities" ("user_id", "capability", "status", "source")
SELECT "id", 'BASIC_RESEARCH', 'ACTIVE', 'SYSTEM_POLICY' FROM "users" WHERE "account_status" = 'ACTIVE';

CREATE TABLE "oauth_accounts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "provider" VARCHAR(32) NOT NULL,
  "provider_account_id" VARCHAR(255) NOT NULL,
  "email" VARCHAR(320),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "oauth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "oauth_accounts_provider_account_key" UNIQUE ("provider", "provider_account_id")
);
CREATE INDEX "oauth_accounts_user_id_idx" ON "oauth_accounts"("user_id");
INSERT INTO "oauth_accounts" ("user_id", "provider", "provider_account_id", "email")
SELECT "id", 'GOOGLE', "google_id", "email" FROM "users" WHERE "google_id" IS NOT NULL
ON CONFLICT ("provider", "provider_account_id") DO NOTHING;

CREATE TABLE "email_verification_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "email_verification_tokens_hash_key" UNIQUE ("token_hash")
);
CREATE INDEX "email_verification_tokens_user_expiry_idx" ON "email_verification_tokens"("user_id", "expires_at");

CREATE TABLE "password_reset_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "password_reset_tokens_hash_key" UNIQUE ("token_hash")
);
CREATE INDEX "password_reset_tokens_user_expiry_idx" ON "password_reset_tokens"("user_id", "expires_at");

