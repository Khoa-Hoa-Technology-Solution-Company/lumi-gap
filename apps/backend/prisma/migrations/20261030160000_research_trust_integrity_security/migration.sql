-- Phase P0 & P1: Research Contribution Protection, Evidence Ledger, Attribution Verification & Security Policies

-- 1. Project-level security, export, AI data, and external lookup policies
ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "export_policy" VARCHAR(24) NOT NULL DEFAULT 'ALL_MEMBERS',
  ADD COLUMN IF NOT EXISTS "ai_data_policy" VARCHAR(24) NOT NULL DEFAULT 'ALLOW_PERSONAL_AI',
  ADD COLUMN IF NOT EXISTS "external_lookup_policy" VARCHAR(24) NOT NULL DEFAULT 'ALLOW_PUBLIC_INDEX';

ALTER TABLE "projects"
  DROP CONSTRAINT IF EXISTS "projects_export_policy_check",
  ADD CONSTRAINT "projects_export_policy_check"
    CHECK ("export_policy" IN ('ALL_MEMBERS', 'OWNER_ONLY')),
  DROP CONSTRAINT IF EXISTS "projects_ai_data_policy_check",
  ADD CONSTRAINT "projects_ai_data_policy_check"
    CHECK ("ai_data_policy" IN ('ALLOW_PERSONAL_AI', 'PLATFORM_AI_ONLY', 'DISABLED')),
  DROP CONSTRAINT IF EXISTS "projects_external_lookup_policy_check",
  ADD CONSTRAINT "projects_external_lookup_policy_check"
    CHECK ("external_lookup_policy" IN ('ALLOW_PUBLIC_INDEX', 'LOCAL_CORPUS_ONLY'));

-- 2. Lecturer feedback resulting revision reference + updated immutability trigger
ALTER TABLE "mentor_feedback"
  ADD COLUMN IF NOT EXISTS "resulting_revision_ref" VARCHAR(120);

CREATE OR REPLACE FUNCTION protect_mentor_access_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
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

-- 3. Strengthen allocation revision immutability trigger on DELETE
CREATE OR REPLACE FUNCTION immutable_allocation_revision() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
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

-- 4. Prevent in-place mutation of audit_logs and project_activities
CREATE OR REPLACE FUNCTION prevent_audit_row_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit and activity rows cannot be modified in place';
END $$;

DROP TRIGGER IF EXISTS "audit_logs_prevent_update" ON "audit_logs";
CREATE TRIGGER "audit_logs_prevent_update"
  BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_row_mutation();

DROP TRIGGER IF EXISTS "project_activities_prevent_update" ON "project_activities";
CREATE TRIGGER "project_activities_prevent_update"
  BEFORE UPDATE ON "project_activities"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_row_mutation();

