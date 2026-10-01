ALTER TABLE "gap_evidence_records"
  ADD COLUMN "source_location" TEXT,
  ADD COLUMN "project_paper_id" UUID,
  ADD COLUMN "corpus_paper_id" UUID,
  ADD COLUMN "forum_reference_id" UUID,
  ADD COLUMN "forum_post_id" UUID,
  ADD COLUMN "forum_comment_id" UUID;

UPDATE "gap_evidence_records"
SET "evidence_type" = 'LEGACY'
WHERE "evidence_type" IS NULL;

ALTER TABLE "gap_evidence_records"
  ALTER COLUMN "evidence_type" SET DEFAULT 'LEGACY',
  ALTER COLUMN "evidence_type" SET NOT NULL;

DROP INDEX IF EXISTS "gap_evidence_records_gap_id_paper_id_evidence_kind_key";
CREATE UNIQUE INDEX "gap_evidence_records_gap_id_paper_id_evidence_kind_evidence_type_key"
  ON "gap_evidence_records" ("gap_id", "paper_id", "evidence_kind", "evidence_type");

CREATE INDEX "gap_evidence_records_corpus_paper_id_idx"
  ON "gap_evidence_records" ("corpus_paper_id");
CREATE INDEX "gap_evidence_records_forum_reference_id_idx"
  ON "gap_evidence_records" ("forum_reference_id");

ALTER TABLE "gap_evidence_records"
  ADD CONSTRAINT "gap_evidence_records_project_paper_id_fkey"
    FOREIGN KEY ("project_paper_id") REFERENCES "project_papers"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "gap_evidence_records_corpus_paper_id_fkey"
    FOREIGN KEY ("corpus_paper_id") REFERENCES "corpus_papers"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "gap_evidence_records_forum_reference_id_fkey"
    FOREIGN KEY ("forum_reference_id") REFERENCES "forum_references"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "gap_evidence_records_forum_post_id_fkey"
    FOREIGN KEY ("forum_post_id") REFERENCES "forum_posts"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "gap_evidence_records_forum_comment_id_fkey"
    FOREIGN KEY ("forum_comment_id") REFERENCES "forum_comments"("id") ON DELETE SET NULL;
