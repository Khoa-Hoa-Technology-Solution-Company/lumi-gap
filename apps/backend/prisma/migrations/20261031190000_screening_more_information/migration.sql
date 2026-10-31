-- Non-terminal resolutions preserve the reviewed versions and reasons just like binary decisions.
-- Existing rows and append-only triggers remain unchanged.
ALTER TABLE screening_final_decisions DROP CONSTRAINT screening_final_decisions_decision_check;
ALTER TABLE screening_final_decisions ADD CONSTRAINT screening_final_decisions_decision_check
  CHECK (decision IN ('INCLUDED', 'EXCLUDED', 'BACKGROUND', 'NEEDS_MORE_INFO'));
