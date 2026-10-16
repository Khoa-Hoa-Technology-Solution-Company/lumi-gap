-- Extend the canonical draft container. Existing workspaces remain LEGACY.
ALTER TABLE draft_workspaces ADD COLUMN writing_mode varchar(16) NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN document_type varchar(32) NOT NULL DEFAULT 'RESEARCH_PAPER',
  ADD COLUMN template varchar(32) NOT NULL DEFAULT 'ARTICLE',
  ADD COLUMN description text NOT NULL DEFAULT '', ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN main_file_id uuid, ADD COLUMN archived_at timestamptz, ADD COLUMN client_key uuid,
  ADD COLUMN research_link jsonb;
DROP INDEX IF EXISTS draft_workspaces_project_id_key;
CREATE UNIQUE INDEX draft_workspaces_legacy_project_key ON draft_workspaces(project_id) WHERE writing_mode = 'LEGACY';
CREATE UNIQUE INDEX draft_workspaces_project_id_created_by_id_client_key_key ON draft_workspaces(project_id,created_by_id,client_key);
CREATE INDEX draft_workspaces_project_id_writing_mode_updated_at_idx ON draft_workspaces(project_id,writing_mode,updated_at);
ALTER TABLE draft_workspaces ADD CONSTRAINT manuscript_mode_check CHECK (writing_mode IN ('LEGACY','LATEX')),
  ADD CONSTRAINT manuscript_type_check CHECK(document_type IN ('RESEARCH_PAPER','RESEARCH_PROPOSAL','THESIS','TECHNICAL_REPORT')),
  ADD CONSTRAINT manuscript_version_check CHECK(version > 0);
ALTER TABLE project_discussions ADD COLUMN context jsonb NOT NULL DEFAULT '{}';
ALTER TABLE project_workspace_revisions DROP CONSTRAINT project_workspace_revisions_entity_kind_check;
ALTER TABLE project_workspace_revisions ADD CONSTRAINT project_workspace_revisions_entity_kind_check
  CHECK(entity_kind IN ('TASK','MILESTONE','DISCUSSION','DECISION','EXTRACTION','SCREENING_VOTE','GAP','MANUSCRIPT'));
ALTER TABLE project_discussions DROP CONSTRAINT project_discussions_check1;
ALTER TABLE project_discussions ADD CONSTRAINT project_discussions_mentor_target_check
  CHECK(mentor_relationship_id IS NULL OR (category='MENTOR_QUESTION' AND target_kind IN ('PLAN_REVISION','MANUSCRIPT_SNAPSHOT')));

CREATE TABLE manuscript_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES draft_workspaces(id) ON DELETE RESTRICT,
  path varchar(240) NOT NULL, kind varchar(16) NOT NULL CHECK(kind IN ('TEXT','ASSET','FOLDER')),
  version integer NOT NULL DEFAULT 1 CHECK(version > 0), sequence integer NOT NULL DEFAULT 0 CHECK(sequence >= 0),
  crdt_state bytea, asset_data bytea, mime_type varchar(80), size_bytes integer NOT NULL DEFAULT 0 CHECK(size_bytes BETWEEN 0 AND 5242880),
  checksum char(64), deleted_at timestamptz, created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manuscript_file_payload_check CHECK(
    (kind='TEXT' AND crdt_state IS NOT NULL AND asset_data IS NULL) OR
    (kind='ASSET' AND crdt_state IS NULL AND asset_data IS NOT NULL) OR
    (kind='FOLDER' AND crdt_state IS NULL AND asset_data IS NULL)),
  CONSTRAINT manuscript_file_path_check CHECK(path !~ '(^/|\\|(^|/)\.\.?(/|$)|[[:cntrl:]])'),
  UNIQUE(id,workspace_id)
);
CREATE UNIQUE INDEX manuscript_files_live_path_key ON manuscript_files(workspace_id,lower(path)) WHERE deleted_at IS NULL;
CREATE INDEX manuscript_files_workspace_id_deleted_at_path_idx ON manuscript_files(workspace_id,deleted_at,path);
ALTER TABLE draft_workspaces ADD CONSTRAINT draft_workspaces_main_file_id_fkey FOREIGN KEY(main_file_id) REFERENCES manuscript_files(id) ON DELETE RESTRICT;

