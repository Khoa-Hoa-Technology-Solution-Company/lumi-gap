BEGIN;

ALTER TABLE mentorship_requests ADD COLUMN mentor_role varchar(16) NOT NULL DEFAULT 'PRIMARY';
ALTER TABLE mentor_relationships ADD COLUMN mentor_role varchar(16) NOT NULL DEFAULT 'PRIMARY';

-- Preserve every historical request and assignment. The earliest active mentor
-- becomes primary; a second active mentor becomes secondary. Do not silently end
-- older assignments if a deployment previously allowed more than two mentors.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM mentor_relationships WHERE status='ACTIVE' GROUP BY project_id HAVING count(*)>2) THEN
    RAISE EXCEPTION 'Resolve projects with more than two active mentors before applying mentor positions';
  END IF;
END $$;
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY project_id, status ORDER BY started_at,id) AS n
  FROM mentor_relationships
)
UPDATE mentor_relationships r SET mentor_role=CASE WHEN ranked.n=1 THEN 'PRIMARY' ELSE 'SECONDARY' END
FROM ranked WHERE ranked.id=r.id;
UPDATE mentorship_requests q SET mentor_role=r.mentor_role FROM mentor_relationships r WHERE r.source_request_id=q.id;

ALTER TABLE mentorship_requests ADD CONSTRAINT mentorship_requests_role_check CHECK(mentor_role IN ('PRIMARY','SECONDARY'));
ALTER TABLE mentor_relationships ADD CONSTRAINT mentor_relationships_role_check CHECK(mentor_role IN ('PRIMARY','SECONDARY'));
CREATE UNIQUE INDEX mentor_relationships_active_position ON mentor_relationships(project_id,mentor_role) WHERE status='ACTIVE';
CREATE INDEX mentorship_requests_position_pending ON mentorship_requests(project_id,mentor_role,status);
ALTER TABLE mentorship_requests DROP CONSTRAINT mentorship_requests_status_check;
ALTER TABLE mentorship_requests ADD CONSTRAINT mentorship_requests_status_check CHECK(status IN
  ('PENDING','ACCEPTED','DECLINED','CANCELLED','CANCELED_BY_PROJECT','EXPIRED','CLOSED_CAPACITY_REACHED'));

CREATE FUNCTION check_mentor_assignment_position() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='ACTIVE' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.mentor_role IS DISTINCT FROM NEW.mentor_role) THEN
    PERFORM id FROM projects WHERE id=NEW.project_id FOR UPDATE;
    IF NOT EXISTS (SELECT 1 FROM mentorship_requests q WHERE q.id=NEW.source_request_id AND q.project_id=NEW.project_id
      AND q.mentor_user_id=NEW.mentor_user_id AND q.mentor_role=NEW.mentor_role AND q.status='ACCEPTED') THEN
      RAISE EXCEPTION 'Active assignment requires accepted consent for the same project, mentor and role' USING ERRCODE='23514';
    END IF;
    IF NEW.mentor_role='SECONDARY' AND NOT EXISTS (
      SELECT 1 FROM mentor_relationships r JOIN users u ON u.id=r.mentor_user_id JOIN academic_profiles a ON a.user_id=u.id
      WHERE r.project_id=NEW.project_id AND r.status='ACTIVE' AND r.mentor_role='PRIMARY'
      AND u.is_active AND u.account_status='ACTIVE' AND u.email_verified_at IS NOT NULL
      AND a.academic_role='LECTURER' AND a.role_verification_status='VERIFIED' AND a.position_status='VERIFIED'
    ) THEN
      RAISE EXCEPTION 'A verified active primary mentor is required before assigning a secondary mentor' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER mentor_assignment_position_guard BEFORE INSERT OR UPDATE ON mentor_relationships
FOR EACH ROW EXECUTE FUNCTION check_mentor_assignment_position();

CREATE TABLE mentorship_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  uploaded_by_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name varchar(180) NOT NULL, mime_type varchar(100) NOT NULL,
  byte_size integer NOT NULL CHECK(byte_size>0 AND byte_size<=5242880), sha256 varchar(64) NOT NULL, content bytea NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(), CHECK(octet_length(content)=byte_size),
  CHECK(mime_type IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','image/webp'))
);
CREATE INDEX mentorship_attachments_owner ON mentorship_attachments(project_id,uploaded_by_id,created_at);
CREATE TABLE mentorship_request_attachments (
  request_id uuid NOT NULL REFERENCES mentorship_requests(id) ON DELETE CASCADE,
  attachment_id uuid NOT NULL REFERENCES mentorship_attachments(id) ON DELETE CASCADE,
  PRIMARY KEY(request_id,attachment_id)
);
CREATE INDEX mentorship_request_attachments_file ON mentorship_request_attachments(attachment_id);
CREATE TABLE mentorship_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction varchar(32) NOT NULL CHECK(direction IN ('PROJECT_TO_LECTURER','LECTURER_TO_PROJECT')),
  mentor_role varchar(16) NOT NULL DEFAULT 'PRIMARY' CHECK(mentor_role IN ('PRIMARY','SECONDARY')),
  message text NOT NULL DEFAULT '' CHECK(length(message)<=1000), attachment_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[] CHECK(cardinality(attachment_ids)<=5),
  version integer NOT NULL DEFAULT 1, created_at timestamptz(6) NOT NULL DEFAULT now(), updated_at timestamptz(6) NOT NULL DEFAULT now(),
  UNIQUE(project_id,user_id,direction)
);
COMMIT;
