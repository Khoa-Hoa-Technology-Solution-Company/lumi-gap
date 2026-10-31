-- Additive protocol. Historical statuses, votes and workspace revisions remain untouched.
CREATE TABLE screening_settings (
 project_id uuid PRIMARY KEY REFERENCES projects(id), version integer NOT NULL DEFAULT 1 CHECK(version>0),
 required_reviewers integer NOT NULL DEFAULT 2 CHECK(required_reviewers BETWEEN 2 AND 10),
 consensus_policy varchar(24) NOT NULL DEFAULT 'UNANIMOUS' CHECK(consensus_policy IN ('UNANIMOUS','STRICT_MAJORITY')),
 ai_assisted boolean NOT NULL DEFAULT false, inclusion_criteria text[] NOT NULL DEFAULT '{}',
 exclusion_criteria text[] NOT NULL DEFAULT '{}', research_questions text[] NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE screening_rounds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, paper_id uuid NOT NULL,
 number integer NOT NULL CHECK(number>0), phase varchar(24) NOT NULL CHECK(phase IN ('TITLE_ABSTRACT','FULL_TEXT')),
 active boolean NOT NULL DEFAULT true, settings jsonb NOT NULL, status varchar(24) NOT NULL DEFAULT 'NOT_REVIEWED'
 CHECK(status IN ('NOT_REVIEWED','IN_REVIEW','NEEDS_RESOLUTION','INCLUDED','EXCLUDED')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), unblinded_at timestamptz, independence_compromised boolean NOT NULL DEFAULT false,
 created_by_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(project_id,paper_id) REFERENCES project_papers(project_id,paper_id), UNIQUE(id,project_id), UNIQUE(project_id,paper_id,number)
);
CREATE UNIQUE INDEX screening_rounds_current ON screening_rounds(project_id,paper_id) WHERE active;
CREATE INDEX screening_rounds_project_id_active_status_idx ON screening_rounds(project_id,active,status);
CREATE TABLE screening_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, round_id uuid NOT NULL, reviewer_id uuid NOT NULL REFERENCES users(id),
 active boolean NOT NULL DEFAULT true, revision integer NOT NULL DEFAULT 1 CHECK(revision>0), submitted_at timestamptz, due_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(round_id,project_id) REFERENCES screening_rounds(id,project_id),
 UNIQUE(round_id,reviewer_id), UNIQUE(id,project_id)
);
CREATE INDEX screening_assignments_project_id_reviewer_id_active_submitted_at_idx ON screening_assignments(project_id,reviewer_id,active,submitted_at);
CREATE TABLE screening_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, assignment_id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0),
 decision varchar(16) NOT NULL CHECK(decision IN ('INCLUDE','EXCLUDE','UNSURE')), exclusion_reason varchar(500) NOT NULL DEFAULT '',
 comment text NOT NULL DEFAULT '', submitted_at timestamptz NOT NULL DEFAULT now(),
 CHECK(decision<>'EXCLUDE' OR length(trim(exclusion_reason))>=3),
 FOREIGN KEY(assignment_id,project_id) REFERENCES screening_assignments(id,project_id), UNIQUE(assignment_id,revision)
);
CREATE INDEX screening_reviews_project_id_assignment_id_idx ON screening_reviews(project_id,assignment_id);
CREATE TABLE screening_final_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, round_id uuid NOT NULL, round_version integer NOT NULL,
 decision varchar(16) NOT NULL CHECK(decision IN ('INCLUDED','EXCLUDED')), source varchar(16) NOT NULL CHECK(source IN ('CONSENSUS','MANUAL')),
 reason text NOT NULL CHECK(length(trim(reason))>=3), resolver_id uuid REFERENCES users(id), review_ids uuid[] NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(round_id,project_id) REFERENCES screening_rounds(id,project_id), UNIQUE(round_id,round_version)
);
CREATE INDEX screening_final_decisions_project_id_round_id_created_at_idx ON screening_final_decisions(project_id,round_id,created_at);
CREATE TABLE screening_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id), round_id uuid, actor_id uuid NOT NULL REFERENCES users(id),
 type varchar(48) NOT NULL, details jsonb NOT NULL DEFAULT '{}', client_key uuid, request_hash varchar(64), result jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(round_id,project_id) REFERENCES screening_rounds(id,project_id), UNIQUE(project_id,actor_id,client_key)
);
CREATE INDEX screening_audit_project_id_round_id_created_at_idx ON screening_audit(project_id,round_id,created_at);
CREATE TABLE screening_legacy_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, paper_id uuid NOT NULL, snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(project_id,paper_id) REFERENCES project_papers(project_id,paper_id), UNIQUE(project_id,paper_id)
);
INSERT INTO screening_legacy_records(project_id,paper_id,snapshot)
 SELECT project_id,paper_id,jsonb_build_object('provenance','LEGACY_SHARED_STATUS','status',screening_status,
 'screenedById',screened_by_id,'screenedAt',screened_at,'inclusionReason',inclusion_reason,'exclusionReason',exclusion_reason,'exclusionNote',exclusion_note)
 FROM project_papers WHERE screening_status<>'UNDECIDED' OR screened_at IS NOT NULL;
CREATE TABLE screening_ai_suggestions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, round_id uuid NOT NULL, actor_id uuid NOT NULL REFERENCES users(id),
 client_key uuid NOT NULL, status varchar(16) NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','COMPLETED','FAILED')),
 input jsonb NOT NULL, input_hash varchar(64) NOT NULL, result jsonb, created_at timestamptz NOT NULL DEFAULT now(), generated_at timestamptz,
 FOREIGN KEY(round_id,project_id) REFERENCES screening_rounds(id,project_id), UNIQUE(project_id,actor_id,client_key),
 CHECK(status<>'COMPLETED' OR (result IS NOT NULL AND generated_at IS NOT NULL))
);
CREATE INDEX screening_ai_suggestions_project_id_round_id_created_at_idx ON screening_ai_suggestions(project_id,round_id,created_at);
CREATE INDEX screening_ai_suggestions_status_created_at_idx ON screening_ai_suggestions(status,created_at);
CREATE FUNCTION protect_screening_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Screening history is append-only'; END $$;
CREATE TRIGGER immutable_screening_reviews BEFORE UPDATE OR DELETE ON screening_reviews FOR EACH ROW EXECUTE FUNCTION protect_screening_record();
CREATE TRIGGER immutable_screening_finals BEFORE UPDATE OR DELETE ON screening_final_decisions FOR EACH ROW EXECUTE FUNCTION protect_screening_record();
CREATE TRIGGER immutable_screening_audit BEFORE UPDATE OR DELETE ON screening_audit FOR EACH ROW EXECUTE FUNCTION protect_screening_record();
CREATE TRIGGER immutable_screening_legacy BEFORE UPDATE OR DELETE ON screening_legacy_records FOR EACH ROW EXECUTE FUNCTION protect_screening_record();
CREATE FUNCTION protect_screening_ai_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF OLD.status='COMPLETED' THEN RAISE EXCEPTION 'Completed AI screening suggestions are immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER immutable_screening_ai BEFORE UPDATE OR DELETE ON screening_ai_suggestions FOR EACH ROW EXECUTE FUNCTION protect_screening_ai_result();
