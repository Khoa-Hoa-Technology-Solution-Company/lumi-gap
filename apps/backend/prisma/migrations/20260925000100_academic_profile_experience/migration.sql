-- Academic profile media, position semantics, privacy, and affiliation history.
ALTER TABLE "academic_profiles"
  ADD COLUMN IF NOT EXISTS "avatar_storage_key" VARCHAR(180),
  ADD COLUMN IF NOT EXISTS "avatar_mime_type" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "avatar_size_bytes" INTEGER,
  ADD COLUMN IF NOT EXISTS "avatar_width" INTEGER,
  ADD COLUMN IF NOT EXISTS "avatar_height" INTEGER,
  ADD COLUMN IF NOT EXISTS "avatar_updated_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "cover_mime_type" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "cover_size_bytes" INTEGER,
  ADD COLUMN IF NOT EXISTS "cover_width" INTEGER,
  ADD COLUMN IF NOT EXISTS "cover_height" INTEGER,
  ADD COLUMN IF NOT EXISTS "privacy_settings" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "position_title" VARCHAR(160),
  ADD COLUMN IF NOT EXISTS "position_category" VARCHAR(32) NOT NULL DEFAULT 'UNCLASSIFIED',
  ADD COLUMN IF NOT EXISTS "position_source" VARCHAR(24) NOT NULL DEFAULT 'PREDEFINED';

ALTER TABLE "affiliations"
  ADD COLUMN IF NOT EXISTS "position_title" VARCHAR(160),
  ADD COLUMN IF NOT EXISTS "position_category" VARCHAR(32) NOT NULL DEFAULT 'UNCLASSIFIED',
  ADD COLUMN IF NOT EXISTS "position_source" VARCHAR(24) NOT NULL DEFAULT 'PREDEFINED',
  ADD COLUMN IF NOT EXISTS "position_status" VARCHAR(24) NOT NULL DEFAULT 'NOT_SUBMITTED';

ALTER TABLE "academic_profiles" DROP CONSTRAINT IF EXISTS "academic_profiles_identity_status_check";
ALTER TABLE "academic_profiles" DROP CONSTRAINT IF EXISTS "academic_profiles_email_status_check";
ALTER TABLE "academic_profiles" DROP CONSTRAINT IF EXISTS "academic_profiles_affiliation_status_check";
ALTER TABLE "academic_profiles" DROP CONSTRAINT IF EXISTS "academic_profiles_position_status_check";
ALTER TABLE "academic_profiles" DROP CONSTRAINT IF EXISTS "academic_profiles_orcid_status_check";
ALTER TABLE "affiliations" DROP CONSTRAINT IF EXISTS "affiliations_status_check";
ALTER TABLE "verification_evidence" DROP CONSTRAINT IF EXISTS "verification_evidence_status_check";

UPDATE "academic_profiles"
SET
  "position_title" = COALESCE("affiliation_position", "academic_title"),
  "position_category" = CASE
    WHEN "primary_position" = 'STUDENT' THEN 'STUDENT'
    WHEN "primary_position" = 'LECTURER' THEN 'LECTURER'
    WHEN "primary_position" = 'RESEARCH_STAFF' THEN 'RESEARCH_STAFF'
    ELSE 'UNCLASSIFIED'
  END,
  "identity_status" = CASE WHEN "identity_status" = 'UNVERIFIED' THEN 'NOT_SUBMITTED' ELSE "identity_status" END,
  "email_status" = CASE WHEN "email_status" = 'UNVERIFIED' THEN 'NOT_SUBMITTED' ELSE "email_status" END,
  "affiliation_status" = CASE WHEN "affiliation_status" = 'UNVERIFIED' THEN 'NOT_SUBMITTED' ELSE "affiliation_status" END,
  "position_status" = CASE WHEN "position_status" = 'UNVERIFIED' THEN 'NOT_SUBMITTED' ELSE "position_status" END,
  "orcid_status" = CASE WHEN "orcid_status" = 'UNVERIFIED' THEN 'NOT_SUBMITTED' ELSE "orcid_status" END;

