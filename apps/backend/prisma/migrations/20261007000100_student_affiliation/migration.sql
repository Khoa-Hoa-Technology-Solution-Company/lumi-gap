ALTER TABLE users DROP CONSTRAINT users_admission_basis_check;
ALTER TABLE users ADD CONSTRAINT users_admission_basis_check CHECK (admission_basis IN ('LEGACY','HOST_INSTITUTION','INVITATION','ADMIN','PERSONAL_EMAIL'));
ALTER TABLE verification_evidence DROP CONSTRAINT verification_evidence_status_check;
ALTER TABLE verification_evidence ADD CONSTRAINT verification_evidence_status_check CHECK (status IN ('NOT_SUBMITTED','UNVERIFIED','PENDING','NEEDS_MORE_INFORMATION','VERIFIED','REJECTED','EXPIRED','INVALIDATED'));
ALTER TABLE verification_evidence ADD COLUMN superseded_at TIMESTAMPTZ(6);
CREATE UNIQUE INDEX verification_evidence_one_active_affiliation ON verification_evidence(user_id) WHERE verification_type='AFFILIATION' AND status IN ('PENDING','NEEDS_MORE_INFORMATION') AND superseded_at IS NULL;
ALTER TABLE academic_profiles DROP CONSTRAINT academic_profiles_affiliation_status_check;
ALTER TABLE academic_profiles ADD CONSTRAINT academic_profiles_affiliation_status_check CHECK (affiliation_status IN ('NOT_SUBMITTED','UNVERIFIED','PENDING','NEEDS_MORE_INFORMATION','VERIFIED','REJECTED','EXPIRED','INVALIDATED'));
ALTER TABLE affiliations DROP CONSTRAINT affiliations_status_check;
ALTER TABLE affiliations ADD CONSTRAINT affiliations_status_check CHECK (verification_status IN ('NOT_SUBMITTED','UNVERIFIED','PENDING','NEEDS_MORE_INFORMATION','VERIFIED','REJECTED','EXPIRED','INVALIDATED'));
ALTER TABLE affiliations DROP CONSTRAINT affiliations_verification_method_check;
ALTER TABLE affiliations ADD CONSTRAINT affiliations_verification_method_check CHECK (verification_method IS NULL OR verification_method IN ('FEID','INSTITUTIONAL_EMAIL','TRUSTED_IDENTITY_PROVIDER','MANUAL_REVIEW','MANUAL_DOCUMENT_REVIEW'));
CREATE TABLE verification_evidence_deletions (
  storage_key VARCHAR(240) PRIMARY KEY,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  not_before TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE FUNCTION queue_verification_evidence_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.evidence_storage_key IS NOT NULL THEN
    INSERT INTO verification_evidence_deletions(storage_key,user_id) VALUES (OLD.evidence_storage_key,OLD.user_id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER verification_evidence_delete_cleanup BEFORE DELETE ON verification_evidence FOR EACH ROW EXECUTE FUNCTION queue_verification_evidence_deletion();
-- Account disabling/tombstoning also clears private documents; raw SQL deletion
-- is covered by the cascade trigger above.
CREATE FUNCTION clear_disabled_account_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.account_status <> 'ACTIVE' OR NOT NEW.is_active) AND (OLD.account_status = 'ACTIVE' AND OLD.is_active) THEN
    INSERT INTO verification_evidence_deletions(storage_key,user_id)
      SELECT evidence_storage_key,user_id FROM verification_evidence WHERE user_id = NEW.id AND evidence_storage_key IS NOT NULL ON CONFLICT DO NOTHING;
    UPDATE verification_evidence SET evidence_storage_key=NULL,evidence_file_name=NULL,evidence_mime_type=NULL,evidence_size_bytes=NULL,
      status=CASE WHEN status IN ('PENDING','NEEDS_MORE_INFORMATION') THEN 'INVALIDATED' ELSE status END,
      reviewed_at=CASE WHEN status IN ('PENDING','NEEDS_MORE_INFORMATION') THEN now() ELSE reviewed_at END
      WHERE user_id=NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER disabled_account_evidence_cleanup AFTER UPDATE OF account_status,is_active ON users FOR EACH ROW EXECUTE FUNCTION clear_disabled_account_evidence();
