-- Soft delete (Trash), 30-day retention window, and retention-aware permanent purge.

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "deleted_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "purge_at" TIMESTAMPTZ(6);

ALTER TABLE "projects"
  DROP CONSTRAINT IF EXISTS "projects_trash_retention_check",
  ADD CONSTRAINT "projects_trash_retention_check" CHECK (
    ("deleted_at" IS NULL AND "purge_at" IS NULL)
    OR ("deleted_at" IS NOT NULL AND "purge_at" IS NOT NULL AND "purge_at" >= "deleted_at")
  );

CREATE INDEX IF NOT EXISTS "projects_owner_id_deleted_at_idx"
  ON "projects"("owner_id", "deleted_at");

CREATE INDEX IF NOT EXISTS "projects_deleted_at_purge_at_idx"
  ON "projects"("deleted_at", "purge_at");

-- Allow cascading permanent deletion ONLY once the parent project has passed its 30-day Trash retention deadline.
CREATE OR REPLACE FUNCTION protect_mentor_access_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND EXISTS (
    SELECT 1 FROM "projects" p
    WHERE p.id = OLD.project_id
      AND p.deleted_at IS NOT NULL
      AND p.purge_at IS NOT NULL
      AND p.purge_at <= now()
  ) THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'DELETE' OR TG_TABLE_NAME = 'mentor_access_events' THEN
    RAISE EXCEPTION 'Mentor history must be retained';
  END IF;
  IF TG_TABLE_NAME = 'mentor_resource_shares' THEN
    IF (to_jsonb(OLD) - 'revoked_at') IS DISTINCT FROM (to_jsonb(NEW) - 'revoked_at') THEN
      RAISE EXCEPTION 'Published content is immutable';
    END IF;
  ELSIF TG_TABLE_NAME = 'mentor_feedback' THEN
    IF (to_jsonb(OLD) - ARRAY['status','version','handled_by_id','handled_at','response','resulting_revision_ref'])
       IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['status','version','handled_by_id','handled_at','response','resulting_revision_ref']) THEN
      RAISE EXCEPTION 'Feedback content is immutable';
    END IF;
  ELSIF TG_TABLE_NAME = 'mentor_agreements' THEN
    IF OLD.status <> 'PROPOSED' OR (to_jsonb(OLD) - ARRAY['status','responded_by_id','responded_at'])
       IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['status','responded_by_id','responded_at']) THEN
      RAISE EXCEPTION 'Agreement proposal is immutable';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION immutable_allocation_revision() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1 FROM "allocation_periods" ap
      JOIN "projects" p ON p.id = ap.project_id
      WHERE ap.id = OLD.period_id
        AND p.deleted_at IS NOT NULL
        AND p.purge_at IS NOT NULL
        AND p.purge_at <= now()
    ) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Allocation revisions cannot be deleted';
  END IF;
  IF OLD.submitted_at IS NOT NULL THEN
    IF (to_jsonb(NEW)-ARRAY['status','finalized_at','finalized_by_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','finalized_at','finalized_by_id']) THEN
      RAISE EXCEPTION 'Submitted allocation payload is immutable';
    END IF;
    IF OLD.finalized_by_id IS NOT NULL AND NEW.finalized_by_id IS DISTINCT FROM OLD.finalized_by_id THEN
      RAISE EXCEPTION 'Submitted allocation payload is immutable';
    END IF;
    IF OLD.status IN ('FINALIZED', 'SUPERSEDED', 'DISPUTED') AND NEW.status <> OLD.status THEN
      IF NOT (OLD.status = 'FINALIZED' AND NEW.status = 'SUPERSEDED') THEN
        RAISE EXCEPTION 'Terminal allocation revision status cannot transition';
      END IF;
    END IF;
    IF OLD.status = 'AWAITING_APPROVAL' AND NEW.status NOT IN ('AWAITING_APPROVAL', 'DISPUTED', 'FINALIZED') THEN
      RAISE EXCEPTION 'Submitted allocation revision cannot revert to draft';
    END IF;
  END IF;
  IF NEW.status <> 'DRAFT' AND NEW.submitted_at IS NULL THEN
    RAISE EXCEPTION 'Submitted allocation revision requires submitted_at';
  END IF;
  IF NEW.status = 'FINALIZED' AND NEW.finalized_at IS NULL THEN
    RAISE EXCEPTION 'Finalized allocation revision requires finalized_at';
  END IF;
  IF NEW.status <> 'FINALIZED' AND NEW.status <> 'SUPERSEDED' AND (NEW.finalized_at IS NOT NULL OR NEW.finalized_by_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Unfinalized allocation revision cannot set finalized_at';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION protect_analysis_set_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.entity_kind = 'ANALYSIS_SET' THEN
    IF EXISTS (
      SELECT 1 FROM "projects" p
      WHERE p.id = OLD.project_id
        AND p.deleted_at IS NOT NULL
        AND p.purge_at IS NOT NULL
        AND p.purge_at <= now()
    ) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Analysis sets are immutable';
  END IF;
  RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION protect_research_evidence_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND EXISTS (
    SELECT 1 FROM "projects" p
    WHERE p.id = OLD.project_id
      AND p.deleted_at IS NOT NULL
      AND p.purge_at IS NOT NULL
      AND p.purge_at <= now()
  ) THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.actor_id IS NOT NULL
     AND NEW.actor_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM "users" WHERE "id" = OLD.actor_id)
     AND (to_jsonb(OLD) - 'actor_id') IS NOT DISTINCT FROM (to_jsonb(NEW) - 'actor_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Research evidence ledger is append-only';
END $$;

CREATE OR REPLACE FUNCTION protect_manuscript_attribution_records() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND EXISTS (
    SELECT 1 FROM "projects" p
    WHERE p.id = OLD.project_id
      AND p.deleted_at IS NOT NULL
      AND p.purge_at IS NOT NULL
      AND p.purge_at <= now()
  ) THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'DELETE' OR TG_TABLE_NAME = 'manuscript_attribution_decisions' THEN
    RAISE EXCEPTION 'Manuscript attribution history is append-only';
  END IF;
  IF (to_jsonb(OLD) - ARRAY['status', 'verified_at']) IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['status', 'verified_at']) THEN
    RAISE EXCEPTION 'Manuscript attribution snapshot payload is immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION protect_research_integrity_records() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND EXISTS (
    SELECT 1 FROM "projects" p
    WHERE p.id = OLD.project_id
      AND p.deleted_at IS NOT NULL
      AND p.purge_at IS NOT NULL
      AND p.purge_at <= now()
  ) THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'DELETE' OR TG_TABLE_NAME = 'research_integrity_events' THEN
    RAISE EXCEPTION 'Research integrity history is append-only';
  END IF;
  IF (to_jsonb(OLD) - ARRAY['status', 'preserved_snapshot', 'containment_actions', 'escalated_at', 'resolved_at', 'resolved_by_id', 'resolution_summary', 'updated_at'])
     IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['status', 'preserved_snapshot', 'containment_actions', 'escalated_at', 'resolved_at', 'resolved_by_id', 'resolution_summary', 'updated_at']) THEN
    RAISE EXCEPTION 'Integrity case core allegation fields are immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION protect_completed_writing_report() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND EXISTS (
    SELECT 1 FROM "projects" p
    WHERE p.id = OLD.project_id
      AND p.deleted_at IS NOT NULL
      AND p.purge_at IS NOT NULL
      AND p.purge_at <= now()
  ) THEN
    RETURN OLD;
  END IF;
  IF OLD.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'Completed writing reports are immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION protect_screening_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND EXISTS (
    SELECT 1 FROM "projects" p
    WHERE p.id = OLD.project_id
      AND p.deleted_at IS NOT NULL
      AND p.purge_at IS NOT NULL
      AND p.purge_at <= now()
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Screening history is append-only';
END $$;

