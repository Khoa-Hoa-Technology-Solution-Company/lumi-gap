-- Preserve legacy reviews and their revision IDs. Give older assignments the
-- same request lifecycle as new assignments without inventing a reviewer role.
WITH prepared AS (
  SELECT a.id AS assignment_id, gen_random_uuid() AS request_id,
    a.submission_id, s.project_id, s.created_by_id AS requester_id,
    a.artifact_revision_id, a.due_at, a.created_at, a.updated_at,
    COALESCE(h.template_version_id, t.active_version_id) AS template_version_id,
    CASE WHEN a.assigned_by_id = a.reviewer_id THEN 'OPEN_OPPORTUNITY'
      ELSE 'MANAGER_ASSIGNMENT' END AS origin,
    CASE WHEN a.status = 'cancelled' THEN 'CANCELLED'
      WHEN a.status = 'declined' THEN 'DECLINED'
      WHEN a.status = 'completed' THEN 'COMPLETED'
      WHEN a.status = 'assigned' THEN 'REQUESTED'
      WHEN h.status = 'SUBMITTED' AND EXISTS (
        SELECT 1 FROM review_revision_items i WHERE i.review_id = h.id AND i.status <> 'ACCEPTED'
      ) THEN 'REVISION_REQUESTED'
      WHEN h.status = 'DRAFT' THEN 'IN_REVIEW'
      ELSE 'ACCEPTED' END AS status
  FROM reviewer_assignments a
  JOIN submissions s ON s.id = a.submission_id
  JOIN LATERAL (
    SELECT active_version_id FROM review_templates
    WHERE source = 'SYSTEM' AND status = 'PUBLISHED' AND active AND active_version_id IS NOT NULL
    ORDER BY CASE WHEN submission_type = s.submission_type THEN 0
      WHEN submission_type = 'RESEARCH_PAPER' THEN 1 ELSE 2 END, created_at
    LIMIT 1
  ) t ON true
  LEFT JOIN LATERAL (
    SELECT id, template_version_id, status FROM human_reviews
    WHERE assignment_id = a.id ORDER BY round_number DESC LIMIT 1
  ) h ON true
  WHERE a.review_request_id IS NULL AND a.artifact_revision_id IS NOT NULL
), inserted AS (
  INSERT INTO review_requests (id, submission_id, project_id, requester_id,
    template_version_id, artifact_revision_id, origin, status, due_at, created_at, updated_at)
  SELECT request_id, submission_id, project_id, requester_id, template_version_id,
    artifact_revision_id, origin, status, due_at, created_at, updated_at FROM prepared
  RETURNING id
)
UPDATE reviewer_assignments a SET review_request_id = p.request_id
FROM prepared p JOIN inserted i ON i.id = p.request_id
WHERE a.id = p.assignment_id;
