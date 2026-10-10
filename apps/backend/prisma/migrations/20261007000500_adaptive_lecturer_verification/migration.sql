ALTER TABLE institution_domains ADD COLUMN type VARCHAR(16) NOT NULL DEFAULT 'EMAIL',
  ADD COLUMN allow_subdomains BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN verified_at TIMESTAMPTZ;
ALTER TABLE institution_domains ADD CONSTRAINT institution_domains_type_check CHECK (type IN ('EMAIL','WEBSITE','BOTH'));
ALTER TABLE institution_domains DROP CONSTRAINT institution_domains_method_check;
ALTER TABLE institution_domains ADD CONSTRAINT institution_domains_method_check CHECK (verification_method IN ('FEID','INSTITUTIONAL_EMAIL','TRUSTED_IDENTITY_PROVIDER','MANUAL_REVIEW','ADMIN_REVIEW'));
-- Existing trusted domains remain approved email domains. Website authority must
-- be explicitly approved by operations; email authority alone does not imply it.
UPDATE institution_domains SET verified_at = now() WHERE trusted AND status = 'ACTIVE';
-- Explicit official FPT University website, not inferred from email authority.
INSERT INTO institution_domains(id,institution_id,domain,type,trusted,status,verification_method,verified_at)
SELECT gen_random_uuid(),id,'daihoc.fpt.edu.vn','WEBSITE',true,'ACTIVE','ADMIN_REVIEW',now()
FROM institutions WHERE slug='fpt-university' ON CONFLICT(domain) DO NOTHING;

ALTER TABLE verification_evidence ADD COLUMN verification_method VARCHAR(48) CHECK (verification_method IN ('INSTITUTIONAL_EMAIL_AND_PROFILE','MANUAL_INSTITUTIONAL_EVIDENCE','TRUSTED_INSTITUTION_SOURCE')), ADD COLUMN institution_id UUID REFERENCES institutions(id);
CREATE TABLE verification_evidence_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES verification_evidence(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL CHECK (slot BETWEEN 0 AND 2),
  type VARCHAR(48) NOT NULL CHECK (type IN ('INSTITUTIONAL_EMAIL','OFFICIAL_FACULTY_PROFILE','OFFICIAL_STAFF_DIRECTORY','DEPARTMENT_DIRECTORY','EMPLOYMENT_DOCUMENT','APPOINTMENT_DOCUMENT','STAFF_ID','OTHER_INSTITUTION_SOURCE')),
  email_identity_id UUID REFERENCES user_emails(id) ON DELETE SET NULL,
  reference TEXT,
  storage_key VARCHAR(240), file_name VARCHAR(180), size_bytes INTEGER,
  status VARCHAR(24) NOT NULL DEFAULT 'UNCHECKED' CHECK (status IN ('UNCHECKED','VALID','INVALID','INCONCLUSIVE')),
  checked_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  checked_at TIMESTAMPTZ, reviewer_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(request_id, slot)
);
-- Preserve original requests/documents and decisions. Old pending submissions
-- need the adaptive evidence policy before a new Lecturer approval is possible.
INSERT INTO verification_evidence_sources(request_id,slot,type,reference,created_at)
SELECT id,1,CASE WHEN source_type='DOCUMENT' THEN 'EMPLOYMENT_DOCUMENT' ELSE 'OTHER_INSTITUTION_SOURCE' END,source_reference,submitted_at
FROM verification_evidence WHERE verification_type='POSITION';

CREATE FUNCTION queue_verification_source_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.storage_key IS NOT NULL THEN
    INSERT INTO verification_evidence_deletions(storage_key,user_id)
    SELECT OLD.storage_key,v.user_id FROM verification_evidence v WHERE v.id=OLD.request_id
    ON CONFLICT(storage_key) DO NOTHING;
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER verification_source_deletion BEFORE DELETE ON verification_evidence_sources
FOR EACH ROW EXECUTE FUNCTION queue_verification_source_deletion();
-- Root deletion runs before its cascades, retaining the owner ID for every blob.
CREATE FUNCTION queue_verification_request_sources() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO verification_evidence_deletions(storage_key,user_id)
  SELECT storage_key,OLD.user_id FROM verification_evidence_sources WHERE request_id=OLD.id AND storage_key IS NOT NULL
  ON CONFLICT(storage_key) DO NOTHING;
  RETURN OLD;
END $$;
CREATE TRIGGER verification_request_sources_deletion BEFORE DELETE ON verification_evidence
FOR EACH ROW EXECUTE FUNCTION queue_verification_request_sources();

CREATE FUNCTION clear_disabled_account_source_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.account_status <> 'ACTIVE' OR NOT NEW.is_active) AND (OLD.account_status = 'ACTIVE' AND OLD.is_active) THEN
    INSERT INTO verification_evidence_deletions(storage_key,user_id)
    SELECT s.storage_key,NEW.id FROM verification_evidence_sources s JOIN verification_evidence v ON v.id=s.request_id
    WHERE v.user_id=NEW.id AND s.storage_key IS NOT NULL ON CONFLICT(storage_key) DO NOTHING;
    UPDATE verification_evidence_sources SET storage_key=NULL,file_name=NULL,size_bytes=NULL,reviewer_note=NULL
    WHERE request_id IN (SELECT id FROM verification_evidence WHERE user_id=NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER disabled_account_source_evidence_cleanup AFTER UPDATE OF account_status,is_active ON users
FOR EACH ROW EXECUTE FUNCTION clear_disabled_account_source_evidence();
