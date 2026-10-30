-- Additive evaluation layer. Existing contribution and allocation semantics are retained.
CREATE TABLE contribution_evaluation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK(version>0), title varchar(240) NOT NULL, rationale text NOT NULL,
  default_weight integer NOT NULL DEFAULT 1, max_weight integer NOT NULL DEFAULT 100,
  created_by_id uuid NOT NULL REFERENCES users(id), client_key uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id,version), UNIQUE(project_id,client_key), UNIQUE(id,project_id),
  CHECK(default_weight>=1 AND max_weight BETWEEN default_weight AND 100)
);
CREATE TABLE contribution_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key varchar(100) NOT NULL CHECK(key ~ '^[A-Z0-9][A-Z0-9_-]{1,99}$'), created_by_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(project_id,key), UNIQUE(id,project_id)
);
-- Composite foreign keys prevent cross-project source and evaluation substitution.
CREATE UNIQUE INDEX IF NOT EXISTS project_contribution_proposals_id_project_id_key ON project_contribution_proposals(id,project_id);
CREATE TABLE contribution_outcome_sources (
  contribution_id uuid PRIMARY KEY, project_id uuid NOT NULL, outcome_id uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(contribution_id,project_id) REFERENCES project_contribution_proposals(id,project_id),
  FOREIGN KEY(outcome_id,project_id) REFERENCES contribution_outcomes(id,project_id)
);
CREATE INDEX contribution_outcome_sources_project_id_outcome_id_idx ON contribution_outcome_sources(project_id,outcome_id);
CREATE TABLE contribution_outcome_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, outcome_id uuid NOT NULL, rule_id uuid NOT NULL,
  version integer NOT NULL CHECK(version>0), payload jsonb NOT NULL, payload_hash char(64) NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
  created_by_id uuid NOT NULL REFERENCES users(id), client_key uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(outcome_id,project_id) REFERENCES contribution_outcomes(id,project_id),
  FOREIGN KEY(rule_id,project_id) REFERENCES contribution_evaluation_rules(id,project_id),
  UNIQUE(outcome_id,version), UNIQUE(project_id,client_key), UNIQUE(id,project_id)
);
CREATE INDEX contribution_outcome_evaluations_project_id_outcome_id_idx ON contribution_outcome_evaluations(project_id,outcome_id);
CREATE TABLE contribution_evaluation_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, evaluation_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id), kind varchar(24) NOT NULL CHECK(kind IN ('PARTICIPANT','WEIGHT','CHALLENGE')),
  decision varchar(16) NOT NULL CHECK(decision IN ('APPROVE','DISPUTE')), note text NOT NULL DEFAULT '',
  payload_hash char(64) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(evaluation_id,project_id) REFERENCES contribution_outcome_evaluations(id,project_id),
  UNIQUE(evaluation_id,user_id,kind), CHECK(kind<>'CHALLENGE' OR decision='DISPUTE'),
  CHECK(decision<>'DISPUTE' OR length(trim(note))>=10)
);
CREATE INDEX contribution_evaluation_decisions_project_id_evaluation_id_idx ON contribution_evaluation_decisions(project_id,evaluation_id);
CREATE TABLE contribution_evaluation_states (
  project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE, version bigint NOT NULL DEFAULT 0
);
CREATE TABLE contribution_evaluation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, period_id uuid NOT NULL, rule_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id), client_key uuid NOT NULL, status varchar(16) NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','COMPLETED','FAILED')),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(project_id,client_key), UNIQUE(id,project_id),
  FOREIGN KEY(period_id,project_id) REFERENCES allocation_periods(id,project_id),
  FOREIGN KEY(rule_id,project_id) REFERENCES contribution_evaluation_rules(id,project_id)
);
CREATE INDEX contribution_evaluation_runs_status_created_at_idx ON contribution_evaluation_runs(status,created_at);
CREATE TABLE contribution_evaluation_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, period_id uuid NOT NULL, rule_id uuid NOT NULL,
  run_id uuid NOT NULL UNIQUE, input_hash char(64) NOT NULL, input_version bigint NOT NULL, payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,project_id),
  FOREIGN KEY(period_id,project_id) REFERENCES allocation_periods(id,project_id),
  FOREIGN KEY(rule_id,project_id) REFERENCES contribution_evaluation_rules(id,project_id),
  FOREIGN KEY(run_id,project_id) REFERENCES contribution_evaluation_runs(id,project_id)
);
CREATE INDEX contribution_evaluation_snapshots_project_id_period_id_created_at_idx ON contribution_evaluation_snapshots(project_id,period_id,created_at);
ALTER TABLE allocation_revisions ADD COLUMN evaluation_snapshot_id uuid, ADD COLUMN evaluation_reference jsonb;
ALTER TABLE allocation_revisions ADD CONSTRAINT allocation_evaluation_snapshot_project_fkey FOREIGN KEY(evaluation_snapshot_id,project_id) REFERENCES contribution_evaluation_snapshots(id,project_id);

-- Published rules, submitted evaluations, responses and calculation evidence are append-only.
CREATE TRIGGER contribution_rule_immutable BEFORE UPDATE OR DELETE ON contribution_evaluation_rules FOR EACH ROW EXECUTE FUNCTION immutable_contribution_history();
CREATE TRIGGER contribution_evaluation_immutable BEFORE UPDATE OR DELETE ON contribution_outcome_evaluations FOR EACH ROW EXECUTE FUNCTION immutable_contribution_history();
CREATE TRIGGER contribution_evaluation_decision_immutable BEFORE UPDATE OR DELETE ON contribution_evaluation_decisions FOR EACH ROW EXECUTE FUNCTION immutable_contribution_history();
CREATE TRIGGER contribution_evaluation_snapshot_immutable BEFORE UPDATE OR DELETE ON contribution_evaluation_snapshots FOR EACH ROW EXECUTE FUNCTION immutable_contribution_history();

-- Server-side freshness version. Changes outside this module (source corrections, membership)
-- also invalidate suggestions. Conservative project-wide invalidation is deliberate.
CREATE FUNCTION bump_contribution_evaluation_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pid uuid; row_data jsonb;
BEGIN
  row_data := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  IF TG_TABLE_NAME='contribution_participants' THEN
    SELECT project_id INTO pid FROM project_contribution_proposals WHERE id=(row_data->>'proposal_id')::uuid;
  ELSE pid := (row_data->>'project_id')::uuid;
  END IF;
  IF pid IS NOT NULL AND EXISTS(SELECT 1 FROM projects WHERE id=pid) THEN
    INSERT INTO contribution_evaluation_states(project_id,version) VALUES(pid,1)
    ON CONFLICT(project_id) DO UPDATE SET version=contribution_evaluation_states.version+1;
  END IF;
  RETURN NULL;
END $$;
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['project_contribution_proposals','contribution_participants','project_membership_periods','contribution_evaluation_rules','contribution_outcomes','contribution_outcome_sources','contribution_outcome_evaluations','contribution_evaluation_decisions'] LOOP
    EXECUTE format('CREATE TRIGGER contribution_evaluation_freshness AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION bump_contribution_evaluation_version()',tab);
  END LOOP;
END $$;
