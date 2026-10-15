-- Additive project coordination. Existing message IDs, read receipts, and lifecycle stay intact.
ALTER TABLE projects ADD COLUMN research_stage varchar(32);
ALTER TABLE projects ADD CONSTRAINT projects_research_stage_check CHECK (research_stage IS NULL OR research_stage IN ('DISCOVERY','SCREENING','EXTRACTION','GAP_VALIDATION','DESIGN','WRITING','REVIEW'));
ALTER TABLE research_plans ADD COLUMN problem text NOT NULL DEFAULT '', ADD COLUMN objectives text[] NOT NULL DEFAULT '{}', ADD COLUMN questions jsonb NOT NULL DEFAULT '[]', ADD COLUMN scope text NOT NULL DEFAULT '', ADD COLUMN methodology text NOT NULL DEFAULT '', ADD COLUMN search_strategy text NOT NULL DEFAULT '', ADD COLUMN deliverables text[] NOT NULL DEFAULT '{}', ADD COLUMN updated_by_id uuid REFERENCES users(id) ON DELETE SET NULL;
UPDATE research_plans r SET problem=COALESCE(p.description,'') FROM projects p WHERE p.id=r.project_id;
ALTER TABLE mentor_relationships ADD CONSTRAINT mentor_relationships_id_project_unique UNIQUE(id,project_id);

CREATE TABLE plan_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES research_plans(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  snapshot jsonb NOT NULL,
  changed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  change_summary varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan_id,version),
  UNIQUE(id,project_id)
);

CREATE TABLE plan_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision_id uuid NOT NULL,
  relationship_id uuid NOT NULL,
  shared_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(revision_id,project_id) REFERENCES plan_revisions(id,project_id) ON DELETE CASCADE,
  FOREIGN KEY(relationship_id,project_id) REFERENCES mentor_relationships(id,project_id) ON DELETE CASCADE
);

CREATE TABLE project_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title varchar(240) NOT NULL CHECK(length(btrim(title)) > 0),
  description text NOT NULL DEFAULT '',
  due_at timestamptz,
  status varchar(24) NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','COMPLETE')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,project_id)
);

CREATE TABLE project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title varchar(240) NOT NULL CHECK(length(btrim(title))>0),
  description text NOT NULL DEFAULT '',
  status varchar(24) NOT NULL DEFAULT 'TODO' CHECK(status IN ('TODO','IN_PROGRESS','BLOCKED','DONE')),
  blocked_reason text NOT NULL DEFAULT '',
  assignee_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  milestone_id uuid,
  due_at timestamptz,
  completed_at timestamptz,
  target_kind varchar(32),
  target_id uuid,
  client_key uuid NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id,created_by_id,client_key),
  UNIQUE(id,project_id),
  FOREIGN KEY(milestone_id,project_id) REFERENCES project_milestones(id,project_id) ON DELETE RESTRICT,
  CHECK(status<>'BLOCKED' OR length(btrim(blocked_reason))>0),
  CHECK((status='DONE')=(completed_at IS NOT NULL)),
  CHECK((target_kind IS NULL)=(target_id IS NULL))
);

CREATE TABLE project_discussions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title varchar(240) NOT NULL CHECK(length(btrim(title))>0),
  body text NOT NULL,
  category varchar(32) NOT NULL DEFAULT 'GENERAL' CHECK(category IN ('GENERAL','RESEARCH_QUESTION','EVIDENCE','DECISION_NEEDED','MENTOR_QUESTION')),
  status varchar(16) NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','RESOLVED')),
  conclusion text NOT NULL DEFAULT '',
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  target_kind varchar(32),
  target_id uuid,
  mentor_relationship_id uuid,
  client_key uuid NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id,author_id,client_key),
  UNIQUE(id,project_id),
  FOREIGN KEY(mentor_relationship_id,project_id) REFERENCES mentor_relationships(id,project_id) ON DELETE RESTRICT,
  CHECK((target_kind IS NULL)=(target_id IS NULL)),
  CHECK(mentor_relationship_id IS NULL OR (category='MENTOR_QUESTION' AND target_kind='PLAN_REVISION')),
  CHECK(status<>'RESOLVED' OR length(btrim(conclusion))>0)
);

