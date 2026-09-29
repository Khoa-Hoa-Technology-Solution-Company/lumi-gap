-- Seed stable FPT University onboarding options so student onboarding can use
-- real program UUIDs instead of free-text majors.

WITH host AS (
  SELECT "id" FROM "institutions" WHERE "slug" = 'fpt-university'
)
INSERT INTO "campuses" ("id", "institution_id", "code", "name", "city", "country", "is_active", "created_at", "updated_at")
SELECT configured."id"::uuid, host."id", configured."code", configured."name", configured."city", 'Vietnam', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM host
CROSS JOIN (VALUES
  ('00000000-0000-4000-8000-000000000101', 'HN', 'FPT University Hà Nội', 'Hà Nội'),
  ('00000000-0000-4000-8000-000000000102', 'HCM', 'FPT University Hồ Chí Minh', 'Hồ Chí Minh'),
  ('00000000-0000-4000-8000-000000000103', 'DN', 'FPT University Đà Nẵng', 'Đà Nẵng'),
  ('00000000-0000-4000-8000-000000000104', 'CT', 'FPT University Cần Thơ', 'Cần Thơ'),
  ('00000000-0000-4000-8000-000000000105', 'QN', 'FPT University Quy Nhơn', 'Quy Nhơn')
) AS configured("id", "code", "name", "city")
ON CONFLICT ("institution_id", "name") DO UPDATE SET
  "code" = EXCLUDED."code",
  "city" = EXCLUDED."city",
  "country" = EXCLUDED."country",
  "is_active" = true,
  "updated_at" = CURRENT_TIMESTAMP;

WITH host AS (
  SELECT "id" FROM "institutions" WHERE "slug" = 'fpt-university'
)
INSERT INTO "academic_programs" ("id", "institution_id", "code", "name", "is_active", "created_at", "updated_at")
SELECT configured."id"::uuid, host."id", configured."code", configured."name", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM host
CROSS JOIN (VALUES
  ('00000000-0000-4000-8000-000000000201', 'SE', 'Software Engineering'),
  ('00000000-0000-4000-8000-000000000202', 'AI', 'Artificial Intelligence'),
  ('00000000-0000-4000-8000-000000000203', 'IA', 'Information Assurance'),
  ('00000000-0000-4000-8000-000000000204', 'IS', 'Information Systems'),
  ('00000000-0000-4000-8000-000000000205', 'GD', 'Graphic Design'),
  ('00000000-0000-4000-8000-000000000206', 'DM', 'Digital Marketing'),
  ('00000000-0000-4000-8000-000000000207', 'IB', 'International Business'),
  ('00000000-0000-4000-8000-000000000208', 'BA', 'Business Administration'),
  ('00000000-0000-4000-8000-000000000209', 'HM', 'Hotel Management'),
  ('00000000-0000-4000-8000-000000000210', 'MC', 'Multimedia Communications'),
  ('00000000-0000-4000-8000-000000000211', 'EL', 'English Language'),
  ('00000000-0000-4000-8000-000000000212', 'JL', 'Japanese Language'),
  ('00000000-0000-4000-8000-000000000213', 'KL', 'Korean Language'),
  ('00000000-0000-4000-8000-000000000214', 'AT', 'Automotive Engineering Technology'),
  ('00000000-0000-4000-8000-000000000215', 'SCD', 'Semiconductor Circuit Design')
) AS configured("id", "code", "name")
ON CONFLICT ("institution_id", "name") DO UPDATE SET
  "code" = EXCLUDED."code",
  "is_active" = true,
  "updated_at" = CURRENT_TIMESTAMP;
