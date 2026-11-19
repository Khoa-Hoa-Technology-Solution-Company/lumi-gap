ALTER TABLE submissions ADD COLUMN source_manuscript_id uuid;
CREATE UNIQUE INDEX submissions_source_manuscript_id_key ON submissions(source_manuscript_id);
ALTER TABLE submissions ADD CONSTRAINT submissions_source_manuscript_id_fkey
  FOREIGN KEY (source_manuscript_id) REFERENCES draft_workspaces(id) ON DELETE RESTRICT;
CREATE INDEX submission_revisions_manuscript_snapshot_id_idx ON submission_revisions(manuscript_snapshot_id);
