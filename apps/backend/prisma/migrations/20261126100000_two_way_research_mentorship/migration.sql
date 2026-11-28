BEGIN;

-- 1. Project structured mentor recruitment profile & owner-approved prospective access policy
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS mentorship_profile JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. Contextual per-member profile sharing consent for mentor discovery (opt-in by default)
ALTER TABLE project_members
  ADD COLUMN IF NOT EXISTS mentorship_profile_shared BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mentorship_role_note VARCHAR(200),
  ADD COLUMN IF NOT EXISTS mentorship_consent_updated_at TIMESTAMPTZ(6);

-- 3. Versioned formal two-way mentorship proposals & counter-proposals
ALTER TABLE mentorship_requests
  ADD COLUMN IF NOT EXISTS proposal_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS previous_request_id UUID,
  ADD COLUMN IF NOT EXISTS terms_snapshot JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mentorship_requests_proposal_version_check'
  ) THEN
    ALTER TABLE mentorship_requests
      ADD CONSTRAINT mentorship_requests_proposal_version_check CHECK (proposal_version >= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mentorship_requests_previous_request_id_fkey'
  ) THEN
    ALTER TABLE mentorship_requests
      ADD CONSTRAINT mentorship_requests_previous_request_id_fkey
      FOREIGN KEY (previous_request_id) REFERENCES mentorship_requests(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS mentorship_requests_previous_request_id_idx
  ON mentorship_requests(previous_request_id);

-- Extend mentorship_requests status check with SUPERSEDED for versioned counter-proposals
ALTER TABLE mentorship_requests DROP CONSTRAINT IF EXISTS mentorship_requests_status_check;
ALTER TABLE mentorship_requests ADD CONSTRAINT mentorship_requests_status_check
  CHECK (status IN (
    'PENDING',
    'ACCEPTED',
    'DECLINED',
    'CANCELLED',
    'CANCELED_BY_PROJECT',
    'EXPIRED',
    'CLOSED_CAPACITY_REACHED',
    'SUPERSEDED'
  ));

-- Preserve immutability of sent request content, role, version, and structured terms snapshot
CREATE OR REPLACE FUNCTION guard_mentor_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM projects WHERE id = NEW.project_id FOR UPDATE;
  IF TG_OP = 'UPDATE' AND (
    NEW.project_id <> OLD.project_id OR
    NEW.mentor_user_id <> OLD.mentor_user_id OR
    NEW.mentor_role <> OLD.mentor_role OR
    NEW.requested_by <> OLD.requested_by OR
    NEW.direction <> OLD.direction OR
    NEW.message IS DISTINCT FROM OLD.message OR
    NEW.invitation_snapshot IS DISTINCT FROM OLD.invitation_snapshot OR
    NEW.terms_snapshot IS DISTINCT FROM OLD.terms_snapshot OR
    NEW.proposal_version <> OLD.proposal_version OR
    NEW.previous_request_id IS DISTINCT FROM OLD.previous_request_id OR
    NEW.candidate_id IS DISTINCT FROM OLD.candidate_id OR
    NEW.reservation_enforced <> OLD.reservation_enforced
  ) THEN
    RAISE EXCEPTION 'Sent invitation content and role are immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'PENDING' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF NEW.candidate_id IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM mentor_candidates c JOIN mentor_invitation_plans p ON p.id = c.plan_id
      WHERE c.id = NEW.candidate_id AND p.project_id = NEW.project_id AND p.status = 'ACTIVE'
        AND c.mentor_user_id = NEW.mentor_user_id AND (NEW.mentor_role = 'UNASSIGNED' OR c.mentor_role = NEW.mentor_role) AND c.status = 'PLANNED'
    ) THEN
      RAISE EXCEPTION 'Candidate must match this project and lecturer' USING ERRCODE = '23514';
    END IF;
    IF NEW.mentor_role <> 'UNASSIGNED' AND (
      NOT NEW.reservation_enforced OR
      EXISTS(SELECT 1 FROM mentorship_requests WHERE project_id = NEW.project_id AND mentor_role = NEW.mentor_role AND status = 'PENDING' AND id <> NEW.id) OR
      EXISTS(SELECT 1 FROM mentor_relationships WHERE project_id = NEW.project_id AND mentor_role = NEW.mentor_role AND status = 'ACTIVE')
    ) THEN
      RAISE EXCEPTION 'Mentor role is already reserved or assigned' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- 4. Private clarification messages between owner and lecturer on a mentorship request
CREATE TABLE IF NOT EXISTS mentorship_request_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL,
  project_id UUID NOT NULL,
  author_id UUID NOT NULL,
  body VARCHAR(2000) NOT NULL,
  client_key UUID NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT mentorship_request_messages_pkey PRIMARY KEY (id),
  CONSTRAINT mentorship_request_messages_request_id_fkey
    FOREIGN KEY (request_id) REFERENCES mentorship_requests(id) ON DELETE CASCADE,
  CONSTRAINT mentorship_request_messages_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT mentorship_request_messages_author_id_fkey
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT mentorship_request_messages_body_check CHECK (char_length(btrim(body)) >= 5)
);

CREATE UNIQUE INDEX IF NOT EXISTS mentorship_request_messages_request_author_key
  ON mentorship_request_messages(request_id, author_id, client_key);
CREATE INDEX IF NOT EXISTS mentorship_request_messages_request_created_idx
  ON mentorship_request_messages(request_id, created_at);
CREATE INDEX IF NOT EXISTS mentorship_request_messages_project_request_idx
  ON mentorship_request_messages(project_id, request_id);

COMMIT;
