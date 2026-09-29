CREATE TABLE "mentor_relationships" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "mentor_user_id" UUID NOT NULL,
  "requested_by" UUID NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  "message" TEXT,
  "response_note" TEXT,
  "accepted_at" TIMESTAMPTZ(6),
  "ended_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mentor_relationships_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mentor_relationships_project_id_status_created_at_idx" ON "mentor_relationships"("project_id", "status", "created_at");
CREATE INDEX "mentor_relationships_mentor_user_id_status_created_at_idx" ON "mentor_relationships"("mentor_user_id", "status", "created_at");
CREATE INDEX "mentor_relationships_requested_by_created_at_idx" ON "mentor_relationships"("requested_by", "created_at");

CREATE UNIQUE INDEX "mentor_relationships_one_active_project_mentor"
  ON "mentor_relationships"("project_id", "mentor_user_id")
  WHERE "status" IN ('PENDING', 'ACCEPTED');

ALTER TABLE "mentor_relationships" ADD CONSTRAINT "mentor_relationships_status_check"
  CHECK ("status" IN ('PENDING', 'ACCEPTED', 'DECLINED', 'ENDED'));
ALTER TABLE "mentor_relationships" ADD CONSTRAINT "mentor_relationships_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
ALTER TABLE "mentor_relationships" ADD CONSTRAINT "mentor_relationships_mentor_user_id_fkey"
  FOREIGN KEY ("mentor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "mentor_relationships" ADD CONSTRAINT "mentor_relationships_requested_by_fkey"
  FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT;
