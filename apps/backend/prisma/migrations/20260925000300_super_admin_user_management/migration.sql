-- Add a protected platform-owner role and retain the reason for account-state changes.
ALTER TABLE "users" DROP CONSTRAINT "users_system_role_check";

ALTER TABLE "users"
  ADD CONSTRAINT "users_system_role_check"
  CHECK ("system_role" IN ('RESEARCH_USER', 'ADMIN', 'SUPER_ADMIN')),
  ADD COLUMN "account_status_reason" VARCHAR(500),
  ADD COLUMN "account_status_changed_at" TIMESTAMPTZ(6),
  ADD COLUMN "account_status_changed_by_id" UUID;

ALTER TABLE "users"
  ADD CONSTRAINT "users_account_status_changed_by_id_fkey"
  FOREIGN KEY ("account_status_changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL;

CREATE INDEX "users_account_status_changed_by_id_idx" ON "users"("account_status_changed_by_id");

-- Keep exactly one deterministic owner after deployment. Additional super admins
-- can subsequently be promoted through the audited admin interface.
UPDATE "users"
SET "system_role" = 'SUPER_ADMIN', "role" = 'admin'
WHERE "id" = COALESCE(
  (SELECT "id" FROM "users" WHERE lower("email") = 'admin@liemresearch.com' LIMIT 1),
  (SELECT "id" FROM "users" WHERE "system_role" = 'ADMIN' AND "account_status" = 'ACTIVE' ORDER BY "created_at" ASC LIMIT 1)
);
