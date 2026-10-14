BEGIN;
ALTER TABLE project_activities ADD COLUMN source_module varchar(32), ADD COLUMN artifact_version integer, ADD COLUMN idempotency_key varchar(160);
CREATE UNIQUE INDEX project_activities_project_id_idempotency_key_key ON project_activities(project_id, idempotency_key);
ALTER TABLE project_contribution_proposals ADD COLUMN title varchar(240) NOT NULL DEFAULT '', ADD COLUMN source varchar(24) NOT NULL DEFAULT 'LEGACY', ADD COLUMN work_date timestamptz NOT NULL DEFAULT now(), ADD COLUMN version integer NOT NULL DEFAULT 1, ADD COLUMN client_key uuid, ADD COLUMN evidence_refs jsonb NOT NULL DEFAULT '[]';
CREATE UNIQUE INDEX project_contribution_proposals_project_id_proposed_by_id_client_key_key ON project_contribution_proposals(project_id, proposed_by_id, client_key);
CREATE UNIQUE INDEX project_contribution_proposals_id_project_id_key ON project_contribution_proposals(id, project_id);
ALTER TABLE project_contribution_history ADD COLUMN version integer NOT NULL DEFAULT 1, ADD COLUMN snapshot jsonb NOT NULL DEFAULT '{}';
CREATE TABLE project_membership_periods (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, joined_at timestamptz NOT NULL, left_at timestamptz,
 provenance varchar(32) NOT NULL, CHECK(left_at IS NULL OR left_at >= joined_at)
);
CREATE INDEX project_membership_periods_project_id_joined_at_left_at_idx ON project_membership_periods(project_id, joined_at, left_at);
CREATE INDEX project_membership_periods_project_id_user_id_idx ON project_membership_periods(project_id, user_id);
CREATE UNIQUE INDEX membership_one_open_interval ON project_membership_periods(project_id, user_id) WHERE left_at IS NULL;
-- These rows prove retained membership only. Earlier lost/replaced intervals are unknown.
INSERT INTO project_membership_periods(project_id,user_id,joined_at,left_at,provenance)
 SELECT project_id,user_id,joined_at,CASE WHEN status='ACTIVE' THEN NULL ELSE GREATEST(updated_at,joined_at) END,'LEGACY_RETAINED' FROM project_members;
CREATE FUNCTION capture_project_membership_period() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
   UPDATE project_membership_periods SET left_at=GREATEST(now(),joined_at) WHERE project_id=OLD.project_id AND user_id=OLD.user_id AND left_at IS NULL;
   RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND (NEW.project_id<>OLD.project_id OR NEW.user_id<>OLD.user_id) THEN RAISE EXCEPTION 'Membership identity is immutable'; END IF;
 IF TG_OP='INSERT' OR (TG_OP='UPDATE' AND OLD.status<>'ACTIVE' AND NEW.status='ACTIVE') THEN
   IF NEW.status='ACTIVE' THEN INSERT INTO project_membership_periods(project_id,user_id,joined_at,provenance) VALUES(NEW.project_id,NEW.user_id,CASE WHEN TG_OP='INSERT' THEN NEW.joined_at ELSE now() END,'RECORDED') ON CONFLICT(project_id,user_id) WHERE left_at IS NULL DO NOTHING; END IF;
 ELSIF OLD.status='ACTIVE' AND NEW.status<>'ACTIVE' THEN
   UPDATE project_membership_periods SET left_at=GREATEST(now(),joined_at) WHERE project_id=NEW.project_id AND user_id=NEW.user_id AND left_at IS NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER project_membership_interval AFTER INSERT OR UPDATE OR DELETE ON project_members FOR EACH ROW EXECUTE FUNCTION capture_project_membership_period();
