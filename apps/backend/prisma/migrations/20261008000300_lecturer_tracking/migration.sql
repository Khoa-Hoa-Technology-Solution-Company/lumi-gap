ALTER TABLE verification_evidence
  ADD COLUMN previous_request_id uuid REFERENCES verification_evidence(id) ON DELETE SET NULL,
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD COLUMN invalidated_at timestamptz;
CREATE INDEX verification_request_lineage_idx ON verification_evidence(previous_request_id);
ALTER TABLE verification_evidence_sources ADD COLUMN previous_source_id uuid REFERENCES verification_evidence_sources(id) ON DELETE SET NULL;
CREATE INDEX verification_source_lineage_idx ON verification_evidence_sources(previous_source_id);
