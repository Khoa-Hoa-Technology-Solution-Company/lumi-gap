-- Additive, historical declarations retain their original policy semantics.
ALTER TABLE manuscript_attribution_checks
  ADD COLUMN publication_policy JSONB NOT NULL DEFAULT '{}'::jsonb;
