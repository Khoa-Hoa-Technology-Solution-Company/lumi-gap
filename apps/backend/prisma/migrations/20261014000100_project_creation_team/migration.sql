-- Additive migration. Existing pending-invitation unique indexes remain authoritative.
ALTER TABLE projects
  ADD COLUMN research_areas TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN public_summary VARCHAR(2000),
  ADD COLUMN created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN creation_key VARCHAR(128),
  ADD COLUMN creation_request_hash VARCHAR(64),
  ADD COLUMN version INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT projects_research_areas_check CHECK (cardinality(research_areas) <= 3),
  ADD CONSTRAINT projects_version_check CHECK (version > 0);
-- Do not invent historical creator attribution from today's owner.
UPDATE projects SET research_areas = ARRAY[research_field]
  WHERE NULLIF(TRIM(research_field), '') IS NOT NULL;
CREATE UNIQUE INDEX projects_created_by_id_creation_key_key ON projects(created_by_id, creation_key);
ALTER TABLE projects DROP CONSTRAINT projects_visibility_check;
ALTER TABLE projects ADD CONSTRAINT projects_visibility_check
  CHECK (visibility IN ('PRIVATE', 'PUBLIC', 'INVITE_ONLY', 'PUBLIC_SUMMARY'));
-- Existing public projects publish only the title until an owner approves a summary.
ALTER TABLE project_invitations ADD COLUMN last_sent_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE project_invitations SET last_sent_at = updated_at;

CREATE TABLE research_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  approach VARCHAR(32) NOT NULL DEFAULT 'UNDECIDED',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT research_plans_approach_check CHECK (approach IN ('EXPLORATORY','LITERATURE_REVIEW','EMPIRICAL','UNDECIDED'))
);
INSERT INTO research_plans(project_id) SELECT id FROM projects;

-- Repair the compatibility mirror from the canonical owner before enforcing uniqueness.
UPDATE project_members m SET role = 'MEMBER'
  FROM projects p WHERE m.project_id = p.id AND m.user_id <> p.owner_id AND m.role = 'OWNER';
INSERT INTO project_members(id, project_id, user_id, role, status, joined_at, created_at, updated_at)
  SELECT gen_random_uuid(), id, owner_id, 'OWNER', 'ACTIVE', created_at, created_at, CURRENT_TIMESTAMP FROM projects
  ON CONFLICT(project_id,user_id) DO UPDATE SET role = 'OWNER', status = 'ACTIVE';
CREATE UNIQUE INDEX project_members_one_active_owner_key ON project_members(project_id)
  WHERE role = 'OWNER' AND status = 'ACTIVE';

CREATE FUNCTION check_project_owner_membership() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE target UUID;
BEGIN
  IF TG_TABLE_NAME = 'projects' THEN target := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN target := OLD.project_id;
  ELSE target := NEW.project_id;
  END IF;
  IF EXISTS(SELECT 1 FROM projects p WHERE p.id = target AND NOT EXISTS (
    SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = p.owner_id
      AND m.role = 'OWNER' AND m.status = 'ACTIVE'
  )) THEN RAISE EXCEPTION 'Project requires an active canonical owner' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER projects_owner_membership_check AFTER INSERT OR UPDATE ON projects
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_project_owner_membership();
CREATE CONSTRAINT TRIGGER members_owner_membership_check AFTER INSERT OR UPDATE OR DELETE ON project_members
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_project_owner_membership();
