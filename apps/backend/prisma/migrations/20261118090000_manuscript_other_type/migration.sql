-- Add a generic document category without changing existing manuscripts.
BEGIN;
ALTER TABLE draft_workspaces DROP CONSTRAINT manuscript_type_check;
ALTER TABLE draft_workspaces ADD CONSTRAINT manuscript_type_check
  CHECK (document_type IN ('RESEARCH_PAPER','RESEARCH_PROPOSAL','THESIS','TECHNICAL_REPORT','OTHER'));
COMMIT;
