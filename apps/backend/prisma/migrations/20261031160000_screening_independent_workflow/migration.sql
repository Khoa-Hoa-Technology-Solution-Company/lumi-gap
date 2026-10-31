-- New round snapshots opt in to workflow v3. Historical rounds retain their rules.
ALTER TABLE screening_rounds DROP CONSTRAINT screening_rounds_status_check;
ALTER TABLE screening_rounds ADD CONSTRAINT screening_rounds_status_check
  CHECK (status IN ('NOT_REVIEWED','IN_REVIEW','NEEDS_RESOLUTION','NEEDS_MORE_INFO','ADJUDICATING','AWAITING_FINALIZATION','INCLUDED','EXCLUDED','BACKGROUND'));
