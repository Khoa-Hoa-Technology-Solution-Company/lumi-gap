-- A request records consent; only an accepted relationship grants mentor access.
CREATE TABLE mentorship_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  mentor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  direction varchar(32) NOT NULL DEFAULT 'PROJECT_TO_LECTURER',
  status varchar(24) NOT NULL DEFAULT 'PENDING',
  message text, response_note text, close_reason varchar(48), idempotency_key varchar(80),
  responded_at timestamptz(6), expires_at timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT mentorship_requests_status_check CHECK (status IN ('PENDING','ACCEPTED','DECLINED','CANCELLED','EXPIRED')),
  CONSTRAINT mentorship_requests_direction_check CHECK (direction IN ('PROJECT_TO_LECTURER','LECTURER_TO_PROJECT'))
);
INSERT INTO mentorship_requests(id,project_id,mentor_user_id,requested_by,direction,status,message,response_note,responded_at,expires_at,created_at,updated_at)
SELECT id,project_id,mentor_user_id,requested_by,direction,
  CASE WHEN status = 'ENDED' THEN 'ACCEPTED' ELSE status END,
  message,response_note,COALESCE(responded_at,accepted_at),expires_at,created_at,updated_at
FROM mentor_relationships;
-- Legacy invitations without a deadline adopt the existing 14-day default.
UPDATE mentorship_requests SET expires_at=created_at+INTERVAL '14 days' WHERE status='PENDING' AND expires_at IS NULL;
CREATE INDEX mentorship_requests_project_id_status_created_at_idx ON mentorship_requests(project_id,status,created_at);
CREATE INDEX mentorship_requests_mentor_user_id_status_created_at_idx ON mentorship_requests(mentor_user_id,status,created_at);
CREATE INDEX mentorship_requests_requested_by_created_at_idx ON mentorship_requests(requested_by,created_at);
CREATE UNIQUE INDEX mentorship_requests_requested_by_idempotency_key_key ON mentorship_requests(requested_by,idempotency_key);
CREATE UNIQUE INDEX mentorship_requests_pending_pair ON mentorship_requests(project_id,mentor_user_id) WHERE status = 'PENDING';

DROP INDEX mentor_relationships_one_active_project_mentor;
DROP INDEX mentor_relationships_requested_by_created_at_idx;
DROP INDEX mentor_relationships_pair_idx;
ALTER TABLE mentor_relationships DROP CONSTRAINT mentor_relationships_status_check;
ALTER TABLE mentor_relationships ADD COLUMN source_request_id uuid, ADD COLUMN started_at timestamptz(6), ADD COLUMN end_reason varchar(1000);
UPDATE mentor_relationships SET source_request_id=id, started_at=COALESCE(accepted_at,created_at), end_reason=CASE WHEN status='ENDED' THEN LEFT(response_note,1000) END;
-- Preserve all request history above, and all legitimate active/ended relationships here.
DELETE FROM mentor_relationships WHERE status NOT IN ('ACCEPTED','ENDED');
UPDATE mentor_relationships SET status='ACTIVE' WHERE status='ACCEPTED';
ALTER TABLE mentor_relationships ALTER COLUMN status SET DEFAULT 'ACTIVE',
  ALTER COLUMN source_request_id SET NOT NULL, ALTER COLUMN started_at SET NOT NULL, ALTER COLUMN started_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE mentor_relationships ADD CONSTRAINT mentor_relationships_source_request_id_fkey FOREIGN KEY(source_request_id) REFERENCES mentorship_requests(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX mentor_relationships_source_request_id_key ON mentor_relationships(source_request_id);
CREATE UNIQUE INDEX mentor_relationships_active_pair ON mentor_relationships(project_id,mentor_user_id) WHERE status='ACTIVE';
ALTER TABLE mentor_relationships ADD CONSTRAINT mentor_relationships_status_check CHECK(status IN ('ACTIVE','ENDED'));
ALTER TABLE mentor_relationships DROP COLUMN requested_by, DROP COLUMN direction, DROP COLUMN responded_at,
  DROP COLUMN expires_at, DROP COLUMN message, DROP COLUMN response_note, DROP COLUMN accepted_at;
UPDATE project_activities a SET metadata = a.metadata || jsonb_build_object('attribution',
  CASE WHEN EXISTS(SELECT 1 FROM mentor_relationships r WHERE r.project_id=a.project_id AND r.mentor_user_id=a.actor_id
    AND r.started_at<=a.created_at AND (r.ended_at IS NULL OR r.ended_at>=a.created_at)) THEN 'MENTOR' ELSE 'TEAM' END)
  WHERE a.type='MENTOR_GUIDANCE' AND NOT (a.metadata ? 'attribution');

ALTER TABLE academic_profiles ADD COLUMN mentorship_email_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN notification_locale varchar(8) NOT NULL DEFAULT 'en';
ALTER TABLE academic_profiles ADD CONSTRAINT academic_profiles_notification_locale_check CHECK(notification_locale IN ('en','vi'));
ALTER TABLE notifications ADD COLUMN event_key varchar(200), ADD COLUMN email_payload jsonb,
  ADD COLUMN email_status varchar(24), ADD COLUMN email_claimed_at timestamptz(6), ADD COLUMN email_sent_at timestamptz(6),
  ADD COLUMN dispatched_at timestamptz(6), ADD COLUMN push_sent_at timestamptz(6);
CREATE UNIQUE INDEX notifications_event_key_key ON notifications(event_key);
CREATE INDEX notifications_email_status_dispatched_at_idx ON notifications(email_status,dispatched_at);
ALTER TABLE notifications ADD CONSTRAINT notifications_email_status_check CHECK(email_status IN ('PENDING','SENDING','SENT','SKIPPED','UNCERTAIN'));
CREATE INDEX projects_mentorship_discovery_idx ON projects(mentorship_discovery,status,id);
