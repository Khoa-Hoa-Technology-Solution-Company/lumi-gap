-- Identity, academic-role, affiliation, verification and admission foundation.
-- Legacy display/profile columns remain during the client migration window, but
-- authorization and participant scope no longer depend on them.

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_system_role_check";
UPDATE "users" SET "system_role" = 'USER' WHERE "system_role" = 'RESEARCH_USER';
UPDATE "users" SET "system_role" = 'ADMIN' WHERE "system_role" = 'SUPER_ADMIN';
ALTER TABLE "users"
  ALTER COLUMN "system_role" SET DEFAULT 'USER',
  ADD COLUMN "admission_basis" VARCHAR(32) NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "admission_source_id" UUID,
  ADD COLUMN "admitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD CONSTRAINT "users_system_role_check" CHECK ("system_role" IN ('USER', 'ADMIN')),
  ADD CONSTRAINT "users_admission_basis_check" CHECK ("admission_basis" IN ('LEGACY', 'HOST_INSTITUTION', 'INVITATION', 'ADMIN'));

CREATE TABLE "user_emails" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "normalized_email" VARCHAR(320) NOT NULL,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "purpose" VARCHAR(32) NOT NULL DEFAULT 'ACCOUNT',
  "verified_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_emails_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_emails_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "user_emails_purpose_check" CHECK ("purpose" IN ('ACCOUNT', 'INSTITUTIONAL', 'CONTACT'))
);
CREATE UNIQUE INDEX "user_emails_normalized_email_key" ON "user_emails"("normalized_email");
CREATE UNIQUE INDEX "user_emails_one_primary_per_user" ON "user_emails"("user_id") WHERE "is_primary" = true;
CREATE INDEX "user_emails_user_id_verified_at_idx" ON "user_emails"("user_id", "verified_at");

INSERT INTO "user_emails" ("user_id", "normalized_email", "is_primary", "purpose", "verified_at", "created_at", "updated_at")
SELECT "id", lower(trim("email")), true, 'ACCOUNT', "email_verified_at", "created_at", CURRENT_TIMESTAMP
FROM "users"
ON CONFLICT ("normalized_email") DO NOTHING;

ALTER TABLE "email_verification_tokens"
  ADD COLUMN "user_email_id" UUID,
  ADD CONSTRAINT "email_verification_tokens_user_email_id_fkey"
    FOREIGN KEY ("user_email_id") REFERENCES "user_emails"("id") ON DELETE CASCADE;
UPDATE "email_verification_tokens" evt
SET "user_email_id" = ue."id"
FROM "user_emails" ue
WHERE ue."user_id" = evt."user_id" AND ue."is_primary" = true;
CREATE INDEX "email_verification_tokens_user_email_expiry_idx"
  ON "email_verification_tokens"("user_email_id", "expires_at");

-- Promote the existing trusted-institution registry into the canonical
-- institution/domain registry rather than creating a competing model.
ALTER TABLE "trusted_institution_domains" DROP CONSTRAINT IF EXISTS "trusted_institution_domains_institution_id_fkey";
ALTER TABLE "trusted_institutions" RENAME TO "institutions";
ALTER TABLE "trusted_institution_domains" RENAME TO "institution_domains";

ALTER TABLE "institutions"
  ADD COLUMN "slug" VARCHAR(160),
  ADD COLUMN "host_institution" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE';
WITH ranked AS (
  SELECT "id", regexp_replace(lower(trim("name")), '[^a-z0-9]+', '-', 'g') AS base,
         row_number() OVER (PARTITION BY regexp_replace(lower(trim("name")), '[^a-z0-9]+', '-', 'g') ORDER BY "created_at", "id") AS n
  FROM "institutions"
)
UPDATE "institutions" i
SET "slug" = CASE WHEN ranked.n = 1 THEN trim(both '-' from ranked.base)
                  ELSE trim(both '-' from ranked.base) || '-' || ranked.n::text END
FROM ranked WHERE ranked."id" = i."id";
ALTER TABLE "institutions" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "institutions_slug_key" ON "institutions"("slug");
ALTER TABLE "institutions"
  ADD CONSTRAINT "institutions_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE'));

