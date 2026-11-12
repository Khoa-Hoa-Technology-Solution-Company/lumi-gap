-- Reconcile parallel Screening migrations for databases that already applied the
-- team-workflow migration. Keep both historical closure and active consensus states.
BEGIN;
ALTER TABLE screening_rounds DROP CONSTRAINT IF EXISTS screening_rounds_status_check;
ALTER TABLE screening_rounds ADD CONSTRAINT screening_rounds_status_check
  CHECK (status IN ('NOT_REVIEWED','IN_REVIEW','NEEDS_RESOLUTION','NEEDS_MORE_INFO',
    'ADJUDICATING','AWAITING_FINALIZATION','INCLUDED','EXCLUDED','BACKGROUND',
    'WAITING_FULLTEXT','CLOSED_UNRESOLVED','CONSENSUS_REQUIRED','CONSENSUS_IN_PROGRESS'));
COMMIT;
