ALTER TABLE projects ADD COLUMN mentorship_support_types text[] NOT NULL DEFAULT ARRAY[]::text[];
