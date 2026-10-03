CREATE TABLE "paper_documents" (
  "id" UUID PRIMARY KEY, "paper_id" UUID NOT NULL UNIQUE REFERENCES "papers"("id") ON DELETE CASCADE,
  "status" VARCHAR(24) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','ready','failed')),
  "source_kind" VARCHAR(24) NOT NULL DEFAULT 'abstract' CHECK (source_kind IN ('abstract','uploaded_pdf','open_access_pdf')),
  "source_hash" VARCHAR(64) NOT NULL, "content_hash" VARCHAR(64), "index_version" TEXT, "indexing_token" UUID,
  "page_count" INTEGER NOT NULL DEFAULT 0 CHECK (page_count >= 0),
  "warnings" TEXT[] NOT NULL DEFAULT '{}', "error_message" TEXT,
  "indexed_at" TIMESTAMPTZ, "updated_at" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "paper_documents_status_updated_at_idx" ON "paper_documents"("status", "updated_at");
CREATE TABLE "paper_chunks" (
  "id" UUID PRIMARY KEY, "document_id" UUID NOT NULL REFERENCES "paper_documents"("id") ON DELETE CASCADE,
  "position" INTEGER NOT NULL CHECK (position >= 0), "page_number" INTEGER CHECK (page_number > 0),
  "text" TEXT NOT NULL, "content_hash" VARCHAR(64) NOT NULL, "embedding" vector(768),
  UNIQUE ("document_id", "position")
);
CREATE INDEX "paper_chunks_text_idx" ON "paper_chunks" USING gin(to_tsvector('simple', "text"));
CREATE INDEX "paper_chunks_embedding_idx" ON "paper_chunks" USING hnsw (embedding vector_cosine_ops);
CREATE TABLE "knowledge_entities" (
  "id" UUID PRIMARY KEY, "kind" VARCHAR(32) NOT NULL, "normalized_name" TEXT NOT NULL, "name" TEXT NOT NULL,
  UNIQUE ("kind", "normalized_name")
);
CREATE TABLE "knowledge_relations" (
  "id" UUID PRIMARY KEY, "chunk_id" UUID NOT NULL REFERENCES "paper_chunks"("id") ON DELETE CASCADE,
  "entity_id" UUID NOT NULL REFERENCES "knowledge_entities"("id") ON DELETE RESTRICT,
  "kind" VARCHAR(32) NOT NULL, "quote" TEXT NOT NULL,
  UNIQUE ("chunk_id", "entity_id", "kind")
);
CREATE INDEX "knowledge_relations_entity_id_kind_idx" ON "knowledge_relations"("entity_id", "kind");

-- An edited source must not retain a ready index or structured claims from its
-- previous version. This also covers updates made by provider ingest workers.
CREATE FUNCTION invalidate_paper_knowledge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.title, NEW.abstract_text, NEW.pdf_path, NEW.open_access_url, NEW.uploaded_at)
     IS DISTINCT FROM ROW(OLD.title, OLD.abstract_text, OLD.pdf_path, OLD.open_access_url, OLD.uploaded_at) THEN
    NEW.ai_analysis := NULL;
    UPDATE paper_documents SET status = 'queued', indexing_token = NULL, updated_at = NOW(), error_message = NULL WHERE paper_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invalidate_paper_knowledge_source BEFORE UPDATE OF title, abstract_text, pdf_path, open_access_url, uploaded_at
  ON papers FOR EACH ROW EXECUTE FUNCTION invalidate_paper_knowledge();

-- Reports remain reproducible after a source PDF is replaced/reindexed.
ALTER TABLE reports ADD COLUMN evidence_snapshot JSONB NOT NULL DEFAULT '[]';
ALTER TABLE gap_analyses ADD COLUMN evidence_snapshot JSONB NOT NULL DEFAULT '[]';
