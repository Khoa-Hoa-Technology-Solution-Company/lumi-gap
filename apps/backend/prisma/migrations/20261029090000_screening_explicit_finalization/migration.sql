-- Extend the current protocol; preserve all reviews, snapshots and final decisions.
ALTER TABLE screening_settings
  ADD COLUMN review_mode varchar(24) NOT NULL DEFAULT 'INDEPENDENT' CHECK (review_mode IN ('SIMPLE','INDEPENDENT')),
  ADD COLUMN blind_review boolean NOT NULL DEFAULT true,
  ADD COLUMN resolution_policy varchar(24) NOT NULL DEFAULT 'ADJUDICATION' CHECK (resolution_policy IN ('CONSENSUS','ADJUDICATION'));
ALTER TABLE screening_settings DROP CONSTRAINT screening_settings_required_reviewers_check;
ALTER TABLE screening_settings ADD CONSTRAINT screening_settings_required_reviewers_check CHECK (required_reviewers BETWEEN 1 AND 10);
ALTER TABLE screening_settings ADD CONSTRAINT screening_settings_mode_count_check
  CHECK ((review_mode='SIMPLE' AND required_reviewers=1) OR (review_mode='INDEPENDENT' AND required_reviewers>=2));
ALTER TABLE screening_rounds ADD COLUMN finalizer_id uuid REFERENCES users(id);
ALTER TABLE screening_rounds DROP CONSTRAINT screening_rounds_status_check;
ALTER TABLE screening_rounds ADD CONSTRAINT screening_rounds_status_check
  CHECK (status IN ('NOT_REVIEWED','IN_REVIEW','NEEDS_RESOLUTION','AWAITING_FINALIZATION','INCLUDED','EXCLUDED'));
-- NULL on historical rounds means the project owner. Do not fabricate actors or votes.
ALTER TABLE project_papers ADD COLUMN proposal_reason text NOT NULL DEFAULT '';
