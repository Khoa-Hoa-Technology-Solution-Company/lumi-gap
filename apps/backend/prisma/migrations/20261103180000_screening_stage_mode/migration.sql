-- Nullable deliberately: existing settings and immutable round snapshots retain their rules.
ALTER TABLE screening_rounds DROP CONSTRAINT screening_rounds_status_check;
ALTER TABLE screening_rounds ADD CONSTRAINT screening_rounds_status_check CHECK (status IN ('NOT_REVIEWED','IN_REVIEW','NEEDS_RESOLUTION','NEEDS_MORE_INFO','ADJUDICATING','AWAITING_FINALIZATION','INCLUDED','EXCLUDED','BACKGROUND','WAITING_FULLTEXT'));
ALTER TABLE screening_settings ADD COLUMN screening_mode VARCHAR(24);
ALTER TABLE screening_settings ADD CONSTRAINT screening_settings_stage_mode_check
  CHECK (screening_mode IS NULL OR screening_mode IN ('SINGLE_STAGE', 'TWO_STAGE'));
