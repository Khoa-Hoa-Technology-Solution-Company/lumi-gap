ALTER TABLE screening_settings ADD COLUMN preferred_adjudicator_id uuid, ADD COLUMN adjudication_coordinator_ids uuid[] NOT NULL DEFAULT '{}', ADD COLUMN statement_window_hours integer NOT NULL DEFAULT 48 CHECK(statement_window_hours BETWEEN 1 AND 336);
CREATE TABLE screening_adjudication_cases (
 id uuid PRIMARY KEY, project_id uuid NOT NULL, round_id uuid NOT NULL, active boolean NOT NULL DEFAULT true,
 status varchar(32) NOT NULL DEFAULT 'WAITING_ASSIGNMENT' CHECK(status IN ('WAITING_ASSIGNMENT','INVITED','ACCEPTED','IN_PROGRESS','COI_REVIEW','COMPLETED','CANCELLED_AS_RESOLVED','CANCELLED_REOPENED')),
 version integer NOT NULL DEFAULT 1 CHECK(version > 0), packet_version integer NOT NULL DEFAULT 1 CHECK(packet_version > 0), packet jsonb NOT NULL,
 reviewer_ids uuid[] NOT NULL CHECK(cardinality(reviewer_ids)=2 AND reviewer_ids[1]<>reviewer_ids[2]), requested_by_ids uuid[] NOT NULL,
 deadline timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 UNIQUE(id,project_id), FOREIGN KEY(round_id,project_id) REFERENCES screening_rounds(id,project_id) ON DELETE CASCADE,
 CHECK(active = (status NOT IN ('COMPLETED','CANCELLED_AS_RESOLVED','CANCELLED_REOPENED')))
);
CREATE UNIQUE INDEX screening_adjudication_one_active ON screening_adjudication_cases(round_id) WHERE active;
CREATE INDEX screening_adjudication_cases_project_id_round_id_created_at_idx ON screening_adjudication_cases(project_id,round_id,created_at);
CREATE TABLE screening_adjudication_invitations (
 id uuid PRIMARY KEY, project_id uuid NOT NULL, case_id uuid NOT NULL, user_id uuid NOT NULL REFERENCES users(id), role varchar(32) NOT NULL,
 status varchar(16) NOT NULL DEFAULT 'SENT' CHECK(status IN ('SENT','ACCEPTED','DECLINED','REVOKED')),
 created_at timestamptz NOT NULL DEFAULT now(), responded_at timestamptz,
 UNIQUE(case_id,user_id), FOREIGN KEY(case_id,project_id) REFERENCES screening_adjudication_cases(id,project_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX screening_adjudication_one_invitation ON screening_adjudication_invitations(case_id) WHERE status IN ('SENT','ACCEPTED');
CREATE INDEX screening_adjudication_invitations_project_id_user_id_status_idx ON screening_adjudication_invitations(project_id,user_id,status);
CREATE TABLE screening_adjudication_statements (
 id uuid PRIMARY KEY, project_id uuid NOT NULL, case_id uuid NOT NULL, reviewer_id uuid NOT NULL REFERENCES users(id), packet_version integer NOT NULL,
 revision integer NOT NULL CHECK(revision > 0), use_existing boolean NOT NULL, text text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(case_id,reviewer_id,revision),
 FOREIGN KEY(case_id,project_id) REFERENCES screening_adjudication_cases(id,project_id) ON DELETE CASCADE
);
CREATE TABLE screening_adjudication_conflicts (
 id uuid PRIMARY KEY, project_id uuid NOT NULL, case_id uuid NOT NULL, invitation_id uuid NOT NULL REFERENCES screening_adjudication_invitations(id),
 reported_by_id uuid NOT NULL REFERENCES users(id), reason text NOT NULL, resolved_by_id uuid REFERENCES users(id), resolution text, upheld boolean,
 created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz,
 FOREIGN KEY(case_id,project_id) REFERENCES screening_adjudication_cases(id,project_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX screening_adjudication_one_open_report ON screening_adjudication_conflicts(invitation_id,reported_by_id) WHERE resolved_at IS NULL;
