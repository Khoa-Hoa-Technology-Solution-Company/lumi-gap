-- Preserve historical invitations, supplements and decisions. New cases collect first.
ALTER TABLE screening_settings
 ADD COLUMN adjudication_reminder_hours integer NOT NULL DEFAULT 72 CHECK(adjudication_reminder_hours BETWEEN 24 AND 2160),
 ADD COLUMN adjudication_reassign_hours integer NOT NULL DEFAULT 168 CHECK(adjudication_reassign_hours BETWEEN 48 AND 4320);
ALTER TABLE screening_adjudication_cases ADD COLUMN locked_at timestamptz;
ALTER TABLE screening_adjudication_cases ALTER COLUMN status SET DEFAULT 'COLLECTING';
ALTER TABLE screening_adjudication_cases DROP CONSTRAINT screening_adjudication_cases_status_check;
ALTER TABLE screening_adjudication_cases DROP CONSTRAINT screening_adjudication_cases_check;
ALTER TABLE screening_adjudication_cases
 ADD CONSTRAINT screening_adjudication_cases_status_check CHECK(status IN ('COLLECTING','WAITING_ASSIGNMENT','ASSIGNED','INVITED','ACCEPTED','IN_PROGRESS','COI_REVIEW','COMPLETED','NEEDS_MORE_INFO','CANCELLED_AS_RESOLVED','CANCELLED_REOPENED')),
 ADD CONSTRAINT screening_adjudication_cases_check CHECK(active = (status NOT IN ('COMPLETED','NEEDS_MORE_INFO','CANCELLED_AS_RESOLVED','CANCELLED_REOPENED')));
ALTER TABLE screening_adjudication_invitations DROP CONSTRAINT screening_adjudication_invitations_status_check;
ALTER TABLE screening_adjudication_invitations ADD CONSTRAINT screening_adjudication_invitations_status_check CHECK(status IN ('ASSIGNED','SENT','ACCEPTED','DECLINED','REVOKED'));
DROP INDEX screening_adjudication_one_invitation;
CREATE UNIQUE INDEX screening_adjudication_one_invitation ON screening_adjudication_invitations(case_id) WHERE status IN ('SENT','ACCEPTED','ASSIGNED');
