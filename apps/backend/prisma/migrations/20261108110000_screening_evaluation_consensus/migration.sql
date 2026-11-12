-- Version 13 uses the latest immutable ballot revision, not separate personal confirmations.
-- Preserve v12 confirmation events and finalized decisions as history. Never reset a deadline.
INSERT INTO screening_audit(id, project_id, round_id, actor_id, type, details, result, created_at)
SELECT gen_random_uuid(), r.project_id, r.id, p.owner_id, 'EVALUATION_CONSENSUS_ADOPTED',
  jsonb_build_object('previousSettings', r.settings, 'deadline', r.consensus_deadline,
    'policy', 'LATEST_REVIEWER_EVALUATIONS'), '{}'::jsonb, CURRENT_TIMESTAMP
FROM screening_rounds r JOIN projects p ON p.id = r.project_id
WHERE r.active AND NOT r.legacy_needs_audit AND p.status NOT IN ('ARCHIVED','COMPLETED')
  AND r.settings->>'reviewMode' = 'INDEPENDENT'
  AND r.status NOT IN ('INCLUDED','EXCLUDED','BACKGROUND');

UPDATE screening_rounds r SET settings = r.settings || '{"workflowVersion":13}'::jsonb,
  version = r.version + 1
FROM projects p WHERE p.id = r.project_id AND p.status NOT IN ('ARCHIVED','COMPLETED')
  AND r.active AND NOT r.legacy_needs_audit AND r.settings->>'reviewMode' = 'INDEPENDENT'
  AND r.status NOT IN ('INCLUDED','EXCLUDED','BACKGROUND');
