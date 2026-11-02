-- Existing outcomes retain their original, potentially ambiguous provenance.
-- Never infer historical consent or delete a historical review.
ALTER TABLE screening_final_decisions
  ADD COLUMN resolution_type VARCHAR(32),
  ADD COLUMN exclusion_reason VARCHAR(500),
  ADD COLUMN source_material TEXT,
  ADD CONSTRAINT screening_resolution_type_check CHECK (
    resolution_type IS NULL OR resolution_type IN
      ('AGREEMENT_FROM_REVIEWS', 'CONSENSUS_AFTER_DISCUSSION', 'ADJUDICATION')
  );
