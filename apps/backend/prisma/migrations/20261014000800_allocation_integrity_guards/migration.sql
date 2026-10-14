BEGIN;
-- Preserve acknowledgement and a later challenge as separate immutable responses.
ALTER TABLE contribution_reviews DROP CONSTRAINT contribution_reviews_proposal_id_version_user_id_key;
ALTER TABLE contribution_reviews ADD CONSTRAINT contribution_reviews_response_key UNIQUE(proposal_id,version,user_id,decision);
CREATE OR REPLACE FUNCTION protect_allocation_share() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' AND EXISTS(SELECT 1 FROM allocation_revisions WHERE id=OLD.revision_id AND submitted_at IS NOT NULL) THEN RAISE EXCEPTION 'Submitted shares are immutable'; END IF;
 IF TG_OP<>'DELETE' AND EXISTS(SELECT 1 FROM allocation_revisions WHERE id=NEW.revision_id AND submitted_at IS NOT NULL) THEN RAISE EXCEPTION 'Submitted shares are immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION validate_allocation_consensus() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE shares_count integer; roster_count integer;
BEGIN
 IF NEW.status IN ('AWAITING_APPROVAL','FINALIZED') THEN
   SELECT count(*) INTO shares_count FROM allocation_shares WHERE revision_id=NEW.id;
   roster_count=jsonb_array_length(NEW.roster);
   IF roster_count=0 OR shares_count<>roster_count OR (SELECT count(DISTINCT p->>'id') FROM jsonb_array_elements(NEW.roster) p)<>roster_count THEN RAISE EXCEPTION 'Allocation roster is incomplete'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.roster) p WHERE NOT EXISTS(SELECT 1 FROM allocation_shares s WHERE s.revision_id=NEW.id AND s.user_id::text=p->>'id')) THEN RAISE EXCEPTION 'Allocation roster/share mismatch'; END IF;
   IF (SELECT coalesce(sum(basis_points),0) FROM allocation_shares WHERE revision_id=NEW.id)<>10000 THEN RAISE EXCEPTION 'Allocation shares must total 10000'; END IF;
   IF length(trim(NEW.rationale))<20 OR NEW.submitted_at IS NULL THEN RAISE EXCEPTION 'Allocation requires submission and rationale'; END IF;
   IF EXISTS(SELECT 1 FROM allocation_shares WHERE revision_id=NEW.id AND basis_points=0 AND length(trim(rationale))<10) THEN RAISE EXCEPTION 'Zero shares require rationale'; END IF;
 END IF;
 IF NEW.status='FINALIZED' AND OLD.status<>'FINALIZED' THEN
   IF OLD.status<>'AWAITING_APPROVAL' OR NEW.finalized_at IS NULL OR (SELECT count(*) FROM allocation_approvals WHERE revision_id=NEW.id AND decision='APPROVE')<>roster_count OR EXISTS(SELECT 1 FROM allocation_approvals WHERE revision_id=NEW.id AND decision<>'APPROVE') THEN RAISE EXCEPTION 'Unanimous exact-revision consent is required'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER allocation_consensus_guard BEFORE UPDATE ON allocation_revisions FOR EACH ROW EXECUTE FUNCTION validate_allocation_consensus();
CREATE FUNCTION validate_allocation_decision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM allocation_revisions r WHERE r.id=NEW.revision_id AND r.status='AWAITING_APPROVAL' AND r.submitted_at IS NOT NULL) THEN RAISE EXCEPTION 'Only awaiting revisions accept decisions'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER allocation_decision_guard BEFORE INSERT ON allocation_approvals FOR EACH ROW EXECUTE FUNCTION validate_allocation_decision();
COMMIT;
