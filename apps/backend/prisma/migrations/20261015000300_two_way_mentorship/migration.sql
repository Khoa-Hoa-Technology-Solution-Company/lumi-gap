-- Only explicitly approved fields belong in mentorship discovery. Do not copy private project metadata.
ALTER TABLE projects
  ADD COLUMN mentorship_research_areas text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN mentorship_needs varchar(2000) NOT NULL DEFAULT '';

CREATE TABLE mentor_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  mentor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  suggested_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  message varchar(1000) NOT NULL CHECK (length(btrim(message)) > 0),
  status varchar(24) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','INVITED','DISMISSED')),
  request_id uuid REFERENCES mentorship_requests(id) ON DELETE SET NULL,
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX mentor_suggestions_pending_pair ON mentor_suggestions(project_id,mentor_user_id) WHERE status='PENDING';
CREATE INDEX mentor_suggestions_project_id_status_created_at_idx ON mentor_suggestions(project_id,status,created_at);