-- 5. Append-only Research Evidence Ledger
CREATE TABLE IF NOT EXISTS "research_evidence_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL REFERENCES "projects"("id") ON DELETE RESTRICT,
  "actor_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "event_type" VARCHAR(48) NOT NULL,
  "resource_kind" VARCHAR(32) NOT NULL,
  "resource_id" VARCHAR(120),
  "artifact_version" VARCHAR(80),
  "previous_version_ref" VARCHAR(120),
  "current_version_ref" VARCHAR(120),
  "checksum_sha256" CHAR(64),
  "reason" TEXT,
  "visibility" VARCHAR(24) NOT NULL DEFAULT 'PROJECT_TEAM'
    CHECK ("visibility" IN ('PROJECT_TEAM', 'OWNER_ADMIN', 'CONTRIBUTOR_SCOPED')),
  "retention_class" VARCHAR(32) NOT NULL DEFAULT 'RESEARCH_EVIDENCE'
    CHECK ("retention_class" IN ('RESEARCH_EVIDENCE', 'SECURITY_AUDIT', 'ATTRIBUTION_RECORD')),
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "research_evidence_events_project_id_created_at_idx"
  ON "research_evidence_events"("project_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "research_evidence_events_project_id_event_type_created_at_idx"
  ON "research_evidence_events"("project_id", "event_type", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "research_evidence_events_actor_id_created_at_idx"
  ON "research_evidence_events"("actor_id", "created_at" DESC);

CREATE OR REPLACE FUNCTION protect_research_evidence_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Research evidence ledger is append-only';
END $$;

DROP TRIGGER IF EXISTS "research_evidence_events_immutable" ON "research_evidence_events";
CREATE TRIGGER "research_evidence_events_immutable"
  BEFORE UPDATE OR DELETE ON "research_evidence_events"
  FOR EACH ROW EXECUTE FUNCTION protect_research_evidence_ledger();

-- 6. Pre-submission Manuscript Attribution Checks & Decisions
CREATE TABLE IF NOT EXISTS "manuscript_attribution_checks" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL REFERENCES "projects"("id") ON DELETE RESTRICT,
  "workspace_id" UUID NOT NULL REFERENCES "draft_workspaces"("id") ON DELETE RESTRICT,
  "snapshot_id" UUID NOT NULL,
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING_CONFIRMATION'
    CHECK ("status" IN ('PENDING_CONFIRMATION', 'DISPUTED', 'VERIFIED', 'SUPERSEDED')),
  "proposed_authors" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "acknowledgements" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "acknowledgement_text" TEXT NOT NULL DEFAULT '',
  "omitted_contributors" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "snapshot_digest_sha256" CHAR(64) NOT NULL,
  "created_by_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "verified_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "manuscript_attribution_checks_snapshot_fkey"
    FOREIGN KEY ("snapshot_id", "project_id") REFERENCES "manuscript_snapshots"("id", "project_id") ON DELETE RESTRICT,
  UNIQUE ("snapshot_id", "version"),
  UNIQUE ("id", "project_id")
);

CREATE INDEX IF NOT EXISTS "manuscript_attribution_checks_project_workspace_snapshot_idx"
  ON "manuscript_attribution_checks"("project_id", "workspace_id", "snapshot_id");

CREATE TABLE IF NOT EXISTS "manuscript_attribution_decisions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "check_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "participant_kind" VARCHAR(24) NOT NULL
    CHECK ("participant_kind" IN ('AUTHOR', 'ACKNOWLEDGED', 'CONTRIBUTOR', 'ADVISOR')),
  "decision" VARCHAR(16) NOT NULL
    CHECK ("decision" IN ('CONFIRM', 'CLARIFY', 'DISPUTE')),
  "note" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "manuscript_attribution_decisions_check_fkey"
    FOREIGN KEY ("check_id", "project_id") REFERENCES "manuscript_attribution_checks"("id", "project_id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "manuscript_attribution_decisions_check_id_created_at_idx"
  ON "manuscript_attribution_decisions"("check_id", "created_at");
CREATE INDEX IF NOT EXISTS "manuscript_attribution_decisions_check_id_user_id_created_at_idx"
  ON "manuscript_attribution_decisions"("check_id", "user_id", "created_at");

CREATE OR REPLACE FUNCTION protect_manuscript_attribution_records() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_TABLE_NAME = 'manuscript_attribution_decisions' THEN
    RAISE EXCEPTION 'Manuscript attribution history is append-only';
  END IF;
  IF (to_jsonb(OLD) - ARRAY['status', 'verified_at']) IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['status', 'verified_at']) THEN
    RAISE EXCEPTION 'Manuscript attribution snapshot payload is immutable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "manuscript_attribution_checks_immutable" ON "manuscript_attribution_checks";
CREATE TRIGGER "manuscript_attribution_checks_immutable"
  BEFORE UPDATE OR DELETE ON "manuscript_attribution_checks"
  FOR EACH ROW EXECUTE FUNCTION protect_manuscript_attribution_records();

DROP TRIGGER IF EXISTS "manuscript_attribution_decisions_immutable" ON "manuscript_attribution_decisions";
CREATE TRIGGER "manuscript_attribution_decisions_immutable"
  BEFORE UPDATE OR DELETE ON "manuscript_attribution_decisions"
  FOR EACH ROW EXECUTE FUNCTION protect_manuscript_attribution_records();

ALTER TABLE "submission_revisions"
  ADD COLUMN IF NOT EXISTS "attribution_check_id" UUID REFERENCES "manuscript_attribution_checks"("id") ON DELETE RESTRICT;

-- 7. Research Integrity Cases (Disputes & Suspected Data Leak Incidents)
CREATE TABLE IF NOT EXISTS "research_integrity_cases" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL REFERENCES "projects"("id") ON DELETE RESTRICT,
  "kind" VARCHAR(32) NOT NULL
    CHECK ("kind" IN ('CONTRIBUTION_DISPUTE', 'ATTRIBUTION_DISPUTE', 'DATA_LEAK_INCIDENT')),
  "status" VARCHAR(24) NOT NULL DEFAULT 'REPORTED'
    CHECK ("status" IN ('REPORTED', 'CONTAINED', 'UNDER_REVIEW', 'ESCALATED', 'RESOLVED', 'CLOSED')),
  "reporter_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "respondent_user_id" UUID REFERENCES "users"("id") ON DELETE RESTRICT,
  "target_kind" VARCHAR(32) NOT NULL
    CHECK ("target_kind" IN ('WORK_CONTRIBUTION', 'ALLOCATION_REVISION', 'MANUSCRIPT_ATTRIBUTION', 'MANUSCRIPT', 'PAPER_FILE', 'MENTOR_SHARE', 'PROJECT')),
  "target_id" VARCHAR(120),
  "title" VARCHAR(200) NOT NULL CHECK (length(trim("title")) > 0),
  "description" TEXT NOT NULL CHECK (length(trim("description")) > 0),
  "evidence_refs" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "preserved_snapshot" JSONB,
  "containment_actions" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "escalated_at" TIMESTAMPTZ,
  "resolved_at" TIMESTAMPTZ,
  "resolved_by_id" UUID REFERENCES "users"("id") ON DELETE RESTRICT,
  "resolution_summary" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("id", "project_id")
);

