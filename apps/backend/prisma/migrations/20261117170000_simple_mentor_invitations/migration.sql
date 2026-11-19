BEGIN;
-- Extend the vocabulary and defaults. No historical invitation or relationship is rewritten.
ALTER TABLE mentorship_requests DROP CONSTRAINT mentorship_requests_role_check;
ALTER TABLE mentorship_requests ADD CONSTRAINT mentorship_requests_role_check CHECK(mentor_role IN ('UNASSIGNED','PRIMARY','SECONDARY'));
ALTER TABLE mentor_relationships DROP CONSTRAINT mentor_relationships_role_check;
ALTER TABLE mentor_relationships ADD CONSTRAINT mentor_relationships_role_check CHECK(mentor_role IN ('UNASSIGNED','PRIMARY','SECONDARY'));
ALTER TABLE mentorship_requests ALTER COLUMN mentor_role SET DEFAULT 'UNASSIGNED';
ALTER TABLE mentor_relationships ALTER COLUMN mentor_role SET DEFAULT 'UNASSIGNED';
ALTER TABLE mentor_candidates DROP CONSTRAINT mentor_candidates_mentor_role_check;
ALTER TABLE mentor_candidates ADD CONSTRAINT mentor_candidates_mentor_role_check CHECK(mentor_role IN ('UNASSIGNED','PRIMARY','SECONDARY'));

DROP INDEX mentorship_requests_reserved_role;
CREATE UNIQUE INDEX mentorship_requests_reserved_role ON mentorship_requests(project_id,mentor_role)
 WHERE status='PENDING' AND reservation_enforced AND mentor_role<>'UNASSIGNED';
DROP INDEX mentor_relationships_active_position;
CREATE UNIQUE INDEX mentor_relationships_active_position ON mentor_relationships(project_id,mentor_role)
 WHERE status='ACTIVE' AND mentor_role<>'UNASSIGNED';

CREATE OR REPLACE FUNCTION guard_mentor_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM id FROM projects WHERE id=NEW.project_id FOR UPDATE;
 IF TG_OP='UPDATE' AND (NEW.project_id<>OLD.project_id OR NEW.mentor_user_id<>OLD.mentor_user_id OR NEW.mentor_role<>OLD.mentor_role OR
  NEW.requested_by<>OLD.requested_by OR NEW.direction<>OLD.direction OR NEW.message IS DISTINCT FROM OLD.message OR
  NEW.invitation_snapshot IS DISTINCT FROM OLD.invitation_snapshot OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id OR NEW.reservation_enforced<>OLD.reservation_enforced) THEN
  RAISE EXCEPTION 'Sent invitation content and role are immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.status='PENDING' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
  IF NEW.candidate_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM mentor_candidates c JOIN mentor_invitation_plans p ON p.id=c.plan_id
   WHERE c.id=NEW.candidate_id AND p.project_id=NEW.project_id AND p.status='ACTIVE'
    AND c.mentor_user_id=NEW.mentor_user_id AND (NEW.mentor_role='UNASSIGNED' OR c.mentor_role=NEW.mentor_role) AND c.status='PLANNED'
  ) THEN RAISE EXCEPTION 'Candidate must match this project and lecturer' USING ERRCODE='23514'; END IF;
  -- Historical position-specific invitations keep their existing reservation protection.
  IF NEW.mentor_role<>'UNASSIGNED' AND (NOT NEW.reservation_enforced OR
    EXISTS(SELECT 1 FROM mentorship_requests WHERE project_id=NEW.project_id AND mentor_role=NEW.mentor_role AND status='PENDING' AND id<>NEW.id) OR
    EXISTS(SELECT 1 FROM mentor_relationships WHERE project_id=NEW.project_id AND mentor_role=NEW.mentor_role AND status='ACTIVE')) THEN
   RAISE EXCEPTION 'Mentor role is already reserved or assigned' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION check_mentor_assignment_position() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.project_id<>OLD.project_id OR NEW.mentor_user_id<>OLD.mentor_user_id OR NEW.source_request_id<>OLD.source_request_id) THEN
  RAISE EXCEPTION 'Mentorship consent identity is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.status='ACTIVE' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.mentor_role IS DISTINCT FROM NEW.mentor_role) THEN
  PERFORM id FROM projects WHERE id=NEW.project_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM mentorship_requests q WHERE q.id=NEW.source_request_id AND q.project_id=NEW.project_id
    AND q.mentor_user_id=NEW.mentor_user_id AND q.status='ACCEPTED'
    AND (TG_OP='UPDATE' OR q.mentor_role=NEW.mentor_role)) THEN
   RAISE EXCEPTION 'Active assignment requires matching accepted consent' USING ERRCODE='23514';
  END IF;
  IF (SELECT count(*) FROM mentor_relationships WHERE project_id=NEW.project_id AND status='ACTIVE' AND id<>NEW.id)>=2 THEN
   RAISE EXCEPTION 'At most two active mentors' USING ERRCODE='23514';
  END IF;
  IF NEW.mentor_role<>'UNASSIGNED' AND EXISTS(SELECT 1 FROM mentorship_requests WHERE project_id=NEW.project_id AND mentor_role=NEW.mentor_role AND status='PENDING') THEN
   RAISE EXCEPTION 'Review historical competing invitations before assigning this role' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
ALTER TABLE mentorship_drafts DROP CONSTRAINT mentorship_drafts_mentor_role_check;
ALTER TABLE mentorship_drafts ADD CONSTRAINT mentorship_drafts_mentor_role_check CHECK(mentor_role IN ('UNASSIGNED','PRIMARY','SECONDARY'));
ALTER TABLE mentorship_drafts ALTER COLUMN mentor_role SET DEFAULT 'UNASSIGNED';
COMMIT;
