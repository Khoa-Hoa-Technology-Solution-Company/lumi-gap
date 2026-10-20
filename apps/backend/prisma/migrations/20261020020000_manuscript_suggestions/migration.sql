CREATE TABLE manuscript_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES draft_workspaces(id) ON DELETE CASCADE,
  file_id UUID NOT NULL,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  client_key UUID NOT NULL,
  original TEXT NOT NULL CHECK (octet_length(original) <= 32000),
  replacement TEXT NOT NULL CHECK (octet_length(replacement) <= 32000),
  note VARCHAR(2000) NOT NULL DEFAULT '',
  anchor JSONB NOT NULL,
  source_sequence INTEGER NOT NULL CHECK (source_sequence >= 0),
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED')),
  resolved_by_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT manuscript_suggestion_file_scope FOREIGN KEY(file_id, workspace_id) REFERENCES manuscript_files(id, workspace_id) ON DELETE CASCADE,
  CONSTRAINT manuscript_suggestion_resolution CHECK ((status = 'PENDING' AND resolved_by_id IS NULL AND resolved_at IS NULL) OR (status <> 'PENDING' AND resolved_by_id IS NOT NULL AND resolved_at IS NOT NULL)),
  UNIQUE(workspace_id, author_id, client_key)
);
CREATE INDEX manuscript_suggestions_workspace_status_created ON manuscript_suggestions(workspace_id, status, created_at);
