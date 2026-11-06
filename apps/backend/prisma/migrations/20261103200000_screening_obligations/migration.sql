CREATE TABLE screening_obligations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 paper_id uuid NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
 round_id uuid NOT NULL,
 assignee_id uuid NOT NULL REFERENCES users(id),
 action_type varchar(24) NOT NULL CHECK(action_type IN ('REVIEW','DISCUSSION','CONSENSUS','STATEMENT','ADJUDICATION','COORDINATION','FULLTEXT','INFORMATION')),
 workflow_instance_id varchar(160) NOT NULL,
 status varchar(24) NOT NULL DEFAULT 'TODO' CHECK(status IN ('TODO','IN_PROGRESS','BLOCKED','DONE','EXPIRED','CANCELLED','REPLACED')),
 reason text NOT NULL DEFAULT '', due_at timestamptz, ended_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(round_id,project_id) REFERENCES screening_rounds(id,project_id) ON DELETE CASCADE,
 UNIQUE(round_id,assignee_id,action_type,workflow_instance_id),
 CHECK((ended_at IS NOT NULL) = (status IN ('DONE','EXPIRED','CANCELLED','REPLACED')))
);
CREATE INDEX screening_obligations_project_id_assignee_id_status_updated_at_idx ON screening_obligations(project_id,assignee_id,status,updated_at);
CREATE UNIQUE INDEX screening_obligation_one_active_action ON screening_obligations(round_id,assignee_id,action_type) WHERE ended_at IS NULL;
CREATE TABLE screening_obligation_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 obligation_id uuid NOT NULL REFERENCES screening_obligations(id) ON DELETE CASCADE,
 status varchar(24) NOT NULL CHECK(status IN ('TODO','IN_PROGRESS','BLOCKED','DONE','EXPIRED','CANCELLED','REPLACED')),
 reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX screening_obligation_events_obligation_id_created_at_idx ON screening_obligation_events(obligation_id,created_at);