ALTER TABLE "institution_domains"
  ADD COLUMN "trusted" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "verification_method" VARCHAR(48) NOT NULL DEFAULT 'INSTITUTIONAL_EMAIL',
  ADD CONSTRAINT "institution_domains_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "institution_domains_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE')),
  ADD CONSTRAINT "institution_domains_method_check" CHECK ("verification_method" IN ('FEID', 'INSTITUTIONAL_EMAIL', 'TRUSTED_IDENTITY_PROVIDER', 'MANUAL_REVIEW'));

INSERT INTO "institutions" ("id", "name", "slug", "host_institution", "status", "verification_policy", "is_active", "created_at", "updated_at")
VALUES (gen_random_uuid(), 'FPT University', 'fpt-university', true, 'ACTIVE', '{"allowInstitutionalEmailVerification":true}'::jsonb, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET "host_institution" = true, "status" = 'ACTIVE', "is_active" = true;

INSERT INTO "institution_domains" ("id", "institution_id", "domain", "trusted", "status", "verification_method")
SELECT gen_random_uuid(), "id", domain, true, 'ACTIVE', 'INSTITUTIONAL_EMAIL'
FROM "institutions"
CROSS JOIN (VALUES ('fpt.edu.vn'), ('fe.edu.vn')) AS configured(domain)
WHERE "slug" = 'fpt-university'
ON CONFLICT ("domain") DO UPDATE SET
  "institution_id" = EXCLUDED."institution_id", "trusted" = true, "status" = 'ACTIVE';

CREATE TABLE "campuses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institution_id" UUID NOT NULL,
  "code" VARCHAR(40),
  "name" VARCHAR(160) NOT NULL,
  "city" VARCHAR(120),
  "country" VARCHAR(120),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campuses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "campuses_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE,
  CONSTRAINT "campuses_institution_name_key" UNIQUE ("institution_id", "name")
);
CREATE INDEX "campuses_institution_active_idx" ON "campuses"("institution_id", "is_active");

CREATE TABLE "academic_programs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institution_id" UUID NOT NULL,
  "campus_id" UUID,
  "code" VARCHAR(64),
  "name" VARCHAR(200) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "academic_programs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "academic_programs_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE,
  CONSTRAINT "academic_programs_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE SET NULL,
  CONSTRAINT "academic_programs_institution_name_key" UNIQUE ("institution_id", "name")
);
CREATE INDEX "academic_programs_campus_id_idx" ON "academic_programs"("campus_id");

-- Preserve every legacy affiliation by materializing its institution first.
INSERT INTO "institutions" ("id", "name", "slug", "host_institution", "status", "verification_policy", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), source."institution_name",
       'legacy-' || substr(md5(lower(trim(source."institution_name"))), 1, 24),
       false, 'ACTIVE', '{}'::jsonb, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "institution_name" FROM "affiliations") source
WHERE NOT EXISTS (
  SELECT 1 FROM "institutions" i WHERE lower(trim(i."name")) = lower(trim(source."institution_name"))
);

ALTER TABLE "affiliations"
  ADD COLUMN "institution_id" UUID,
  ADD COLUMN "campus_id" UUID,
  ADD COLUMN "program_id" UUID,
  ADD COLUMN "verification_method" VARCHAR(48),
  ADD COLUMN "verified_at" TIMESTAMPTZ(6),
  ADD COLUMN "verified_by_id" UUID,
  ADD COLUMN "student_code" VARCHAR(80),
  ADD COLUMN "cohort" VARCHAR(80),
  ADD COLUMN "is_current" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "start_date" DATE,
  ADD COLUMN "end_date" DATE;

UPDATE "affiliations" a
SET "institution_id" = i."id",
    "verification_method" = CASE a."verification_source"
      WHEN 'EMAIL' THEN 'INSTITUTIONAL_EMAIL'
      WHEN 'FEID' THEN 'FEID'
      WHEN 'ADMIN' THEN 'MANUAL_REVIEW'
      ELSE NULL END,
    "verified_at" = CASE WHEN a."verification_status" = 'VERIFIED' THEN a."updated_at" ELSE NULL END,
    "is_current" = a."valid_until" IS NULL OR a."valid_until" >= CURRENT_DATE,
    "start_date" = a."valid_from",
    "end_date" = a."valid_until"
FROM "institutions" i
WHERE lower(trim(i."name")) = lower(trim(a."institution_name"));