CREATE OR REPLACE FUNCTION manuscript_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'manuscript_snapshots' AND EXISTS (
      SELECT 1 FROM "projects" p
      WHERE p.id = OLD.project_id
        AND p.deleted_at IS NOT NULL
        AND p.purge_at IS NOT NULL
        AND p.purge_at <= now()
    ) THEN
      RETURN OLD;
    ELSIF TG_TABLE_NAME = 'manuscript_snapshot_assets' AND EXISTS (
      SELECT 1 FROM "manuscript_snapshots" ms
      JOIN "projects" p ON p.id = ms.project_id
      WHERE ms.id = OLD.snapshot_id
        AND p.deleted_at IS NOT NULL
        AND p.purge_at IS NOT NULL
        AND p.purge_at <= now()
    ) THEN
      RETURN OLD;
    ELSIF TG_TABLE_NAME = 'manuscript_updates' AND EXISTS (
      SELECT 1 FROM "manuscript_files" mf
      JOIN "draft_workspaces" dw ON dw.id = mf.workspace_id
      JOIN "projects" p ON p.id = dw.project_id
      WHERE mf.id = OLD.file_id
        AND p.deleted_at IS NOT NULL
        AND p.purge_at IS NOT NULL
        AND p.purge_at <= now()
    ) THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION 'Manuscript history is append-only';
END $$;