CREATE TABLE contribution_participants (
 proposal_id uuid NOT NULL REFERENCES project_contribution_proposals(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, roles text[] NOT NULL DEFAULT '{}', PRIMARY KEY(proposal_id,user_id)
);
INSERT INTO contribution_participants(proposal_id,user_id,roles) SELECT id,contributor_id,roles FROM project_contribution_proposals;
UPDATE project_contribution_proposals SET title=left(description,240),work_date=created_at WHERE source='LEGACY';
CREATE TABLE contribution_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL REFERENCES project_contribution_proposals(id) ON DELETE RESTRICT,
 version integer NOT NULL CHECK(version>0), user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 decision varchar(24) NOT NULL CHECK(decision IN ('ACKNOWLEDGE','ACCEPT','NEEDS_CHANGES','DISPUTE')), note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(proposal_id,version,user_id)
);
CREATE TABLE allocation_periods (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
 title varchar(240) NOT NULL, description text NOT NULL, scope varchar(500) NOT NULL,
 period_start timestamptz NOT NULL,period_end timestamptz NOT NULL, policy_version varchar(48) NOT NULL DEFAULT 'CORE_TEAM_UNANIMOUS_V1' CHECK(policy_version='CORE_TEAM_UNANIMOUS_V1'),
 created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,client_key uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(period_end>=period_start), UNIQUE(project_id,client_key), UNIQUE(id,project_id)
);
CREATE INDEX allocation_periods_project_id_created_at_idx ON allocation_periods(project_id,created_at);
CREATE TABLE allocation_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), period_id uuid NOT NULL, project_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0), draft_version integer NOT NULL DEFAULT 1 CHECK(draft_version>0),
 status varchar(24) NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','AWAITING_APPROVAL','DISPUTED','FINALIZED','SUPERSEDED')),
 rationale text NOT NULL DEFAULT '', roster jsonb NOT NULL, evidence_summary jsonb NOT NULL DEFAULT '[]',
 created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, client_key uuid NOT NULL,
 submitted_at timestamptz, finalized_at timestamptz,self_acknowledged boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(period_id,project_id) REFERENCES allocation_periods(id,project_id) ON DELETE RESTRICT,
 UNIQUE(period_id,revision),UNIQUE(period_id,client_key),UNIQUE(id,project_id)
);
CREATE INDEX allocation_revisions_project_id_status_idx ON allocation_revisions(project_id,status);
CREATE UNIQUE INDEX allocation_one_current_final ON allocation_revisions(period_id) WHERE status='FINALIZED';
CREATE UNIQUE INDEX allocation_one_open_revision ON allocation_revisions(period_id) WHERE status IN ('DRAFT','AWAITING_APPROVAL');
CREATE TABLE allocation_shares (
 revision_id uuid NOT NULL REFERENCES allocation_revisions(id) ON DELETE RESTRICT,user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 basis_points integer NOT NULL CHECK(basis_points BETWEEN 0 AND 10000),rationale text NOT NULL DEFAULT '', PRIMARY KEY(revision_id,user_id)
);
CREATE TABLE allocation_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), revision_id uuid NOT NULL,user_id uuid NOT NULL,
 decision varchar(16) NOT NULL CHECK(decision IN ('APPROVE','DISPUTE')),explanation text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(decision<>'DISPUTE' OR length(trim(explanation))>=10),
 FOREIGN KEY(revision_id,user_id) REFERENCES allocation_shares(revision_id,user_id) ON DELETE RESTRICT, UNIQUE(revision_id,user_id)
);
CREATE FUNCTION immutable_allocation_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Allocation history cannot be deleted'; END IF;
 IF OLD.submitted_at IS NOT NULL THEN
   IF (to_jsonb(NEW)-ARRAY['status','finalized_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','finalized_at']) THEN RAISE EXCEPTION 'Submitted allocation payload is immutable'; END IF;
   IF NOT ((OLD.status='AWAITING_APPROVAL' AND NEW.status IN ('AWAITING_APPROVAL','DISPUTED','FINALIZED')) OR (OLD.status='FINALIZED' AND NEW.status IN ('FINALIZED','SUPERSEDED')) OR (OLD.status='DISPUTED' AND NEW.status='DISPUTED') OR (OLD.status='SUPERSEDED' AND NEW.status='SUPERSEDED')) THEN RAISE EXCEPTION 'Invalid allocation transition'; END IF;
   IF OLD.finalized_at IS NOT NULL AND NEW.finalized_at IS DISTINCT FROM OLD.finalized_at THEN RAISE EXCEPTION 'Finalization evidence is immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER allocation_revision_immutable BEFORE UPDATE OR DELETE ON allocation_revisions FOR EACH ROW EXECUTE FUNCTION immutable_allocation_revision();
CREATE FUNCTION protect_allocation_share() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid uuid;
BEGIN
 IF TG_OP='INSERT' THEN rid=NEW.revision_id; ELSE rid=OLD.revision_id; END IF;
 IF EXISTS(SELECT 1 FROM allocation_revisions WHERE id=rid AND submitted_at IS NOT NULL) THEN RAISE EXCEPTION 'Submitted shares are immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER allocation_share_immutable BEFORE INSERT OR UPDATE OR DELETE ON allocation_shares FOR EACH ROW EXECUTE FUNCTION protect_allocation_share();
CREATE FUNCTION immutable_contribution_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Review and revision history is append only'; END $$;
CREATE TRIGGER allocation_approval_immutable BEFORE UPDATE OR DELETE ON allocation_approvals FOR EACH ROW EXECUTE FUNCTION immutable_contribution_history();
CREATE TRIGGER contribution_review_immutable BEFORE UPDATE OR DELETE ON contribution_reviews FOR EACH ROW EXECUTE FUNCTION immutable_contribution_history();
CREATE TRIGGER contribution_history_immutable BEFORE UPDATE OR DELETE ON project_contribution_history FOR EACH ROW EXECUTE FUNCTION immutable_contribution_history();
CREATE TRIGGER allocation_period_immutable BEFORE UPDATE OR DELETE ON allocation_periods FOR EACH ROW EXECUTE FUNCTION immutable_contribution_history();
COMMIT;
