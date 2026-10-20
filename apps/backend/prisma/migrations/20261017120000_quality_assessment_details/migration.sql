-- Preserve existing evaluations. Missing structured assessments remain NULL (legacy).
ALTER TABLE quality_evaluations
  ADD COLUMN assessment JSONB,
  ADD COLUMN input_fingerprint VARCHAR(64),
  ALTER COLUMN relevance DROP NOT NULL,
  ALTER COLUMN groundedness DROP NOT NULL,
  ALTER COLUMN completeness DROP NOT NULL,
  ALTER COLUMN overall TYPE DOUBLE PRECISION USING overall::DOUBLE PRECISION,
  ALTER COLUMN overall DROP NOT NULL;
