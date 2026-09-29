ALTER TABLE "projects"
  ADD COLUMN "inclusion_criteria" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "exclusion_criteria" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "project_papers"
  ADD COLUMN "exclusion_note" TEXT,
  ADD COLUMN "screened_by_id" UUID,
  ADD COLUMN "screened_at" TIMESTAMPTZ(6);
