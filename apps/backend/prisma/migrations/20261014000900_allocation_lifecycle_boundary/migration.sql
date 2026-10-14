BEGIN;
-- New revisions must enter through the draft lifecycle. UPDATE-only consensus
-- guards cannot protect direct INSERTs of a falsely finalized agreement.
CREATE FUNCTION enforce_allocation_lifecycle_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW.status<>'DRAFT' OR NEW.submitted_at IS NOT NULL OR NEW.finalized_at IS NOT NULL THEN
     RAISE EXCEPTION 'New allocation revisions must be unsubmitted drafts';
   END IF;
 ELSIF OLD.status='DRAFT' AND NEW.status NOT IN ('DRAFT','AWAITING_APPROVAL') THEN
   RAISE EXCEPTION 'Drafts must enter the approval workflow';
 END IF;
 IF NEW.status='DRAFT' AND (NEW.submitted_at IS NOT NULL OR NEW.finalized_at IS NOT NULL) THEN
   RAISE EXCEPTION 'Drafts cannot carry submission or finalization evidence';
 END IF;
 IF NEW.status<>'DRAFT' AND NEW.submitted_at IS NULL THEN
   RAISE EXCEPTION 'Allocation lifecycle requires submission evidence';
 END IF;
 IF (NEW.status IN ('FINALIZED','SUPERSEDED')) IS DISTINCT FROM (NEW.finalized_at IS NOT NULL) THEN
   RAISE EXCEPTION 'Finalization evidence must match allocation status';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER allocation_lifecycle_boundary BEFORE INSERT OR UPDATE ON allocation_revisions
 FOR EACH ROW EXECUTE FUNCTION enforce_allocation_lifecycle_boundary();
COMMIT;
