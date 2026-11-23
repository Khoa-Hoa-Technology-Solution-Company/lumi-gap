-- Forward-only: retain every historical ballot, decision and audit event.
-- Closed without consensus is distinct from exclusion by eligibility criteria.
ALTER TABLE screening_final_decisions ALTER COLUMN decision TYPE varchar(24);
ALTER TABLE screening_final_decisions DROP CONSTRAINT screening_final_decisions_decision_check;
ALTER TABLE screening_final_decisions ADD CONSTRAINT screening_final_decisions_decision_check
  CHECK (decision IN ('INCLUDED','EXCLUDED','BACKGROUND','NEEDS_MORE_INFO','CLOSED_UNRESOLVED'));
