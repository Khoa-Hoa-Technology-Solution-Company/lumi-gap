-- Additive transition. All ballots, discussion events and old arbitration packets remain intact.
ALTER TABLE screening_settings ALTER COLUMN resolution_policy SET DEFAULT 'CONSENSUS';
ALTER TABLE screening_settings ADD COLUMN consensus_window_hours INTEGER NOT NULL DEFAULT 48
  CHECK (consensus_window_hours BETWEEN 1 AND 336);
ALTER TABLE screening_rounds ADD COLUMN consensus_started_at TIMESTAMPTZ,
  ADD COLUMN consensus_deadline TIMESTAMPTZ;
ALTER TABLE screening_rounds DROP CONSTRAINT screening_rounds_status_check;
ALTER TABLE screening_rounds ADD CONSTRAINT screening_rounds_status_check CHECK (status IN
  ('NOT_REVIEWED','IN_REVIEW','NEEDS_RESOLUTION','NEEDS_MORE_INFO','ADJUDICATING',
   'AWAITING_FINALIZATION','INCLUDED','EXCLUDED','BACKGROUND','WAITING_FULLTEXT',
   'CONSENSUS_REQUIRED','CONSENSUS_IN_PROGRESS'));
ALTER TABLE screening_rounds ADD CONSTRAINT screening_consensus_deadline_check CHECK
  ((consensus_started_at IS NULL AND consensus_deadline IS NULL) OR
   (consensus_started_at IS NOT NULL AND consensus_deadline > consensus_started_at));
CREATE INDEX screening_consensus_due_idx ON screening_rounds(consensus_deadline)
  WHERE active AND status IN ('CONSENSUS_REQUIRED','CONSENSUS_IN_PROGRESS');
CREATE UNIQUE INDEX screening_consensus_confirmation_unique
  ON screening_audit(round_id, actor_id, (details->>'startedAt'))
  WHERE type = 'CONSENSUS_CONFIRMED';

ALTER TABLE screening_final_decisions DROP CONSTRAINT screening_resolution_type_check;
ALTER TABLE screening_final_decisions ADD CONSTRAINT screening_resolution_type_check CHECK
  (resolution_type IS NULL OR resolution_type IN ('AGREEMENT_FROM_REVIEWS', 'CONSENSUS_AFTER_DISCUSSION', 'ADJUDICATION', 'CONSENSUS_NOT_REACHED'));

-- Preserve the entire pre-transition protocol before upgrading only unfinished independent rounds.
INSERT INTO screening_audit(id, project_id, round_id, actor_id, type, details, result, created_at)
SELECT gen_random_uuid(), r.project_id, r.id, p.owner_id, 'CONSENSUS_WORKFLOW_MIGRATED',
  jsonb_build_object('previousSettings', r.settings, 'previousStatus', r.status, 'previousFinalizerId', r.finalizer_id,
    'policy', 'TWO_REVIEWER_CONSENSUS', 'windowHours', 48), '{}'::jsonb, CURRENT_TIMESTAMP
FROM screening_rounds r JOIN projects p ON p.id = r.project_id
WHERE r.active AND NOT r.legacy_needs_audit
  AND r.project_id IN (SELECT id FROM projects WHERE status NOT IN ('ARCHIVED','COMPLETED'))
  AND COALESCE(r.settings->>'reviewMode','INDEPENDENT') = 'INDEPENDENT'
  AND r.status NOT IN ('INCLUDED','EXCLUDED','BACKGROUND');

-- Unsupported historical cohorts require an explicit new round, not an invented second ballot.
UPDATE screening_rounds r SET legacy_needs_audit = true
WHERE r.active AND NOT r.legacy_needs_audit
  AND r.project_id IN (SELECT id FROM projects WHERE status NOT IN ('ARCHIVED','COMPLETED'))
  AND COALESCE(r.settings->>'reviewMode','INDEPENDENT') = 'INDEPENDENT'
  AND r.status NOT IN ('INCLUDED','EXCLUDED','BACKGROUND')
  AND (COALESCE(r.settings->>'requiredReviewers','2') <> '2'
       OR (SELECT count(*) FROM screening_assignments a WHERE a.round_id = r.id AND a.active) > 2);

-- Open independent disputes get a fresh 48-hour window on rollout, not an already expired one.
-- Sealed packets and grants are closed by the existing closeCase helper on the first authorized
-- read / scheduled maintenance. Closed cases remain accessible through the historical case API.
UPDATE screening_rounds r SET consensus_started_at = CURRENT_TIMESTAMP,
  consensus_deadline = CURRENT_TIMESTAMP + INTERVAL '48 hours',
  status = 'CONSENSUS_REQUIRED', finalizer_id = NULL, version = version + 1
WHERE r.active AND NOT r.legacy_needs_audit
  AND r.project_id IN (SELECT id FROM projects WHERE status NOT IN ('ARCHIVED','COMPLETED'))
  AND COALESCE(r.settings->>'reviewMode','INDEPENDENT') = 'INDEPENDENT'
  AND r.status IN ('NEEDS_RESOLUTION','NEEDS_MORE_INFO','ADJUDICATING')
  AND (SELECT count(*) FROM screening_assignments a
       WHERE a.round_id = r.id AND a.active AND a.submitted_at IS NOT NULL) = 2;

UPDATE screening_rounds SET settings = settings ||
  '{"workflowVersion":12,"consensusWindowHours":48,"resolutionPolicy":"CONSENSUS"}'::jsonb
WHERE active AND NOT legacy_needs_audit
  AND project_id IN (SELECT id FROM projects WHERE status NOT IN ('ARCHIVED','COMPLETED'))
  AND COALESCE(settings->>'reviewMode','INDEPENDENT') = 'INDEPENDENT'
  AND status NOT IN ('INCLUDED','EXCLUDED','BACKGROUND');