UPDATE "affiliations"
SET
  "position_title" = "academic_title",
  "verification_status" = CASE WHEN "verification_status" = 'UNVERIFIED' THEN 'NOT_SUBMITTED' ELSE "verification_status" END;

ALTER TABLE "academic_profiles" ALTER COLUMN "identity_status" SET DEFAULT 'NOT_SUBMITTED';
ALTER TABLE "academic_profiles" ALTER COLUMN "email_status" SET DEFAULT 'NOT_SUBMITTED';
ALTER TABLE "academic_profiles" ALTER COLUMN "affiliation_status" SET DEFAULT 'NOT_SUBMITTED';
ALTER TABLE "academic_profiles" ALTER COLUMN "position_status" SET DEFAULT 'NOT_SUBMITTED';
ALTER TABLE "academic_profiles" ALTER COLUMN "orcid_status" SET DEFAULT 'NOT_SUBMITTED';
ALTER TABLE "affiliations" ALTER COLUMN "verification_status" SET DEFAULT 'NOT_SUBMITTED';

ALTER TABLE "academic_profiles"
  ADD CONSTRAINT "academic_profiles_identity_status_check" CHECK ("identity_status" IN ('NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED', 'INVALIDATED')),
  ADD CONSTRAINT "academic_profiles_email_status_check" CHECK ("email_status" IN ('NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED', 'INVALIDATED')),
  ADD CONSTRAINT "academic_profiles_affiliation_status_check" CHECK ("affiliation_status" IN ('NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED', 'INVALIDATED')),
  ADD CONSTRAINT "academic_profiles_position_status_check" CHECK ("position_status" IN ('NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED', 'INVALIDATED')),
  ADD CONSTRAINT "academic_profiles_orcid_status_check" CHECK ("orcid_status" IN ('NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED', 'INVALIDATED')),
  ADD CONSTRAINT "academic_profiles_position_category_check" CHECK ("position_category" IN ('STUDENT', 'LECTURER', 'RESEARCH_STAFF', 'UNCLASSIFIED')),
  ADD CONSTRAINT "academic_profiles_position_source_check" CHECK ("position_source" IN ('PREDEFINED', 'CUSTOM')),
  ADD CONSTRAINT "academic_profiles_avatar_dimensions_check" CHECK (("avatar_width" IS NULL OR "avatar_width" > 0) AND ("avatar_height" IS NULL OR "avatar_height" > 0) AND ("avatar_size_bytes" IS NULL OR "avatar_size_bytes" > 0)),
  ADD CONSTRAINT "academic_profiles_cover_dimensions_check" CHECK (("cover_width" IS NULL OR "cover_width" > 0) AND ("cover_height" IS NULL OR "cover_height" > 0) AND ("cover_size_bytes" IS NULL OR "cover_size_bytes" > 0));

ALTER TABLE "affiliations"
  ADD CONSTRAINT "affiliations_position_category_check" CHECK ("position_category" IN ('STUDENT', 'LECTURER', 'RESEARCH_STAFF', 'UNCLASSIFIED')),
  ADD CONSTRAINT "affiliations_position_source_check" CHECK ("position_source" IN ('PREDEFINED', 'CUSTOM')),
  ADD CONSTRAINT "affiliations_position_status_check" CHECK ("position_status" IN ('NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED', 'INVALIDATED')),
  ADD CONSTRAINT "affiliations_status_check" CHECK ("verification_status" IN ('NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED', 'INVALIDATED'));

ALTER TABLE "verification_evidence"
  ADD CONSTRAINT "verification_evidence_status_check" CHECK ("status" IN ('NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED', 'INVALIDATED'));

CREATE INDEX IF NOT EXISTS "academic_profiles_position_category_position_status_idx"
  ON "academic_profiles"("position_category", "position_status");
CREATE INDEX IF NOT EXISTS "verification_evidence_type_status_submitted_at_idx"
  ON "verification_evidence"("verification_type", "status", "submitted_at");
