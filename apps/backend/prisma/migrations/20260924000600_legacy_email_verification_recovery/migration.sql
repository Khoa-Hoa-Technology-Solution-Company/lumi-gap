-- Recover accounts that predate the email-verification feature. Some legacy
-- users were redirected to the new verification page and received a token
-- before the first backfill ran, so token presence alone cannot distinguish
-- them from accounts created by the new registration flow.
WITH cutover AS (
  SELECT "finished_at"
  FROM "_prisma_migrations"
  WHERE "migration_name" = '20260924000400_identity_authorization'
    AND "finished_at" IS NOT NULL
  ORDER BY "finished_at" DESC
  LIMIT 1
), legacy_users AS (
  SELECT u."id", u."email", ap."id" AS "academic_profile_id"
  FROM "users" u
  CROSS JOIN cutover c
  LEFT JOIN "academic_profiles" ap ON ap."user_id" = u."id"
  WHERE u."email_verified_at" IS NULL
    AND u."created_at" < c."finished_at"
)
INSERT INTO "verification_evidence" (
  "user_id",
  "academic_profile_id",
  "verification_type",
  "source_type",
  "source_reference",
  "status",
  "reviewed_at",
  "metadata"
)
SELECT
  legacy."id",
  legacy."academic_profile_id",
  'IDENTITY_EMAIL',
  'LEGACY_MIGRATION',
  legacy."email",
  'VERIFIED',
  CURRENT_TIMESTAMP,
  jsonb_build_object(
    'reason', 'account_created_before_email_verification_cutover',
    'cutoverMigration', '20260924000400_identity_authorization'
  )
FROM legacy_users legacy
WHERE NOT EXISTS (
  SELECT 1
  FROM "verification_evidence" evidence
  WHERE evidence."user_id" = legacy."id"
    AND evidence."verification_type" = 'IDENTITY_EMAIL'
    AND evidence."source_type" = 'LEGACY_MIGRATION'
);

WITH cutover AS (
  SELECT "finished_at"
  FROM "_prisma_migrations"
  WHERE "migration_name" = '20260924000400_identity_authorization'
    AND "finished_at" IS NOT NULL
  ORDER BY "finished_at" DESC
  LIMIT 1
), legacy_users AS (
  SELECT u."id"
  FROM "users" u
  CROSS JOIN cutover c
  WHERE u."email_verified_at" IS NULL
    AND u."created_at" < c."finished_at"
), verified_users AS (
  UPDATE "users" u
  SET "email_verified_at" = CURRENT_TIMESTAMP
  FROM legacy_users legacy
  WHERE u."id" = legacy."id"
  RETURNING u."id"
), updated_profiles AS (
  UPDATE "academic_profiles" ap
  SET
    "email_status" = 'VERIFIED',
    "identity_status" = 'VERIFIED'
  FROM verified_users verified
  WHERE ap."user_id" = verified."id"
  RETURNING ap."user_id"
)
UPDATE "email_verification_tokens" token
SET "consumed_at" = CURRENT_TIMESTAMP
FROM verified_users verified
WHERE token."user_id" = verified."id"
  AND token."consumed_at" IS NULL;