CREATE TABLE manuscript_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), file_id uuid NOT NULL REFERENCES manuscript_files(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, client_session_id uuid NOT NULL,
  client_sequence integer NOT NULL CHECK(client_sequence > 0), server_sequence integer NOT NULL CHECK(server_sequence >= 0),
  update bytea NOT NULL CHECK(octet_length(update) <= 2097152), checksum char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(file_id,actor_id,client_session_id,client_sequence)
);
CREATE INDEX manuscript_updates_file_id_server_sequence_idx ON manuscript_updates(file_id,server_sequence);
CREATE TABLE manuscript_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES draft_workspaces(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT, label varchar(160) NOT NULL,
  source_version integer NOT NULL CHECK(source_version > 0), manifest jsonb NOT NULL, checksum char(64) NOT NULL,
  created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, client_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,created_by_id,client_key), UNIQUE(id,project_id)
);
CREATE INDEX manuscript_snapshots_workspace_id_created_at_idx ON manuscript_snapshots(workspace_id,created_at);
CREATE TABLE manuscript_snapshot_assets (
  snapshot_id uuid NOT NULL REFERENCES manuscript_snapshots(id) ON DELETE RESTRICT,
  file_id uuid NOT NULL REFERENCES manuscript_files(id) ON DELETE RESTRICT,
  data bytea NOT NULL CHECK(octet_length(data) <= 5242880), PRIMARY KEY(snapshot_id,file_id)
);
CREATE TABLE manuscript_compilations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), snapshot_id uuid NOT NULL REFERENCES manuscript_snapshots(id) ON DELETE RESTRICT,
  requested_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status varchar(24) NOT NULL DEFAULT 'BLOCKED' CHECK(status IN ('BLOCKED','QUEUED','COMPILING','SUCCESS','FAILED','TIMED_OUT')),
  diagnostics text NOT NULL DEFAULT '', pdf_data bytea, checksum char(64), toolchain varchar(200),
  created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  CHECK(status <> 'SUCCESS' OR (pdf_data IS NOT NULL AND checksum IS NOT NULL AND toolchain IS NOT NULL)),
  CHECK(pdf_data IS NULL OR octet_length(pdf_data) <= 26214400)
);
CREATE INDEX manuscript_compilations_snapshot_id_created_at_idx ON manuscript_compilations(snapshot_id,created_at);
ALTER TABLE submission_revisions ADD COLUMN manuscript_snapshot_id uuid REFERENCES manuscript_snapshots(id) ON DELETE RESTRICT;
ALTER TABLE submission_revisions DROP CONSTRAINT submission_revisions_content_type_check;
ALTER TABLE submission_revisions ADD CONSTRAINT submission_revisions_content_type_check CHECK(content_type IN ('PDF','MARKDOWN','LATEX'));

CREATE FUNCTION manuscript_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Manuscript history is append-only'; END $$;
CREATE TRIGGER manuscript_updates_immutable BEFORE UPDATE OR DELETE ON manuscript_updates FOR EACH ROW EXECUTE FUNCTION manuscript_append_only();
CREATE TRIGGER manuscript_snapshots_immutable BEFORE UPDATE OR DELETE ON manuscript_snapshots FOR EACH ROW EXECUTE FUNCTION manuscript_append_only();
CREATE TRIGGER manuscript_snapshot_assets_immutable BEFORE UPDATE OR DELETE ON manuscript_snapshot_assets FOR EACH ROW EXECUTE FUNCTION manuscript_append_only();
CREATE FUNCTION manuscript_file_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.workspace_id <> OLD.workspace_id OR NEW.kind <> OLD.kind THEN
    RAISE EXCEPTION 'Manuscript file identity is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER manuscript_file_identity BEFORE UPDATE ON manuscript_files FOR EACH ROW EXECUTE FUNCTION manuscript_file_identity_guard();
CREATE FUNCTION manuscript_live_main_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM draft_workspaces WHERE main_file_id=OLD.id) AND
     (TG_OP='DELETE' OR NEW.deleted_at IS NOT NULL OR NEW.path NOT LIKE '%.tex') THEN
    RAISE EXCEPTION 'Set another main LaTeX file before removing this source';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER manuscript_live_main BEFORE UPDATE OR DELETE ON manuscript_files FOR EACH ROW EXECUTE FUNCTION manuscript_live_main_guard();
CREATE FUNCTION manuscript_main_file_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.main_file_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM manuscript_files f WHERE f.id=NEW.main_file_id AND f.workspace_id=NEW.id AND f.kind='TEXT' AND f.deleted_at IS NULL AND f.path LIKE '%.tex') THEN
    RAISE EXCEPTION 'Main file must be a live LaTeX file of this manuscript';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER manuscript_main_file BEFORE INSERT OR UPDATE ON draft_workspaces FOR EACH ROW EXECUTE FUNCTION manuscript_main_file_guard();
