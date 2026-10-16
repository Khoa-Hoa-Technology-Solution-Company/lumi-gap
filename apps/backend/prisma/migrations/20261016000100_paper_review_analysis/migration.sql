-- Issues, claims and verification warnings returned by the AI reviewer.
ALTER TABLE "paper_reviews" ADD COLUMN "analysis" JSONB NOT NULL DEFAULT '{}';