CREATE TABLE project_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  decision varchar(500) NOT NULL CHECK(length(btrim(decision))>0),
  context text NOT NULL DEFAULT '',
  alternatives text NOT NULL DEFAULT '',
  rationale text NOT NULL CHECK(length(btrim(rationale))>0),
  target_kind varchar(32),
  target_id uuid,
  thread_id uuid,
  recorded_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,project_id),
  FOREIGN KEY(thread_id,project_id) REFERENCES project_discussions(id,project_id) ON DELETE RESTRICT,
  CHECK((target_kind IS NULL)=(target_id IS NULL))
);

CREATE TABLE project_workspace_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_kind varchar(32) NOT NULL CHECK(target_kind IN ('TASK','PLAN_REVISION')),
  target_id uuid NOT NULL,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 10000),
  client_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id,author_id,client_key)
);

CREATE TABLE project_workspace_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_kind varchar(32) NOT NULL CHECK(entity_kind IN ('TASK','MILESTONE','DISCUSSION','DECISION')),
  entity_id uuid NOT NULL,
  version integer NOT NULL CHECK(version>0),
  snapshot jsonb NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entity_kind,entity_id,version)
);

CREATE INDEX plan_revisions_project_created_idx ON plan_revisions(project_id,created_at);
CREATE INDEX plan_shares_access_idx ON plan_shares(project_id,relationship_id,revoked_at);
CREATE UNIQUE INDEX plan_shares_live_unique ON plan_shares(revision_id,relationship_id) WHERE revoked_at IS NULL;
CREATE INDEX project_milestones_list_idx ON project_milestones(project_id,status,due_at);
CREATE INDEX project_tasks_list_idx ON project_tasks(project_id,deleted_at,status,due_at);
CREATE INDEX project_tasks_assignee_idx ON project_tasks(project_id,assignee_id,updated_at);
CREATE INDEX project_discussions_list_idx ON project_discussions(project_id,status,updated_at);
CREATE INDEX project_decisions_list_idx ON project_decisions(project_id,updated_at);
CREATE INDEX project_workspace_comments_list_idx ON project_workspace_comments(project_id,target_kind,target_id,created_at);
CREATE INDEX project_workspace_revisions_list_idx ON project_workspace_revisions(project_id,entity_kind,entity_id,created_at);
ALTER TABLE project_team_messages ADD COLUMN thread_id uuid, ADD COLUMN reply_to_id uuid, ADD CONSTRAINT project_team_messages_id_project_unique UNIQUE(id,project_id), ADD CONSTRAINT project_team_messages_thread_fk FOREIGN KEY(thread_id,project_id) REFERENCES project_discussions(id,project_id) ON DELETE RESTRICT, ADD CONSTRAINT project_team_messages_reply_fk FOREIGN KEY(reply_to_id,project_id) REFERENCES project_team_messages(id,project_id) ON DELETE RESTRICT;
CREATE INDEX project_team_messages_thread_idx ON project_team_messages(thread_id,created_at,id);
ALTER TABLE project_team_messages ADD COLUMN client_key uuid;
CREATE UNIQUE INDEX project_team_messages_client_key_unique ON project_team_messages(project_id,sender_id,client_key);

-- Preserve the observed state without attributing an unknown historical revision to an owner.
INSERT INTO plan_revisions(project_id,plan_id,version,snapshot,created_at)
SELECT p.id,r.id,r.version,jsonb_build_object('approach',r.approach,'problem',r.problem,'objectives',r.objectives,'questions',r.questions,'scope',r.scope,'methodology',r.methodology,'searchStrategy',r.search_strategy,'deliverables',r.deliverables,'inclusionCriteria',p.inclusion_criteria,'exclusionCriteria',p.exclusion_criteria),r.updated_at
FROM research_plans r JOIN projects p ON p.id=r.project_id;

CREATE FUNCTION protect_workspace_revision_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Workspace revisions are immutable; append a new revision' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER immutable_plan_revision BEFORE UPDATE ON plan_revisions FOR EACH ROW EXECUTE FUNCTION protect_workspace_revision_update();
CREATE TRIGGER immutable_workspace_revision BEFORE UPDATE ON project_workspace_revisions FOR EACH ROW EXECUTE FUNCTION protect_workspace_revision_update();
-- Root deletion remains subject to the service's empty-project history guard.
