BEGIN;
-- Additive metadata on the existing contribution/version/review model.
ALTER TABLE project_contribution_proposals ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT '';
ALTER TABLE project_contribution_proposals ADD COLUMN IF NOT EXISTS milestone_id uuid;
ALTER TABLE project_contribution_proposals ADD COLUMN IF NOT EXISTS external_evidence jsonb NOT NULL DEFAULT '[]';
ALTER TABLE contribution_participants ADD COLUMN IF NOT EXISTS participation jsonb NOT NULL DEFAULT '{}';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='project_contribution_proposals'::regclass AND conname='contribution_milestone_project_fk') THEN
    ALTER TABLE project_contribution_proposals ADD CONSTRAINT contribution_milestone_project_fk
      FOREIGN KEY (milestone_id,project_id) REFERENCES project_milestones(id,project_id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS contribution_milestone_scope_idx ON project_contribution_proposals(project_id,milestone_id);
ALTER TABLE contribution_reviews DROP CONSTRAINT IF EXISTS contribution_reviews_decision_check;
ALTER TABLE contribution_reviews ADD CONSTRAINT contribution_reviews_decision_check
  CHECK (decision IN ('ACKNOWLEDGE','ACCEPT','NEEDS_CHANGES','DISPUTE','INSUFFICIENT_INFORMATION'));
-- Keep every existing confirmation, immutable history guard and source record.
COMMIT;
