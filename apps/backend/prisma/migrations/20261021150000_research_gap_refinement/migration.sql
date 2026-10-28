-- Result of the self-check that compares a generated gap with papers that may already answer it (keep / narrow / drop).
ALTER TABLE "research_gaps" ADD COLUMN "refinement" JSONB;
