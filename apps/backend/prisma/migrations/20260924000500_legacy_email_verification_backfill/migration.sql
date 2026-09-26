-- Accounts that existed before email verification was introduced have no
-- verification-token history. Preserve their access without weakening the
-- verification requirement for accounts created by the new registration flow.
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
  u."id",
  ap."id",
  'IDENTITY_EMAIL',
  'LEGACY_MIGRATION',
  u."email",
  'VERIFIED',
  COALESCE(u."updated_at", u."created_at", CURRENT_TIMESTAMP),
  jsonb_build_object('reason', 'account_existed_before_email_verification')
FROM "users" u
LEFT JOIN "academic_profiles" ap ON ap."user_id" = u."id"
WHERE u."email_verified_at" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "email_verification_tokens" evt
    WHERE evt."user_id" = u."id"
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "verification_evidence" evidence
    WHERE evidence."user_id" = u."id"
      AND evidence."verification_type" = 'IDENTITY_EMAIL'
      AND evidence."source_type" = 'LEGACY_MIGRATION'
  );

WITH legacy_users AS (
  SELECT u."id"
  FROM "users" u
  WHERE u."email_verified_at" IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "email_verification_tokens" evt
      WHERE evt."user_id" = u."id"
    )
), verified_users AS (
  UPDATE "users" u
  SET "email_verified_at" = COALESCE(u."updated_at", u."created_at", CURRENT_TIMESTAMP)
  FROM legacy_users legacy
  WHERE u."id" = legacy."id"
  RETURNING u."id"
)
UPDATE "academic_profiles" ap
SET
  "email_status" = 'VERIFIED',
  "identity_status" = 'VERIFIED'
FROM verified_users verified
WHERE ap."user_id" = verified."id";
