ALTER TABLE draft_workspaces
  ADD COLUMN compiler_engine VARCHAR(16),
  ADD COLUMN compiler_release VARCHAR(4),
  ADD COLUMN compiler_revision INTEGER NOT NULL DEFAULT 1 CHECK (compiler_revision > 0),
  ADD CONSTRAINT manuscript_compiler_engine CHECK (compiler_engine IS NULL OR compiler_engine IN ('pdflatex','xelatex','lualatex')),
  ADD CONSTRAINT manuscript_compiler_release CHECK (compiler_release IS NULL OR compiler_release IN ('2022','2025'));
ALTER TABLE manuscript_snapshots ADD COLUMN collaboration_state JSONB;
ALTER TABLE manuscript_suggestions DROP CONSTRAINT manuscript_suggestions_original_check;
ALTER TABLE manuscript_suggestions DROP CONSTRAINT manuscript_suggestions_replacement_check;
ALTER TABLE manuscript_suggestions ADD CONSTRAINT manuscript_suggestions_original_check CHECK (octet_length(original) <= 400000);
ALTER TABLE manuscript_suggestions ADD CONSTRAINT manuscript_suggestions_replacement_check CHECK (octet_length(replacement) <= 400000);
CREATE TABLE manuscript_remote_bindings (
  workspace_id UUID PRIMARY KEY REFERENCES draft_workspaces(id) ON DELETE CASCADE,
  repository VARCHAR(201) NOT NULL,
  branch VARCHAR(200) NOT NULL,
  head CHAR(40) NOT NULL,
  baseline JSONB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
