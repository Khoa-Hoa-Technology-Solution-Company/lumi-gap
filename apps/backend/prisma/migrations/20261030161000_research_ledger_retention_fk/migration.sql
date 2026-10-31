-- Allow GDPR/account-deletion ON DELETE SET NULL on actor references without permitting manual audit tampering,
-- and decouple research_evidence_events from projects FK so ledger records survive empty-project or test-fixture project removal.

ALTER TABLE "research_evidence_events"
  DROP CONSTRAINT IF EXISTS "research_evidence_events_project_id_fkey";

CREATE OR REPLACE FUNCTION prevent_audit_row_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'audit_logs'
     AND TG_OP = 'UPDATE'
     AND OLD.user_id IS NOT NULL
     AND NEW.user_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM "users" WHERE "id" = OLD.user_id)
     AND (to_jsonb(OLD) - ARRAY['user_id', 'updated_at']) IS NOT DISTINCT FROM (to_jsonb(NEW) - ARRAY['user_id', 'updated_at']) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Audit and activity rows cannot be modified in place';
END $$;

CREATE OR REPLACE FUNCTION protect_research_evidence_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.actor_id IS NOT NULL
     AND NEW.actor_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM "users" WHERE "id" = OLD.actor_id)
     AND (to_jsonb(OLD) - 'actor_id') IS NOT DISTINCT FROM (to_jsonb(NEW) - 'actor_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Research evidence ledger is append-only';
END $$;

