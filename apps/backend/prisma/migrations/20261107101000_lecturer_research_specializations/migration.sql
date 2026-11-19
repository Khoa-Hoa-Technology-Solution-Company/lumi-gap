ALTER TABLE academic_profiles ADD COLUMN research_specializations TEXT[] NOT NULL DEFAULT ARRAY[]::text[];
