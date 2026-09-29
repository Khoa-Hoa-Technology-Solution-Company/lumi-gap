CREATE TABLE "external_review_invitations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "token_hash" VARCHAR(128) NOT NULL,
  "reviewer_email" VARCHAR(320) NOT NULL,
  "invited_user_id" UUID,
  "requester_id" UUID NOT NULL,
  "submission_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "template_version_id" UUID NOT NULL,
  "artifact_revision_id" UUID NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  "message" TEXT,
  "due_at" TIMESTAMPTZ(6),
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "responded_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "external_review_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "external_review_invitations_token_hash_key" ON "external_review_invitations"("token_hash");
CREATE INDEX "external_review_invitations_reviewer_email_status_expires_at_idx" ON "external_review_invitations"("reviewer_email", "status", "expires_at");
CREATE INDEX "external_review_invitations_invited_user_id_status_expires_at_idx" ON "external_review_invitations"("invited_user_id", "status", "expires_at");
CREATE INDEX "external_review_invitations_requester_id_status_created_at_idx" ON "external_review_invitations"("requester_id", "status", "created_at");
CREATE INDEX "external_review_invitations_submission_id_status_idx" ON "external_review_invitations"("submission_id", "status");
CREATE UNIQUE INDEX "external_review_invitations_pending_email_submission_key"
  ON "external_review_invitations"("submission_id", LOWER("reviewer_email"))
  WHERE "status" = 'PENDING';

ALTER TABLE "external_review_invitations" ADD CONSTRAINT "external_review_invitations_status_check"
  CHECK ("status" IN ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED'));
ALTER TABLE "external_review_invitations" ADD CONSTRAINT "external_review_invitations_invited_user_id_fkey"
  FOREIGN KEY ("invited_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "external_review_invitations" ADD CONSTRAINT "external_review_invitations_requester_id_fkey"
  FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "external_review_invitations" ADD CONSTRAINT "external_review_invitations_submission_id_fkey"
  FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE;
ALTER TABLE "external_review_invitations" ADD CONSTRAINT "external_review_invitations_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
ALTER TABLE "external_review_invitations" ADD CONSTRAINT "external_review_invitations_template_version_id_fkey"
  FOREIGN KEY ("template_version_id") REFERENCES "review_template_versions"("id") ON DELETE RESTRICT;
ALTER TABLE "external_review_invitations" ADD CONSTRAINT "external_review_invitations_artifact_revision_id_fkey"
  FOREIGN KEY ("artifact_revision_id") REFERENCES "submission_revisions"("id") ON DELETE RESTRICT;
