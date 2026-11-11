-- Add CLOSED_UNRESOLVED status to screening_rounds check constraint
-- This status represents a screening attempt closed without consensus within deadline
ALTER TABLE screening_rounds DROP CONSTRAINT IF EXISTS screening_rounds_status_check;
ALTER TABLE screening_rounds ADD CONSTRAINT screening_rounds_status_check
  CHECK (status IN ('NOT_REVIEWED','IN_REVIEW','NEEDS_RESOLUTION','NEEDS_MORE_INFO','ADJUDICATING','AWAITING_FINALIZATION','INCLUDED','EXCLUDED','BACKGROUND','WAITING_FULLTEXT','CLOSED_UNRESOLVED'));

