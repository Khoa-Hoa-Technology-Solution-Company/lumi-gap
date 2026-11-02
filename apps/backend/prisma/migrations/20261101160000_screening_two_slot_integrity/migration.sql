BEGIN;

ALTER TABLE screening_rounds ADD COLUMN legacy_needs_audit boolean NOT NULL DEFAULT false;

-- Preserve every legacy assignment/review/final decision. Ambiguous cohorts require an
-- explicit new round; selecting two people from three would silently change the protocol.
WITH anomalies AS (
  SELECT r.id, r.project_id, r.settings, r.created_by_id,
    count(a.id) FILTER (WHERE a.active) AS assigned,
    count(a.id) FILTER (WHERE a.active AND a.submitted_at IS NOT NULL) AS completed
  FROM screening_rounds r LEFT JOIN screening_assignments a ON a.round_id = r.id
  WHERE r.active AND COALESCE(r.settings->>'reviewMode', 'INDEPENDENT') <> 'COLLABORATIVE'
  GROUP BY r.id
), flagged AS (
  UPDATE screening_rounds r SET legacy_needs_audit = true
  FROM anomalies a WHERE r.id = a.id AND (
    a.assigned > COALESCE((a.settings->>'requiredReviewers')::int, 2) OR
    (COALESCE(a.settings->>'reviewMode', 'INDEPENDENT') = 'SIMPLE' AND (a.settings->>'requiredReviewers')::int <> 1) OR
    (COALESCE(a.settings->>'reviewMode', 'INDEPENDENT') <> 'SIMPLE' AND COALESCE((a.settings->>'requiredReviewers')::int, 2) <> 2)
  ) RETURNING r.*
)
INSERT INTO screening_audit (id, project_id, round_id, actor_id, type, details)
SELECT gen_random_uuid(), f.project_id, f.id, p.owner_id, 'LEGACY_REVIEW_REQUIRED',
  jsonb_build_object('settings', f.settings, 'status', f.status, 'preserved', true,
    'assignments', (SELECT jsonb_agg(to_jsonb(a)) FROM screening_assignments a WHERE a.round_id = f.id),
    'action', 'Explicitly reopen a new round; preserve historical reviews')
FROM flagged f JOIN projects p ON p.id = f.project_id;

-- Future rounds use two reviewers. Keep explicitly configured one-reviewer exceptions
-- and existing collaborative projects. Auto-selected solo defaults are not consent.
INSERT INTO screening_audit (id, project_id, actor_id, type, details)
SELECT gen_random_uuid(), s.project_id, p.owner_id, 'FUTURE_RULES_MIGRATED',
  jsonb_build_object('previous', to_jsonb(s), 'requiredReviewers', 2,
    'appliesTo', 'FUTURE_ROUNDS', 'claimHours', 24, 'perUserLimit', null)
FROM screening_settings s JOIN projects p ON p.id = s.project_id
WHERE s.review_mode <> 'COLLABORATIVE' AND (s.required_reviewers NOT IN (1, 2) OR
  s.review_mode = 'INDEPENDENT' AND s.required_reviewers <> 2 OR
  s.review_mode = 'SIMPLE' AND NOT EXISTS (
    SELECT 1 FROM screening_audit a WHERE a.project_id = s.project_id AND a.type = 'CONFIGURED'
      AND a.details->>'reviewMode' = 'SIMPLE' AND a.details->>'requiredReviewers' = '1'));

UPDATE screening_settings s SET required_reviewers = 2, review_mode = 'INDEPENDENT',
  blind_review = true, consensus_policy = 'UNANIMOUS', version = version + 1
WHERE EXISTS (SELECT 1 FROM screening_audit a WHERE a.project_id = s.project_id
  AND a.type = 'FUTURE_RULES_MIGRATED');

-- Defense in depth. The application also serializes claims using the project lock.
-- Apply only to new snapshots; historical cohorts are preserved for audit.
CREATE FUNCTION enforce_screening_slot_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r screening_rounds%ROWTYPE; target_count int; occupied int;
BEGIN
  IF NOT NEW.active THEN RETURN NEW; END IF;
  SELECT * INTO r FROM screening_rounds WHERE id = NEW.round_id FOR UPDATE;
  IF COALESCE((r.settings->>'workflowVersion')::int, 0) < 6 OR r.settings->>'reviewMode' = 'COLLABORATIVE' THEN RETURN NEW; END IF;
  target_count := (r.settings->>'requiredReviewers')::int;
  IF target_count IS NULL OR (r.settings->>'reviewMode' = 'SIMPLE' AND target_count <> 1)
    OR (r.settings->>'reviewMode' <> 'SIMPLE' AND target_count <> 2) THEN
    RAISE EXCEPTION 'Invalid ordinary reviewer capacity' USING ERRCODE = '23514';
  END IF;
  SELECT count(*) INTO occupied FROM screening_assignments a
    WHERE a.round_id = NEW.round_id AND a.id <> NEW.id AND a.active
      AND (a.submitted_at IS NOT NULL OR a.due_at IS NULL OR a.due_at > clock_timestamp());
  IF (NEW.submitted_at IS NOT NULL OR NEW.due_at IS NULL OR NEW.due_at > clock_timestamp()) AND occupied >= target_count THEN
    RAISE EXCEPTION 'Ordinary reviewer slots are full' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER screening_slot_capacity BEFORE INSERT OR UPDATE ON screening_assignments
  FOR EACH ROW EXECUTE FUNCTION enforce_screening_slot_capacity();

CREATE INDEX screening_claim_expiry_idx ON screening_assignments(project_id, due_at)
  WHERE active AND submitted_at IS NULL AND due_at IS NOT NULL;
COMMIT;
