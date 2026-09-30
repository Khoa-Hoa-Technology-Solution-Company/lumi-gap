-- Community approval workflow: lecturers/researchers propose a community
-- (PENDING_APPROVAL); an administrator approves (ACTIVE) or rejects (REJECTED).
-- The status column stays VARCHAR(16); only the CHECK constraint widens.
ALTER TABLE "communities"
  ADD COLUMN "review_note" TEXT,
  ADD COLUMN "reviewed_by_id" UUID,
  ADD COLUMN "reviewed_at" TIMESTAMPTZ(6);

ALTER TABLE "communities" DROP CONSTRAINT "communities_status_check";
ALTER TABLE "communities" ADD CONSTRAINT "communities_status_check"
  CHECK ("status" IN ('ACTIVE', 'ARCHIVED', 'PENDING_APPROVAL', 'REJECTED'));

ALTER TABLE "communities" ADD CONSTRAINT "communities_reviewed_by_id_fkey"
  FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "communities_reviewed_by_id_idx" ON "communities"("reviewed_by_id");
