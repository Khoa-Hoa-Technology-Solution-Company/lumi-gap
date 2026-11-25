BEGIN;
ALTER TABLE draft_workspaces
  ADD COLUMN document_type_label varchar(80),
  ADD COLUMN template_metadata jsonb;
ALTER TABLE draft_workspaces DROP CONSTRAINT manuscript_type_check;
ALTER TABLE draft_workspaces ADD CONSTRAINT manuscript_type_check
  CHECK (document_type IN ('RESEARCH_PAPER','RESEARCH_PROPOSAL','THESIS','TECHNICAL_REPORT','PRESENTATION','OTHER'));
ALTER TABLE draft_workspaces ADD CONSTRAINT manuscript_custom_type_label_check
  CHECK (document_type_label IS NULL OR (document_type = 'OTHER' AND length(btrim(document_type_label)) BETWEEN 1 AND 80));
COMMIT;
