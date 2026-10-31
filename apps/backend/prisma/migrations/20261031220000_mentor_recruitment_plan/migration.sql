BEGIN;
CREATE TABLE mentor_invitation_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 created_by_id uuid NOT NULL REFERENCES users(id), status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CLOSED')),
 parallel_invitations boolean NOT NULL DEFAULT false, closed_roles text[] NOT NULL DEFAULT '{}',
 version integer NOT NULL DEFAULT 1 CHECK(version > 0), created_at timestamptz(6) NOT NULL DEFAULT now(), updated_at timestamptz(6) NOT NULL DEFAULT now(),
 CHECK(closed_roles <@ ARRAY['PRIMARY','SECONDARY']::text[])
);
CREATE INDEX mentor_invitation_plans_project_id_status_idx ON mentor_invitation_plans(project_id,status);
CREATE UNIQUE INDEX mentor_invitation_plans_current ON mentor_invitation_plans(project_id) WHERE status='ACTIVE';
CREATE TABLE mentor_candidates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid NOT NULL REFERENCES mentor_invitation_plans(id) ON DELETE CASCADE,
 mentor_user_id uuid NOT NULL REFERENCES users(id), mentor_role varchar(16) NOT NULL CHECK(mentor_role IN ('PRIMARY','SECONDARY')),
 priority integer NOT NULL CHECK(priority > 0), status varchar(16) NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','INVITED','REMOVED')),
 created_at timestamptz(6) NOT NULL DEFAULT now(), updated_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX mentor_candidates_plan_id_mentor_role_priority_idx ON mentor_candidates(plan_id,mentor_role,priority);
CREATE UNIQUE INDEX mentor_candidates_distinct_person ON mentor_candidates(plan_id,mentor_user_id) WHERE status<>'REMOVED';
ALTER TABLE mentorship_requests ADD COLUMN invitation_snapshot jsonb,
 ADD COLUMN reservation_enforced boolean NOT NULL DEFAULT false,
 ADD COLUMN candidate_id uuid REFERENCES mentor_candidates(id);
-- Existing reservations are retained for explicit review, never arbitrarily cancelled.
ALTER TABLE mentorship_requests ALTER COLUMN reservation_enforced SET DEFAULT true;
CREATE UNIQUE INDEX mentorship_requests_candidate_id_key ON mentorship_requests(candidate_id);
CREATE UNIQUE INDEX mentorship_requests_reserved_role ON mentorship_requests(project_id,mentor_role) WHERE status='PENDING' AND reservation_enforced;

CREATE FUNCTION guard_mentor_candidate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pid uuid;
BEGIN
 SELECT project_id INTO pid FROM mentor_invitation_plans WHERE id=NEW.plan_id;
 PERFORM id FROM projects WHERE id=pid FOR UPDATE;
 IF TG_OP='UPDATE' AND (OLD.plan_id<>NEW.plan_id OR OLD.mentor_user_id<>NEW.mentor_user_id OR
   (OLD.status='INVITED' AND (NEW.mentor_role<>OLD.mentor_role OR NEW.status<>OLD.status OR NEW.priority<>OLD.priority))) THEN
  RAISE EXCEPTION 'Sent candidate identity and role are immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.status<>'REMOVED' AND (SELECT count(*) FROM mentor_candidates WHERE plan_id=NEW.plan_id AND status<>'REMOVED' AND id<>NEW.id)>=4 THEN
  RAISE EXCEPTION 'At most four distinct candidates per plan' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER mentor_candidate_guard BEFORE INSERT OR UPDATE ON mentor_candidates FOR EACH ROW EXECUTE FUNCTION guard_mentor_candidate();

CREATE FUNCTION guard_mentor_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM id FROM projects WHERE id=NEW.project_id FOR UPDATE;
 IF TG_OP='UPDATE' AND (NEW.project_id<>OLD.project_id OR NEW.mentor_user_id<>OLD.mentor_user_id OR NEW.mentor_role<>OLD.mentor_role OR
  NEW.requested_by<>OLD.requested_by OR NEW.direction<>OLD.direction OR NEW.message IS DISTINCT FROM OLD.message OR
  NEW.invitation_snapshot IS DISTINCT FROM OLD.invitation_snapshot OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id OR NEW.reservation_enforced<>OLD.reservation_enforced) THEN
  RAISE EXCEPTION 'Sent invitation content and role are immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.status='PENDING' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
  IF NOT NEW.reservation_enforced OR EXISTS(SELECT 1 FROM mentorship_requests WHERE project_id=NEW.project_id AND mentor_role=NEW.mentor_role AND status='PENDING' AND id<>NEW.id)
    OR EXISTS(SELECT 1 FROM mentor_relationships WHERE project_id=NEW.project_id AND mentor_role=NEW.mentor_role AND status='ACTIVE') THEN
   RAISE EXCEPTION 'Mentor role is already reserved or assigned' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER mentor_reservation_guard BEFORE INSERT OR UPDATE ON mentorship_requests FOR EACH ROW EXECUTE FUNCTION guard_mentor_reservation();

CREATE OR REPLACE FUNCTION check_mentor_assignment_position() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='ACTIVE' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.mentor_role IS DISTINCT FROM NEW.mentor_role) THEN
  PERFORM id FROM projects WHERE id=NEW.project_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM mentorship_requests q WHERE q.id=NEW.source_request_id AND q.project_id=NEW.project_id
    AND q.mentor_user_id=NEW.mentor_user_id AND q.mentor_role=NEW.mentor_role AND q.status='ACCEPTED') THEN
   RAISE EXCEPTION 'Active assignment requires matching accepted consent' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM mentorship_requests WHERE project_id=NEW.project_id AND mentor_role=NEW.mentor_role AND status='PENDING') THEN
   RAISE EXCEPTION 'Review legacy competing invitations before assignment' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
COMMIT;
