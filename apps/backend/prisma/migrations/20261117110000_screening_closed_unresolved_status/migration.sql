-- Forward-only compatibility repair for databases that also ran the consensus
-- workflow branch. Preserve its states while allowing deadline-based closure.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE screening_rounds DROP CONSTRAINT screening_rounds_status_check;
ALTER TABLE screening_rounds ADD CONSTRAINT screening_rounds_status_check
  CHECK (status IN (
    'NOT_REVIEWED', 'IN_REVIEW', 'NEEDS_RESOLUTION', 'NEEDS_MORE_INFO',
    'ADJUDICATING', 'AWAITING_FINALIZATION', 'INCLUDED', 'EXCLUDED',
    'BACKGROUND', 'WAITING_FULLTEXT', 'CONSENSUS_REQUIRED',
    'CONSENSUS_IN_PROGRESS', 'CLOSED_UNRESOLVED'
  ));
COMMIT;
