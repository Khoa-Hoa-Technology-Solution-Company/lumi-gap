ALTER TABLE verification_evidence ADD COLUMN submission_key uuid, ADD COLUMN submission_hash varchar(64);
ALTER TABLE verification_evidence_sources DROP CONSTRAINT verification_evidence_sources_type_check;
ALTER TABLE verification_evidence_sources ADD CONSTRAINT verification_evidence_sources_type_check
  CHECK (type IN ('INSTITUTIONAL_EMAIL','OFFICIAL_FACULTY_PROFILE','OFFICIAL_STAFF_DIRECTORY','DEPARTMENT_DIRECTORY','INSTITUTION_ISSUED_PROFILE','EMPLOYMENT_DOCUMENT','APPOINTMENT_DOCUMENT','STAFF_ID','OTHER_INSTITUTION_SOURCE'));
ALTER TABLE verification_evidence_sources DROP CONSTRAINT verification_evidence_sources_slot_check;
ALTER TABLE verification_evidence_sources ADD CONSTRAINT verification_evidence_sources_slot_check CHECK (slot BETWEEN 0 AND 6);
CREATE UNIQUE INDEX verification_evidence_user_id_submission_key_key ON verification_evidence(user_id, submission_key);
ALTER TABLE academic_email_verification_challenges ADD COLUMN sent_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE TABLE verification_evidence_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id), position_title varchar(160) NOT NULL,
  storage_key varchar(240) NOT NULL UNIQUE, file_name varchar(180) NOT NULL,
  mime_type varchar(80) NOT NULL, size_bytes integer NOT NULL CHECK(size_bytes > 0), content_hash varchar(64) NOT NULL,
  expires_at timestamptz(6) NOT NULL, consumed_at timestamptz(6), created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX verification_evidence_uploads_user_id_expires_at_idx ON verification_evidence_uploads(user_id, expires_at);
CREATE FUNCTION invalidate_disabled_account_staged_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.account_status <> 'ACTIVE' OR NOT NEW.is_active) THEN
    UPDATE verification_evidence_deletions SET not_before = CURRENT_TIMESTAMP
    WHERE storage_key IN (SELECT storage_key FROM verification_evidence_uploads WHERE user_id=NEW.id AND consumed_at IS NULL);
    DELETE FROM verification_evidence_uploads WHERE user_id=NEW.id;
    UPDATE verification_evidence SET metadata=metadata-'identityBindingReference'-'identityBindingMethod'
    WHERE user_id=NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER disabled_account_staged_evidence AFTER UPDATE OF account_status,is_active ON users
FOR EACH ROW EXECUTE FUNCTION invalidate_disabled_account_staged_evidence();
