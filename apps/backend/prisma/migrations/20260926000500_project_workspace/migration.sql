ALTER TABLE "projects"
  ADD COLUMN "research_field" VARCHAR(200),
  ADD COLUMN "status" VARCHAR(24) NOT NULL DEFAULT 'PLANNING',
  ADD COLUMN "visibility" VARCHAR(24) NOT NULL DEFAULT 'PRIVATE',
  ADD COLUMN "archived_at" TIMESTAMPTZ(6);

UPDATE "project_members" SET "role" = UPPER("role"), "status" = UPPER("status");
ALTER TABLE "project_members" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
ALTER TABLE "project_members" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

ALTER TABLE "project_papers"
  ADD COLUMN "screening_status" VARCHAR(24) NOT NULL DEFAULT 'UNDECIDED',
  ADD COLUMN "reading_status" VARCHAR(24) NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN "inclusion_reason" TEXT,
  ADD COLUMN "exclusion_reason" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "reports"
  ADD COLUMN "title" VARCHAR(240),
  ADD COLUMN "artifact_type" VARCHAR(32) NOT NULL DEFAULT 'GENERAL_REPORT',
  ADD COLUMN "artifact_status" VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "is_ai_generated" BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE "reports" SET "title" = LEFT(COALESCE(NULLIF("topic", ''), "query"), 240) WHERE "title" IS NULL;

CREATE TABLE "project_invitations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "invited_user_id" UUID,
  "email" VARCHAR(320) NOT NULL,
  "message" VARCHAR(1000),
  "invited_by_id" UUID NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "responded_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_activities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "actor_id" UUID,
  "type" VARCHAR(48) NOT NULL,
  "entity_kind" VARCHAR(32),
  "entity_id" VARCHAR(64),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "projects_status_visibility_updated_at_idx" ON "projects"("status", "visibility", "updated_at");
CREATE INDEX "project_papers_project_id_screening_status_reading_status_idx" ON "project_papers"("project_id", "screening_status", "reading_status");
CREATE INDEX "project_invitations_project_id_status_created_at_idx" ON "project_invitations"("project_id", "status", "created_at");
CREATE INDEX "project_invitations_invited_user_id_status_created_at_idx" ON "project_invitations"("invited_user_id", "status", "created_at");
CREATE INDEX "project_invitations_email_status_created_at_idx" ON "project_invitations"("email", "status", "created_at");
CREATE UNIQUE INDEX "project_invitations_pending_user_key" ON "project_invitations"("project_id", "invited_user_id") WHERE "status" = 'PENDING' AND "invited_user_id" IS NOT NULL;
CREATE UNIQUE INDEX "project_invitations_pending_email_key" ON "project_invitations"("project_id", LOWER("email")) WHERE "status" = 'PENDING';
CREATE INDEX "project_activities_project_id_created_at_idx" ON "project_activities"("project_id", "created_at");
CREATE INDEX "project_activities_actor_id_created_at_idx" ON "project_activities"("actor_id", "created_at");

ALTER TABLE "projects" ADD CONSTRAINT "projects_status_check" CHECK ("status" IN ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'));
ALTER TABLE "projects" ADD CONSTRAINT "projects_visibility_check" CHECK ("visibility" IN ('PRIVATE', 'INVITE_ONLY', 'PUBLIC_SUMMARY'));
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_role_check" CHECK ("role" IN ('OWNER', 'MEMBER'));
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_status_check" CHECK ("status" IN ('ACTIVE', 'REMOVED', 'LEFT'));
ALTER TABLE "project_papers" ADD CONSTRAINT "project_papers_screening_status_check" CHECK ("screening_status" IN ('UNDECIDED', 'INCLUDED', 'EXCLUDED'));
ALTER TABLE "project_papers" ADD CONSTRAINT "project_papers_reading_status_check" CHECK ("reading_status" IN ('NOT_STARTED', 'READING', 'REVIEWED'));
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_status_check" CHECK ("status" IN ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED'));
ALTER TABLE "reports" ADD CONSTRAINT "reports_artifact_type_check" CHECK ("artifact_type" IN ('LITERATURE_REVIEW', 'EVIDENCE_SYNTHESIS', 'GAP_ANALYSIS', 'RESEARCH_PROPOSAL', 'RESEARCH_PLAN', 'GENERAL_REPORT'));
ALTER TABLE "reports" ADD CONSTRAINT "reports_artifact_status_check" CHECK ("artifact_status" IN ('DRAFT', 'REVIEWING', 'FINAL', 'ARCHIVED'));

ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_invited_user_id_fkey" FOREIGN KEY ("invited_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "project_activities" ADD CONSTRAINT "project_activities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
ALTER TABLE "project_activities" ADD CONSTRAINT "project_activities_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL;
