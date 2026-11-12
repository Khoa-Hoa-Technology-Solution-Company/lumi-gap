-- Retire only untouched full-text rounds automatically opened by the current
-- two-reviewer workflow. Preserve every round, ballot, decision and snapshot.
BEGIN;

CREATE TEMP TABLE single_round_acceptance ON COMMIT DROP AS
SELECT DISTINCT next.id AS next_id, previous.id AS previous_id,
       previous.project_id, previous.paper_id, previous.created_by_id
FROM screening_rounds next
JOIN screening_audit event ON event.round_id = next.id AND event.project_id = next.project_id
  AND event.type = 'STAGE_ADVANCED'
JOIN screening_rounds previous ON previous.id::text = event.details->>'previousRoundId'
  AND previous.project_id = next.project_id AND previous.paper_id = next.paper_id
  AND previous.number = next.number - 1
JOIN projects project ON project.id = next.project_id
JOIN LATERAL (
  SELECT decision FROM screening_final_decisions
  WHERE round_id = previous.id AND project_id = previous.project_id
  ORDER BY round_version DESC LIMIT 1
) final ON final.decision = 'INCLUDED'
WHERE next.active AND next.phase = 'FULL_TEXT' AND next.status = 'NOT_REVIEWED'
  AND next.unblinded_at IS NULL AND NOT next.legacy_needs_audit
  AND NOT previous.active AND previous.phase = 'TITLE_ABSTRACT'
  AND previous.status = 'INCLUDED' AND NOT previous.legacy_needs_audit
  AND COALESCE(previous.settings->>'workflowVersion', '0') IN ('5', '6', '7', '8', '9', '10')
  AND project.status NOT IN ('ARCHIVED', 'COMPLETED')
  AND event.details->>'automated' = 'true'
  AND COALESCE(event.details->>'provisional', 'false') = 'false'
  AND NOT EXISTS (SELECT 1 FROM screening_assignments WHERE round_id = next.id)
  AND NOT EXISTS (SELECT 1 FROM screening_adjudication_cases WHERE round_id = next.id)
  AND NOT EXISTS (SELECT 1 FROM screening_final_decisions WHERE round_id = next.id)
  AND NOT EXISTS (SELECT 1 FROM screening_audit WHERE round_id = next.id AND type <> 'STAGE_ADVANCED');

-- The partial unique index allows one active round per paper.
UPDATE screening_rounds SET active = false, version = version + 1
WHERE id IN (SELECT next_id FROM single_round_acceptance);
UPDATE screening_rounds SET active = true, version = version + 1
WHERE id IN (SELECT previous_id FROM single_round_acceptance);

INSERT INTO screening_audit (id, project_id, round_id, actor_id, type, details)
SELECT gen_random_uuid(), project_id, previous_id, created_by_id, 'SINGLE_ROUND_ACCEPTANCE',
       jsonb_build_object('retiredRoundId', next_id, 'reason', 'Two-reviewer acceptance completes screening',
                          'previousProtocolPreserved', true, 'workflowVersion', 10)
FROM single_round_acceptance;

UPDATE project_papers link
SET screening_status = 'INCLUDED', inclusion_reason = final.reason,
    exclusion_reason = NULL, exclusion_note = NULL,
    screened_at = final.created_at, screened_by_id = final.resolver_id,
    updated_at = GREATEST(now(), link.updated_at + interval '1 millisecond')
FROM screening_rounds round
JOIN LATERAL (
  SELECT decision, reason, created_at, resolver_id FROM screening_final_decisions
  WHERE round_id = round.id AND project_id = round.project_id
  ORDER BY round_version DESC LIMIT 1
) final ON final.decision = 'INCLUDED'
WHERE link.project_id = round.project_id AND link.paper_id = round.paper_id
  AND round.active AND round.status = 'INCLUDED' AND NOT round.legacy_needs_audit
  AND COALESCE(round.settings->>'workflowVersion', '0') IN ('5', '6', '7', '8', '9', '10')
  AND link.screening_status <> 'INCLUDED';

COMMIT;
