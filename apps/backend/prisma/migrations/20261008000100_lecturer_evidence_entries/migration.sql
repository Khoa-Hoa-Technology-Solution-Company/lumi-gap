ALTER TABLE verification_evidence_sources
  ADD COLUMN source_kind varchar(16),
  ADD COLUMN custom_evidence_name varchar(200),
  ADD COLUMN additional_explanation varchar(1000),
  ADD COLUMN mime_type varchar(80),
  ADD COLUMN url_trust_status varchar(32),
  ADD COLUMN updated_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE verification_evidence_sources SET
  source_kind = CASE WHEN type = 'INSTITUTIONAL_EMAIL' THEN 'EMAIL' WHEN storage_key IS NOT NULL OR type IN ('EMPLOYMENT_DOCUMENT','APPOINTMENT_DOCUMENT','STAFF_ID') THEN 'DOCUMENT' ELSE 'URL' END,
  mime_type = CASE WHEN storage_key IS NOT NULL THEN 'application/pdf' ELSE NULL END;

ALTER TABLE verification_evidence_sources ADD CONSTRAINT lecturer_evidence_source_kind
  CHECK (source_kind IS NULL OR source_kind IN ('EMAIL','URL','DOCUMENT'));
ALTER TABLE verification_evidence_sources ADD CONSTRAINT lecturer_evidence_url_trust
  CHECK (url_trust_status IS NULL OR url_trust_status IN ('REGISTRY_APPROVED','PENDING_ADMIN_VALIDATION','ADMIN_VALIDATED'));

CREATE FUNCTION clear_disabled_account_evidence_entry_notes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.account_status <> 'ACTIVE' OR NOT NEW.is_active) AND (OLD.account_status = 'ACTIVE' AND OLD.is_active) THEN
    UPDATE verification_evidence_sources SET additional_explanation=NULL,mime_type=NULL
    WHERE request_id IN (SELECT id FROM verification_evidence WHERE user_id=NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER disabled_account_evidence_entry_notes_cleanup AFTER UPDATE OF account_status,is_active ON users
FOR EACH ROW EXECUTE FUNCTION clear_disabled_account_evidence_entry_notes();