ALTER TABLE "affiliations" ALTER COLUMN "institution_id" SET NOT NULL;
ALTER TABLE "affiliations" DROP CONSTRAINT IF EXISTS "affiliations_type_check";
DROP INDEX IF EXISTS "affiliations_type_status_idx";
ALTER TABLE "affiliations" DROP COLUMN "affiliation_type";
ALTER TABLE "affiliations"
  ADD CONSTRAINT "affiliations_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "affiliations_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "affiliations_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "academic_programs"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "affiliations_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "affiliations_verification_method_check" CHECK ("verification_method" IS NULL OR "verification_method" IN ('FEID', 'INSTITUTIONAL_EMAIL', 'TRUSTED_IDENTITY_PROVIDER', 'MANUAL_REVIEW'));
DROP INDEX IF EXISTS "affiliations_user_id_is_primary_idx";
CREATE INDEX "affiliations_user_current_status_idx" ON "affiliations"("user_id", "is_current", "verification_status");
CREATE INDEX "affiliations_institution_current_status_idx" ON "affiliations"("institution_id", "is_current", "verification_status");
CREATE INDEX "affiliations_campus_id_idx" ON "affiliations"("campus_id");

ALTER TABLE "academic_profiles"
  ADD COLUMN "academic_role" VARCHAR(24),
  ADD COLUMN "role_verification_status" VARCHAR(24) NOT NULL DEFAULT 'SELF_DECLARED',
  ADD COLUMN "role_verification_method" VARCHAR(48),
  ADD COLUMN "role_verified_at" TIMESTAMPTZ(6),
  ADD COLUMN "role_verified_by_id" UUID;
UPDATE "academic_profiles" ap
SET "academic_role" = CASE
      WHEN ap."primary_position" = 'STUDENT' THEN 'STUDENT'
      WHEN ap."primary_position" = 'LECTURER' THEN 'LECTURER'
      WHEN ap."primary_position" IN ('RESEARCH_STAFF', 'INDUSTRY_PRACTITIONER', 'OTHER') THEN 'RESEARCHER'
      WHEN u."academic_profile_type" = 'student' THEN 'STUDENT'
      WHEN u."academic_profile_type" = 'lecturer' THEN 'LECTURER'
      WHEN u."academic_profile_type" = 'researcher' THEN 'RESEARCHER'
      ELSE NULL END,
    "role_verification_status" = CASE WHEN ap."position_status" = 'VERIFIED' THEN 'VERIFIED' ELSE 'SELF_DECLARED' END,
    "role_verified_at" = CASE WHEN ap."position_status" = 'VERIFIED' THEN ap."verified_at" ELSE NULL END
FROM "users" u WHERE u."id" = ap."user_id";
ALTER TABLE "academic_profiles"
  ADD CONSTRAINT "academic_profiles_academic_role_check" CHECK ("academic_role" IS NULL OR "academic_role" IN ('STUDENT', 'RESEARCHER', 'LECTURER')),
  ADD CONSTRAINT "academic_profiles_role_verification_status_check" CHECK ("role_verification_status" IN ('SELF_DECLARED', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED', 'INVALIDATED')),
  ADD CONSTRAINT "academic_profiles_role_verified_by_id_fkey" FOREIGN KEY ("role_verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
CREATE INDEX "academic_profiles_academic_role_verification_idx" ON "academic_profiles"("academic_role", "role_verification_status");

ALTER TABLE "user_capabilities" DROP CONSTRAINT IF EXISTS "user_capabilities_name_check";
ALTER TABLE "user_capabilities" ADD CONSTRAINT "user_capabilities_name_check" CHECK ("capability" IN (
  'BASIC_RESEARCH', 'RESEARCH_SUPPORT', 'STRUCTURED_REVIEW', 'GAP_VALIDATION',
  'CREATE_RESEARCH_PROJECT', 'APPROVE_ACADEMIC_CONTRIBUTION', 'MENTOR_PROJECT', 'REVIEW_ARTIFACT', 'MANAGE_SYSTEM'
));

ALTER TABLE "project_invitations" ADD COLUMN "purpose" VARCHAR(48) NOT NULL DEFAULT 'PROJECT_MEMBERSHIP';
CREATE UNIQUE INDEX IF NOT EXISTS "project_invitations_token_hash_key" ON "project_invitations"("token_hash") WHERE "token_hash" IS NOT NULL;
ALTER TABLE "project_invitations"
  ADD CONSTRAINT "project_invitations_purpose_check" CHECK ("purpose" IN ('PROJECT_MEMBERSHIP'));

