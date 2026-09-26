-- Preserve public URLs that were stored directly on academic_profiles before
-- the handle-history table became the canonical lookup source.
INSERT INTO "academic_profile_handles" (
  "id",
  "handle",
  "user_id",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  LOWER(TRIM(profile."public_handle")),
  profile."user_id",
  COALESCE(profile."created_at", CURRENT_TIMESTAMP),
  CURRENT_TIMESTAMP
FROM "academic_profiles" AS profile
WHERE profile."public_handle" IS NOT NULL
  AND TRIM(profile."public_handle") <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM "academic_profile_handles" AS existing
    WHERE existing."handle" = LOWER(TRIM(profile."public_handle"))
  );
