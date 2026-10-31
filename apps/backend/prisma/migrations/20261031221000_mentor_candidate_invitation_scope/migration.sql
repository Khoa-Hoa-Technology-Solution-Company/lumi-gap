BEGIN;
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
    AND c.mentor_user_id=NEW.mentor_user_id AND c.mentor_role=NEW.mentor_role AND c.status='PLANNED'
  ) THEN
   RAISE EXCEPTION 'Candidate must match the current project, lecturer and offered role' USING ERRCODE='23514';
  END IF;
  IF NOT NEW.reservation_enforced OR EXISTS(SELECT 1 FROM mentorship_requests WHERE project_id=NEW.project_id AND mentor_role=NEW.mentor_role AND status='PENDING' AND id<>NEW.id)
    OR EXISTS(SELECT 1 FROM mentor_relationships WHERE project_id=NEW.project_id AND mentor_role=NEW.mentor_role AND status='ACTIVE') THEN
   RAISE EXCEPTION 'Mentor role is already reserved or assigned' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
COMMIT;
