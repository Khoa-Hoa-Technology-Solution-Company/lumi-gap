ALTER TABLE project_workspace_revisions DROP CONSTRAINT project_workspace_revisions_entity_kind_check;
ALTER TABLE project_workspace_revisions ADD CONSTRAINT project_workspace_revisions_entity_kind_check CHECK (entity_kind IN ('TASK','MILESTONE','DISCUSSION','DECISION','EXTRACTION','SCREENING_VOTE','GAP'));
