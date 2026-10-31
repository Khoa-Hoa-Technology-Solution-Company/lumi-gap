-- Existing rows and immutable round snapshots keep their rules.
ALTER TABLE screening_settings DROP CONSTRAINT screening_settings_review_mode_check;
ALTER TABLE screening_settings ADD CONSTRAINT screening_settings_review_mode_check
  CHECK (review_mode IN ('COLLABORATIVE','SIMPLE','INDEPENDENT'));
ALTER TABLE screening_settings DROP CONSTRAINT screening_settings_mode_count_check;
ALTER TABLE screening_settings ADD CONSTRAINT screening_settings_mode_count_check
  CHECK ((review_mode='COLLABORATIVE' AND required_reviewers=1 AND NOT blind_review AND resolution_policy='ADJUDICATION')
      OR (review_mode='SIMPLE' AND required_reviewers=1)
      OR (review_mode='INDEPENDENT' AND required_reviewers>=2));
ALTER TABLE project_workspace_revisions DROP CONSTRAINT project_workspace_revisions_entity_kind_check;
ALTER TABLE project_workspace_revisions ADD CONSTRAINT project_workspace_revisions_entity_kind_check
  CHECK (entity_kind IN ('TASK','MILESTONE','DISCUSSION','DECISION','EXTRACTION','SCREENING_VOTE','GAP','MANUSCRIPT','PLAN_DRAFT','SYNTHESIS','GAP_ANALYSIS_INPUT','ANALYSIS_SET'));

CREATE FUNCTION protect_analysis_set_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.entity_kind='ANALYSIS_SET' THEN RAISE EXCEPTION 'Analysis sets are immutable'; END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER immutable_analysis_set_delete BEFORE DELETE ON project_workspace_revisions
  FOR EACH ROW EXECUTE FUNCTION protect_analysis_set_delete();
