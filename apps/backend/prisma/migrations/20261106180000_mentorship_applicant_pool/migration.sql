-- Additive: existing requests/relationships/access policies are not reinterpreted.
ALTER TABLE projects ADD COLUMN mentorship_methodologies TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE TABLE mentorship_applications (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 lecturer_id UUID NOT NULL REFERENCES users(id), mentor_role VARCHAR(16) NOT NULL DEFAULT 'PRIMARY',
 message VARCHAR(2000) NOT NULL, areas TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 methodologies TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], capabilities TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 availability VARCHAR(1000) NOT NULL, status VARCHAR(24) NOT NULL DEFAULT 'APPLIED', version INTEGER NOT NULL DEFAULT 1,
 submission_key UUID NOT NULL, submission_hash VARCHAR(64) NOT NULL,
 created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT mentorship_applications_project_id_lecturer_id_key UNIQUE(project_id, lecturer_id),
 CONSTRAINT mentorship_applications_lecturer_id_submission_key_key UNIQUE(lecturer_id, submission_key),
 CONSTRAINT mentorship_applications_id_project_id_key UNIQUE(id, project_id),
 CONSTRAINT mentorship_applications_id_project_id_lecturer_id_key UNIQUE(id, project_id, lecturer_id),
 CONSTRAINT mentorship_application_role CHECK (mentor_role IN ('PRIMARY','SECONDARY')),
 CONSTRAINT mentorship_application_status CHECK (status IN ('APPLIED','SHORTLISTED','INVITED','ACCEPTED','DECLINED','WITHDRAWN','CLOSED')),
 CONSTRAINT mentorship_application_version CHECK (version > 0)
);
CREATE INDEX mentorship_applications_project_id_status_created_at_idx ON mentorship_applications(project_id,status,created_at);
CREATE INDEX mentorship_applications_lecturer_id_updated_at_idx ON mentorship_applications(lecturer_id,updated_at);
ALTER TABLE mentorship_requests ADD COLUMN application_id UUID;
ALTER TABLE mentorship_requests ADD CONSTRAINT mentorship_request_application_scope_fk
 FOREIGN KEY(application_id,project_id,mentor_user_id) REFERENCES mentorship_applications(id,project_id,lecturer_id);
CREATE INDEX mentorship_requests_application_id_created_at_idx ON mentorship_requests(application_id,created_at);
CREATE TABLE mentorship_application_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), application_id UUID NOT NULL REFERENCES mentorship_applications(id) ON DELETE CASCADE,
 actor_id UUID NOT NULL REFERENCES users(id), type VARCHAR(32) NOT NULL, details JSONB NOT NULL DEFAULT '{}',
 created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX mentorship_application_events_application_id_created_at_idx ON mentorship_application_events(application_id,created_at);
CREATE TABLE mentorship_application_notes (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), application_id UUID NOT NULL REFERENCES mentorship_applications(id) ON DELETE CASCADE,
 author_id UUID NOT NULL REFERENCES users(id), body VARCHAR(2000) NOT NULL, client_key UUID NOT NULL,
 created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT mentorship_application_notes_application_id_author_id_client_key_key UNIQUE(application_id,author_id,client_key)
);
CREATE INDEX mentorship_application_notes_application_id_created_at_idx ON mentorship_application_notes(application_id,created_at);
