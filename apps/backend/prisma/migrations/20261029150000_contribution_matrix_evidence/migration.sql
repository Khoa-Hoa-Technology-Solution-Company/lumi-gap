ALTER TABLE "project_contribution_proposals"
  ADD COLUMN IF NOT EXISTS "category" VARCHAR(40) NOT NULL DEFAULT 'EXECUTION_VALIDATION';

UPDATE "project_contribution_proposals"
SET "category" = CASE
  WHEN "roles" && ARRAY['CONCEPTUALIZATION', 'METHODOLOGY']::text[] THEN 'CONCEPTUALIZATION_METHODOLOGY'
  WHEN "roles" && ARRAY['DATA_CURATION', 'RESOURCES']::text[] THEN 'LITERATURE_DATA'
  WHEN "roles" && ARRAY['WRITING_ORIGINAL_DRAFT', 'WRITING_REVIEW_EDITING', 'VISUALIZATION']::text[] THEN 'WRITING_REVISION'
  ELSE 'EXECUTION_VALIDATION'
END;

ALTER TABLE "project_contribution_proposals"
  DROP CONSTRAINT IF EXISTS "project_contribution_proposals_category_check",
  ADD CONSTRAINT "project_contribution_proposals_category_check"
    CHECK ("category" IN ('CONCEPTUALIZATION_METHODOLOGY', 'LITERATURE_DATA', 'EXECUTION_VALIDATION', 'WRITING_REVISION'));

ALTER TABLE "allocation_revisions"
  ADD COLUMN IF NOT EXISTS "matrix" JSONB,
  ADD COLUMN IF NOT EXISTS "finalized_by_id" UUID REFERENCES "users"("id") ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION immutable_allocation_revision() RETURNS trigger AS $$
BEGIN
  IF OLD.submitted_at IS NOT NULL THEN
    IF (to_jsonb(NEW)-ARRAY['status','finalized_at','finalized_by_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','finalized_at','finalized_by_id']) THEN
      RAISE EXCEPTION 'Submitted allocation payload is immutable';
    END IF;
    IF OLD.finalized_by_id IS NOT NULL AND NEW.finalized_by_id IS DISTINCT FROM OLD.finalized_by_id THEN
      RAISE EXCEPTION 'Submitted allocation payload is immutable';
    END IF;
    IF OLD.status IN ('FINALIZED', 'SUPERSEDED', 'DISPUTED') AND NEW.status <> OLD.status THEN
      IF NOT (OLD.status = 'FINALIZED' AND NEW.status = 'SUPERSEDED') THEN
        RAISE EXCEPTION 'Terminal allocation revision status cannot transition';
      END IF;
    END IF;
    IF OLD.status = 'AWAITING_APPROVAL' AND NEW.status NOT IN ('AWAITING_APPROVAL', 'DISPUTED', 'FINALIZED') THEN
      RAISE EXCEPTION 'Submitted allocation revision cannot revert to draft';
    END IF;
  END IF;
  IF NEW.status <> 'DRAFT' AND NEW.submitted_at IS NULL THEN
    RAISE EXCEPTION 'Submitted allocation revision requires submitted_at';
  END IF;
  IF NEW.status = 'FINALIZED' AND NEW.finalized_at IS NULL THEN
    RAISE EXCEPTION 'Finalized allocation revision requires finalized_at';
  END IF;
  IF NEW.status <> 'FINALIZED' AND NEW.status <> 'SUPERSEDED' AND (NEW.finalized_at IS NOT NULL OR NEW.finalized_by_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Unfinalized allocation revision cannot set finalized_at';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