CREATE INDEX IF NOT EXISTS "research_integrity_cases_project_kind_status_created_idx"
  ON "research_integrity_cases"("project_id", "kind", "status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "research_integrity_cases_reporter_created_idx"
  ON "research_integrity_cases"("reporter_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "research_integrity_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "case_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "actor_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "action" VARCHAR(32) NOT NULL
    CHECK ("action" IN ('REPORTED', 'RESPONSE_ADDED', 'EVIDENCE_PRESERVED', 'CONTAINMENT_APPLIED', 'ESCALATED', 'STATUS_CHANGED', 'RESOLVED')),
  "note" TEXT NOT NULL DEFAULT '',
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "research_integrity_events_case_fkey"
    FOREIGN KEY ("case_id", "project_id") REFERENCES "research_integrity_cases"("id", "project_id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "research_integrity_events_case_id_created_at_idx"
  ON "research_integrity_events"("case_id", "created_at");
CREATE INDEX IF NOT EXISTS "research_integrity_events_project_id_created_at_idx"
  ON "research_integrity_events"("project_id", "created_at" DESC);

CREATE OR REPLACE FUNCTION protect_research_integrity_records() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_TABLE_NAME = 'research_integrity_events' THEN
    RAISE EXCEPTION 'Research integrity history is append-only';
  END IF;
  IF (to_jsonb(OLD) - ARRAY['status', 'preserved_snapshot', 'containment_actions', 'escalated_at', 'resolved_at', 'resolved_by_id', 'resolution_summary', 'updated_at'])
     IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['status', 'preserved_snapshot', 'containment_actions', 'escalated_at', 'resolved_at', 'resolved_by_id', 'resolution_summary', 'updated_at']) THEN
    RAISE EXCEPTION 'Integrity case core allegation fields are immutable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "research_integrity_cases_immutable" ON "research_integrity_cases";
CREATE TRIGGER "research_integrity_cases_immutable"
  BEFORE UPDATE OR DELETE ON "research_integrity_cases"
  FOR EACH ROW EXECUTE FUNCTION protect_research_integrity_records();

DROP TRIGGER IF EXISTS "research_integrity_events_immutable" ON "research_integrity_events";
CREATE TRIGGER "research_integrity_events_immutable"
  BEFORE UPDATE OR DELETE ON "research_integrity_events"
  FOR EACH ROW EXECUTE FUNCTION protect_research_integrity_records();

