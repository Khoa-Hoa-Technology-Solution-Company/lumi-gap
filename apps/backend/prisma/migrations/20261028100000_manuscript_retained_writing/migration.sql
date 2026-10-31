-- Old/imported text intentionally has no inferred author.
ALTER TABLE manuscript_files ADD COLUMN writing_baseline jsonb;
ALTER TABLE manuscript_updates ADD COLUMN writing_spans jsonb;
CREATE TABLE manuscript_writing_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  workspace_id uuid NOT NULL REFERENCES draft_workspaces(id),
  snapshot_id uuid NOT NULL UNIQUE,
  actor_id uuid NOT NULL REFERENCES users(id),
  status varchar(16) NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','COMPLETED','FAILED')),
  result jsonb, input_hash char(64),
  created_at timestamptz NOT NULL DEFAULT now(), calculated_at timestamptz,
  FOREIGN KEY(snapshot_id,project_id) REFERENCES manuscript_snapshots(id,project_id),
  CHECK(status<>'COMPLETED' OR (result IS NOT NULL AND input_hash IS NOT NULL AND calculated_at IS NOT NULL))
);
CREATE INDEX manuscript_writing_reports_project_id_created_at_idx ON manuscript_writing_reports(project_id,created_at);
CREATE INDEX manuscript_writing_reports_status_created_at_idx ON manuscript_writing_reports(status,created_at);
CREATE FUNCTION protect_completed_writing_report() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='COMPLETED' THEN RAISE EXCEPTION 'Completed writing reports are immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER manuscript_writing_report_immutable BEFORE UPDATE OR DELETE ON manuscript_writing_reports
  FOR EACH ROW EXECUTE FUNCTION protect_completed_writing_report();
