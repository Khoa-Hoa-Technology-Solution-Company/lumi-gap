-- Additive, existing attribution and consent records remain authoritative.
ALTER TABLE manuscript_snapshots ADD CONSTRAINT manuscript_snapshot_integrity_scope UNIQUE(id, project_id, workspace_id);
CREATE TABLE manuscript_integrity_records (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL, workspace_id UUID NOT NULL, snapshot_id UUID NOT NULL,
 kind VARCHAR(32) NOT NULL CHECK(kind IN ('CITATION_AUDIT','AI_DECLARATION','RIGHTS_DECLARATION','POLICY','READINESS_REPORT')),
 version INTEGER NOT NULL CHECK(version>0), content JSONB NOT NULL, evidence_digest CHAR(64) NOT NULL,
 checksum CHAR(64) NOT NULL, created_by_id UUID NOT NULL REFERENCES users(id), client_key UUID NOT NULL, command_hash CHAR(64) NOT NULL,
 created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(snapshot_id,project_id,workspace_id) REFERENCES manuscript_snapshots(id,project_id,workspace_id),
 UNIQUE(snapshot_id,kind,version), UNIQUE(workspace_id,created_by_id,client_key), UNIQUE(id,project_id)
);
CREATE INDEX manuscript_integrity_scope_idx ON manuscript_integrity_records(project_id,workspace_id,snapshot_id,kind);
CREATE TABLE manuscript_integrity_acknowledgements (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), record_id UUID NOT NULL REFERENCES manuscript_integrity_records(id),
 user_id UUID NOT NULL REFERENCES users(id), evidence_digest CHAR(64) NOT NULL,
 created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(record_id,user_id)
);
CREATE TABLE manuscript_ai_acceptances (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL REFERENCES projects(id), workspace_id UUID NOT NULL REFERENCES draft_workspaces(id),
 run_id UUID NOT NULL REFERENCES ai_runs(id), accepted_by_id UUID NOT NULL REFERENCES users(id), file_id UUID NOT NULL,
 sequence INTEGER NOT NULL CHECK(sequence>=0), source_version INTEGER NOT NULL CHECK(source_version>0),
 source_checksum CHAR(64) NOT NULL, proposal_checksum CHAR(64) NOT NULL, client_key UUID NOT NULL,
 created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(file_id,workspace_id) REFERENCES manuscript_files(id,workspace_id), UNIQUE(workspace_id,accepted_by_id,client_key)
);
CREATE INDEX manuscript_ai_acceptances_workspace_idx ON manuscript_ai_acceptances(workspace_id,created_at);
ALTER TABLE submission_revisions ADD COLUMN integrity_report_id UUID REFERENCES manuscript_integrity_records(id);
CREATE FUNCTION protect_manuscript_integrity_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Integrity accountability records are append-only; use the privacy retention process'; END $$;
CREATE TRIGGER manuscript_integrity_record_immutable BEFORE UPDATE OR DELETE ON manuscript_integrity_records FOR EACH ROW EXECUTE FUNCTION protect_manuscript_integrity_record();
CREATE TRIGGER manuscript_integrity_ack_immutable BEFORE UPDATE OR DELETE ON manuscript_integrity_acknowledgements FOR EACH ROW EXECUTE FUNCTION protect_manuscript_integrity_record();
CREATE TRIGGER manuscript_ai_acceptance_immutable BEFORE UPDATE OR DELETE ON manuscript_ai_acceptances FOR EACH ROW EXECUTE FUNCTION protect_manuscript_integrity_record();
