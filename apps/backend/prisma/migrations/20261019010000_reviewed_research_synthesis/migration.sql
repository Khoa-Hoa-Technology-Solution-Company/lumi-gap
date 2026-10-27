-- Reuse immutable workspace revisions for the shared synthesis and analysis input.
ALTER TABLE project_workspace_revisions DROP CONSTRAINT project_workspace_revisions_entity_kind_check;
ALTER TABLE project_workspace_revisions ADD CONSTRAINT project_workspace_revisions_entity_kind_check
  CHECK (entity_kind IN ('TASK','MILESTONE','DISCUSSION','DECISION','EXTRACTION','SCREENING_VOTE','GAP','MANUSCRIPT','PLAN_DRAFT','SYNTHESIS','GAP_ANALYSIS_INPUT'));
