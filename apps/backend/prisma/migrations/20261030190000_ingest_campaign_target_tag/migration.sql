-- A campaign planned from a tag. The tag's rules are copied into the manifest when it is planned, so deleting the
-- tag later only clears this link.
ALTER TABLE "openalex_ingest_campaigns"
  ADD COLUMN "target_tag_id" UUID REFERENCES "tags"("id") ON DELETE SET NULL;

-- At most one live campaign per tag, so two admins cannot plan the same import twice.
CREATE UNIQUE INDEX "openalex_ingest_campaigns_live_tag_key"
  ON "openalex_ingest_campaigns"("target_tag_id")
  WHERE "target_tag_id" IS NOT NULL AND "state" IN ('planned', 'running', 'paused');
CREATE INDEX "openalex_ingest_campaigns_target_tag_id_created_at_idx"
  ON "openalex_ingest_campaigns"("target_tag_id", "created_at" DESC);
