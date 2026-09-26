ALTER TABLE "verification_evidence"
  ADD COLUMN "evidence_storage_key" VARCHAR(240),
  ADD COLUMN "evidence_file_name" VARCHAR(180),
  ADD COLUMN "evidence_mime_type" VARCHAR(80),
  ADD COLUMN "evidence_size_bytes" INTEGER;

-- Keep exactly one active review per user and verification type, including under concurrent submissions.
WITH ranked_pending AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "user_id", "verification_type"
    ORDER BY "submitted_at" DESC, "id" DESC
  ) AS row_number
  FROM "verification_evidence"
  WHERE "verification_type" IN ('POSITION', 'AFFILIATION') AND "status" = 'PENDING'
)
UPDATE "verification_evidence" AS evidence
SET "status" = 'INVALIDATED',
    "reviewed_at" = NOW(),
    "rejection_reason" = 'Superseded duplicate pending request'
FROM ranked_pending
WHERE evidence."id" = ranked_pending."id" AND ranked_pending.row_number > 1;

CREATE UNIQUE INDEX "verification_evidence_one_active_request_per_user_type"
  ON "verification_evidence"("user_id", "verification_type")
  WHERE "verification_type" IN ('POSITION', 'AFFILIATION') AND "status" = 'PENDING';
