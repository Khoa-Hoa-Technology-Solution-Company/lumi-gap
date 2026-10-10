ALTER TABLE projects
  ADD COLUMN mentorship_discovery varchar(24) NOT NULL DEFAULT 'CLOSED',
  ADD COLUMN mentorship_summary varchar(2000),
  ADD COLUMN mentorship_expertise text[] NOT NULL DEFAULT ARRAY[]::text[];
ALTER TABLE mentor_relationships
  ADD COLUMN direction varchar(32) NOT NULL DEFAULT 'PROJECT_TO_LECTURER',
  ADD COLUMN responded_at timestamptz(6),
  ADD COLUMN expires_at timestamptz(6),
  ADD COLUMN ended_by_id uuid;
-- Keep all legacy relationships and provenance. Old requests retain no expiry.
UPDATE mentor_relationships SET responded_at = COALESCE(accepted_at, ended_at, updated_at)
 WHERE status <> 'PENDING';
-- Existing duplicates are preserved; service locks serialize all new writes.
CREATE INDEX mentor_relationships_pair_idx ON mentor_relationships(project_id, mentor_user_id, status);
ALTER TABLE "review_requests" ADD COLUMN "responded_at" TIMESTAMPTZ(6), ADD COLUMN "expires_at" TIMESTAMPTZ(6);
UPDATE "review_requests" SET "responded_at" = "updated_at" WHERE "status" <> 'REQUESTED';
ALTER TABLE "mentor_relationships" DROP CONSTRAINT "mentor_relationships_status_check";
ALTER TABLE "mentor_relationships" ADD CONSTRAINT "mentor_relationships_status_check"
  CHECK (status IN ('PENDING','ACCEPTED','DECLINED','CANCELLED','EXPIRED','ENDED'));
ALTER TABLE "academic_profiles" DROP CONSTRAINT "academic_profiles_position_status_check";
ALTER TABLE "academic_profiles" ADD CONSTRAINT "academic_profiles_position_status_check"
  CHECK (position_status IN ('NOT_SUBMITTED','UNVERIFIED','PENDING','NEEDS_MORE_INFORMATION','VERIFIED','REJECTED','EXPIRED','INVALIDATED'));
ALTER TABLE "affiliations" DROP CONSTRAINT "affiliations_position_status_check";
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_position_status_check"
  CHECK (position_status IN ('NOT_SUBMITTED','UNVERIFIED','PENDING','NEEDS_MORE_INFORMATION','VERIFIED','REJECTED','EXPIRED','INVALIDATED'));
ALTER TABLE projects ADD CONSTRAINT projects_mentorship_discovery_check CHECK (mentorship_discovery IN ('CLOSED','SEEKING_MENTOR'));
ALTER TABLE mentor_relationships ADD CONSTRAINT mentor_relationships_direction_check CHECK (direction IN ('PROJECT_TO_LECTURER','LECTURER_TO_PROJECT'));
