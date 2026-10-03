-- Community embeddings for semantic suggestions. The `vector` extension already
-- exists from the foundation migration. No ANN index: the table is small and a
-- sequential scan gives exact results.
ALTER TABLE "communities"
  ADD COLUMN "embedding" vector(768),
  ADD COLUMN "embedding_model" TEXT,
  ADD COLUMN "embedding_version" TEXT,
  ADD COLUMN "embedding_dimensions" INTEGER,
  ADD COLUMN "embedding_updated_at" TIMESTAMPTZ(6);
