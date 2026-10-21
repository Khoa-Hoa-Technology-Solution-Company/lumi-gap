ALTER TABLE manuscript_suggestions
  ADD COLUMN revision integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT manuscript_suggestions_revision_positive CHECK (revision > 0);
