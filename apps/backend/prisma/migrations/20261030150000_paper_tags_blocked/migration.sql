-- An admin can take a paper out of a tag that its rules or embeddings matched. The row stays as
-- source 'blocked' so automatic tagging does not add it back; blocked rows never count as tagged.

ALTER TABLE "paper_tags" DROP CONSTRAINT "paper_tags_source_check";
ALTER TABLE "paper_tags" ADD CONSTRAINT "paper_tags_source_check"
  CHECK ("source" IN ('rule', 'embedding', 'manual', 'blocked'));

CREATE INDEX "paper_tags_tag_id_source_idx" ON "paper_tags"("tag_id", "source");
